/**
 * 外部音频文件离线分析
 * 把手机录音 / 微信语音等外部音频拖进来，走与实时录音同一套分析管线
 * （YIN 音高 / LPC 共振峰 / 语谱频带 / 统计聚合 / 嗓音质量）出完整报告。
 *
 * 与实时管线的对应关系：
 *   解码任意容器（decodeAudioData）→ 统一重采样到 32kHz 单声道
 *   → 逐帧（30fps、64ms 窗）rmsDb / YIN / 隔帧共振峰（同款指数平滑）
 *   → 逐帧 Blackman 加窗 FFT → 语谱频带量化
 *   → computeStats / 靶标达成率 / Jitter / Shimmer / HNR / CPPS
 *
 * 32k 折中点：fs/4 = 8k 抽取率下 F2 覆盖到 3.4k，且 YIN 开销约为 48k 的 1/3，
 * 长音频也能在秒级出结果。分析上限 5 分钟（与实时最长档一致），超出截断。
 */

import { computeStats, computeInTargetPct, toRecordSeries, toRecordSpec } from './recorder';
import { detectPitchYin, rmsDb } from './pitch';
import { extractFormants } from './formants';
import { computeVoiceQuality } from './voiceQuality';
import { computeCpps, fft } from './cpp';
import { spectrumRowToBands } from './spectrogram';
import { SPEC_BANDS } from '@/constants';
import type { AnalysisRecord } from '@/types';

/** 分析管线统一采样率（Hz）：兼顾 F2 覆盖与 YIN 计算量 */
const PIPELINE_HZ = 32000;
/** 分析帧率（帧/秒）：与实时录音存储口径一致 */
const FRAME_HZ = 30;
/** 分析窗长（样本）：64ms @32k，2 的幂便于 FFT */
const FRAME_SAMPLES = 2048;
/** 单次导入的最长分析时长（秒）：超出部分截断 */
export const IMPORT_MAX_SEC = 300;
/** 时长预检上限（秒）：超过直接拒绝，避免超长文件解码爆内存 */
const PROBE_MAX_SEC = 600;
/** 进度回调节流（帧）：约每 100ms 让出主线程一次 */
const YIELD_EVERY_FRAMES = 150;

/** 导入失败原因（调用方据此映射提示文案） */
export type ImportFailReason = 'decode' | 'probe' | 'tooShort' | 'tooLong';

/** erasableSyntaxOnly 下不能用参数属性，改用显式字段 */
export class AudioImportError extends Error {
  reason: ImportFailReason;
  constructor(reason: ImportFailReason) {
    super(`audio import failed: ${reason}`);
    this.reason = reason;
  }
}

/** 由异常映射 toast 文案键（保持本模块不依赖 i18n） */
export function importErrorKey(err: unknown): 'toast.importAudioDecodeFail' | 'toast.importAudioTooShort' | 'toast.importAudioTooLong' {
  const reason = err instanceof AudioImportError ? err.reason : 'decode';
  if (reason === 'tooShort') return 'toast.importAudioTooShort';
  if (reason === 'tooLong') return 'toast.importAudioTooLong';
  return 'toast.importAudioDecodeFail';
}

export interface AnalyzeAudioOptions {
  /** 训练靶标目标区间（启用时统计达成率写入 stats） */
  targetRange?: [number, number] | null;
  /** 分析进度回调（0-1） */
  onProgress?: (frac: number) => void;
  /** 是否保留原音频用于回放（默认保留；关闭设置时不入库） */
  saveAudio?: boolean;
}

export interface AnalyzeAudioResult {
  record: AnalysisRecord;
  /** 原始音频（saveAudio = false 时为 null） */
  audio: Blob | null;
  /** 是否因超过上限被截断 */
  truncated: boolean;
}

/** 用 <audio> 元素轻量探测时长（秒），读不出（如流式 webm）返回 0 */
function probeDurationSec(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    const done = (sec: number) => {
      el.onloadedmetadata = null;
      el.onerror = null;
      URL.revokeObjectURL(url);
      resolve(sec);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(isFinite(el.duration) && el.duration > 0 ? el.duration : 0);
    el.onerror = () => done(0);
    el.src = url;
  });
}

/** 多声道混合为单声道（截取前 maxSec 秒） */
function mixdown(decoded: AudioBuffer, maxSec: number): Float32Array<ArrayBuffer> {
  const len = Math.min(decoded.length, Math.ceil(maxSec * decoded.sampleRate));
  const chs = decoded.numberOfChannels;
  const out = new Float32Array(len);
  for (let c = 0; c < chs; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i] / chs;
  }
  return out;
}

/** 重采样到管线采样率（OfflineAudioContext，线性插值质量足够分析用） */
async function resample(pcm: Float32Array<ArrayBuffer>, fromHz: number): Promise<Float32Array<ArrayBuffer>> {
  const targetLen = Math.max(1, Math.ceil((pcm.length / fromHz) * PIPELINE_HZ));
  const off = new OfflineAudioContext(1, targetLen, PIPELINE_HZ);
  const buf = off.createBuffer(1, pcm.length, fromHz);
  buf.copyToChannel(pcm, 0);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start(0);
  return (await off.startRendering()).getChannelData(0);
}

/** Blackman 窗（与 AnalyserNode 默认窗一致）+ 相干增益 */
function blackmanWindow(n: number): { win: Float32Array; cg: number } {
  const win = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    win[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / n) + 0.08 * Math.cos((4 * Math.PI * i) / n);
    sum += win[i];
  }
  return { win, cg: sum / n };
}

/** 让出主线程（长音频逐帧分析时保持 UI 可响应） */
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * 分析一个外部音频文件，产出与录音完全同构的分析记录
 * @throws AudioImportError（decode / probe / tooShort / tooLong）
 */
export async function analyzeAudioFile(
  file: File,
  opts: AnalyzeAudioOptions = {},
): Promise<AnalyzeAudioResult> {
  // 1. 时长预检：超长文件直接拒绝，避免整段解码爆内存
  const probeSec = await probeDurationSec(file);
  if (probeSec > PROBE_MAX_SEC) throw new AudioImportError('tooLong');

  // 2. 解码（任意浏览器支持的容器/编码）
  let decoded: AudioBuffer;
  try {
    const raw = await file.arrayBuffer();
    const decodeCtx = new AudioContext();
    try {
      decoded = await decodeCtx.decodeAudioData(raw);
    } finally {
      void decodeCtx.close();
    }
  } catch {
    throw new AudioImportError('decode');
  }
  if (!isFinite(decoded.duration) || decoded.duration < 1) throw new AudioImportError('tooShort');

  const truncated = decoded.duration > IMPORT_MAX_SEC + 0.5;
  const useSec = Math.min(decoded.duration, IMPORT_MAX_SEC);

  // 3. 单声道化 + 统一重采样
  let pcm = mixdown(decoded, useSec);
  if (decoded.sampleRate !== PIPELINE_HZ) {
    pcm = await resample(pcm, decoded.sampleRate);
  }

  // 4. 逐帧分析（与实时管线同款节流与平滑）
  const hop = Math.round(PIPELINE_HZ / FRAME_HZ);
  const frames = Math.max(0, Math.floor((pcm.length - FRAME_SAMPLES) / hop) + 1);
  if (frames < 4) throw new AudioImportError('tooShort');

  const bufT: number[] = [];
  const bufF0: number[] = [];
  const bufDb: number[] = [];
  const bufF1: number[] = [];
  const bufF2: number[] = [];
  const bufSpec: Uint8Array[] = [];
  const { win: blackman, cg } = blackmanWindow(FRAME_SAMPLES);
  const fftRe = new Float32Array(FRAME_SAMPLES);
  const fftIm = new Float32Array(FRAME_SAMPLES);
  const specDb = new Float32Array(FRAME_SAMPLES / 2);
  const norm = 2 / (FRAME_SAMPLES * cg);
  const binHz = PIPELINE_HZ / FRAME_SAMPLES;
  let smoothF1: number | null = null;
  let smoothF2: number | null = null;

  for (let k = 0; k < frames; k++) {
    const start = k * hop;
    const frame = pcm.subarray(start, start + FRAME_SAMPLES);
    const now = (start + FRAME_SAMPLES) / PIPELINE_HZ;

    const db = rmsDb(frame);
    const pitch = db > -55 ? detectPitchYin(frame, PIPELINE_HZ) : null;

    // 共振峰每 2 帧一次（LPC 开销较大），指数平滑系数与实时管线一致
    if (k % 2 === 0 && pitch) {
      const raw = extractFormants(frame, PIPELINE_HZ, db);
      smoothF1 = raw.f1 != null ? (smoothF1 ?? raw.f1) * 0.45 + raw.f1 * 0.55 : null;
      smoothF2 = raw.f2 != null ? (smoothF2 ?? raw.f2) * 0.45 + raw.f2 * 0.55 : null;
    } else if (!pitch) {
      smoothF1 = null;
      smoothF2 = null;
    }

    // 语谱频带：Blackman 加窗 FFT → dB → 对数量化（与 AnalyserNode 口径对齐）
    for (let i = 0; i < FRAME_SAMPLES; i++) {
      fftRe[i] = frame[i] * blackman[i];
      fftIm[i] = 0;
    }
    fft(fftRe, fftIm);
    for (let bin = 0; bin < specDb.length; bin++) {
      const mag = Math.hypot(fftRe[bin], fftIm[bin]) * norm;
      specDb[bin] = 20 * Math.log10(mag + 1e-12);
    }
    const row = new Uint8Array(SPEC_BANDS);
    spectrumRowToBands(specDb, binHz, row);

    bufT.push(Math.round(now * 1000) / 1000);
    bufF0.push(pitch ? pitch.freq : NaN);
    bufDb.push(db);
    bufF1.push(smoothF1 ?? NaN);
    bufF2.push(smoothF2 ?? NaN);
    bufSpec.push(row);

    if (k % YIELD_EVERY_FRAMES === YIELD_EVERY_FRAMES - 1) {
      opts.onProgress?.((k + 1) / frames);
      await yieldToUi();
    }
  }
  opts.onProgress?.(1);

  // 5. 聚合落库结构（复用实时管线的序列化与统计）
  const series = toRecordSeries(bufT, bufF0, bufDb, bufF1, bufF2, 1);
  const durationSec = series.t.length > 0 ? series.t[series.t.length - 1] : 0;
  if (durationSec < 1 || series.t.length < 4) throw new AudioImportError('tooShort');
  const sampleHz = series.t.length > 1 ? 1 / (series.t[1] - series.t[0]) : FRAME_HZ;
  const stats = computeStats(series, sampleHz);
  const inTargetPct = computeInTargetPct(series, opts.targetRange ?? null);
  if (inTargetPct != null) stats.inTargetPct = inTargetPct;

  // 嗓音质量四项直接用管线 PCM（与实时管线口径一致，32k 足够）
  const vq = computeVoiceQuality(pcm, PIPELINE_HZ);
  const cppsDb = computeCpps(pcm, PIPELINE_HZ);

  const note = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 60);
  const spec = specData(bufSpec);
  const record: AnalysisRecord = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    createdAt: Date.now(),
    durationSec,
    sampleHz,
    series,
    stats: { ...stats, ...vq, cppsDb },
    ...(note ? { note } : {}),
    ...(spec ? { spec } : {}),
  };

  return { record, audio: opts.saveAudio === false ? null : file, truncated };
}

/** 语谱行编码（降采样率 1：导入序列本身就按 30fps 存储） */
function specData(rows: Uint8Array[]): { bands: number; data: string } | undefined {
  const data = toRecordSpec(rows, 1);
  return data ? { bands: SPEC_BANDS, data } : undefined;
}

/* ------------------------------ PWA Share Target ------------------------------ */

/** Service Worker 存放系统分享文件的位置（与 public/sw-custom.js 约定一致） */
const SHARE_CACHE = 'svt-share-target';
const SHARE_ENTRY = 'shared-audio';

/**
 * 取回「分享到本应用」的音频文件（存在即取走并清除缓存）
 * Service Worker 把 POST 分享的文件暂存在 Cache API 后 303 重定向到应用，
 * 应用启动时检测 ?share-target=1 并调用本函数。无则返回 null。
 */
export async function takeSharedFile(): Promise<File | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match(SHARE_ENTRY);
    if (!res) return null;
    await cache.delete(SHARE_ENTRY);
    const blob = await res.blob();
    if (blob.size === 0) return null;
    const name = decodeURIComponent(res.headers.get('x-file-name') ?? 'shared-audio');
    return new File([blob], name, { type: blob.type || 'audio/webm' });
  } catch {
    return null;
  }
}
