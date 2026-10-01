/**
 * 离线分析管线（纯函数，无 DOM 依赖）
 * 主线程回退与 Worker（analysisWorker.ts）共用同一实现。
 *
 * 逐帧（30fps、64ms 窗）：rmsDb / YIN 音高 / 隔帧 LPC 共振峰（同款 EMA 平滑）
 * → 逐帧 Blackman 加窗 FFT → 语谱频带量化；随后计算嗓音质量四项。
 */

import { detectPitchYin, rmsDb } from './pitch';
import { extractFormants } from './formants';
import { computeVoiceQuality } from './voiceQuality';
import { computeCpps, fft } from './cpp';
import { spectrumRowToBands } from './spectrogram';
import { SPEC_BANDS } from '@/constants';

/** 分析管线统一采样率（Hz）：兼顾 F2 覆盖与 YIN 计算量 */
export const PIPELINE_HZ = 32000;
/** 分析帧率（帧/秒）：与实时录音存储口径一致 */
export const FRAME_HZ = 30;
/** 分析窗长（样本）：64ms @32k，2 的幂便于 FFT */
export const FRAME_SAMPLES = 2048;
/** 进度回调节流（帧）：约每 100ms 上报一次 */
const PROGRESS_EVERY_FRAMES = 150;

/** 逐帧分析的原始缓冲（NaN = 该帧未检出；语谱行按帧序扁平存储） */
export interface FrameAnalysisBuffers {
  t: number[];
  f0: number[];
  db: number[];
  f1: number[];
  f2: number[];
  /** 语谱量化行扁平存储（specRows × SPEC_BANDS 字节） */
  specFlat: Uint8Array;
  specRows: number;
}

/** 嗓音质量四项（与 VoiceStats 对应字段同构） */
export interface VqMetrics {
  jitterPct: number | null;
  shimmerPct: number | null;
  hnrDb: number | null;
  cppsDb: number | null;
}

export interface FrameAnalysisResult extends FrameAnalysisBuffers {
  /** 嗓音质量四项（直接用管线 PCM 计算，与实时管线口径一致） */
  metrics: VqMetrics;
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

/**
 * 对管线采样率（32kHz 单声道）的 PCM 逐帧分析
 * @param onProgress 进度回调（0-1）
 */
export function analyzePcmFrames(
  pcm: Float32Array,
  onProgress?: (frac: number) => void,
): FrameAnalysisResult {
  const hop = Math.round(PIPELINE_HZ / FRAME_HZ);
  const frames = Math.max(0, Math.floor((pcm.length - FRAME_SAMPLES) / hop) + 1);

  const t: number[] = [];
  const f0: number[] = [];
  const db: number[] = [];
  const f1: number[] = [];
  const f2: number[] = [];
  const specFlat = new Uint8Array(Math.max(0, frames) * SPEC_BANDS);
  const { win: blackman, cg } = blackmanWindow(FRAME_SAMPLES);
  const fftRe = new Float32Array(FRAME_SAMPLES);
  const fftIm = new Float32Array(FRAME_SAMPLES);
  const specDb = new Float32Array(FRAME_SAMPLES / 2);
  const norm = 2 / (FRAME_SAMPLES * cg);
  const binHz = PIPELINE_HZ / FRAME_SAMPLES;
  const row = new Uint8Array(SPEC_BANDS);
  let smoothF1: number | null = null;
  let smoothF2: number | null = null;

  for (let k = 0; k < frames; k++) {
    const start = k * hop;
    const frame = pcm.subarray(start, start + FRAME_SAMPLES);
    const now = (start + FRAME_SAMPLES) / PIPELINE_HZ;

    const dbFrame = rmsDb(frame);
    const pitch = dbFrame > -55 ? detectPitchYin(frame, PIPELINE_HZ) : null;

    // 共振峰每 2 帧一次（LPC 开销较大），指数平滑系数与实时管线一致
    if (k % 2 === 0 && pitch) {
      const raw = extractFormants(frame, PIPELINE_HZ, dbFrame);
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
    spectrumRowToBands(specDb, binHz, row);
    specFlat.set(row, k * SPEC_BANDS);

    t.push(Math.round(now * 1000) / 1000);
    f0.push(pitch ? pitch.freq : NaN);
    db.push(dbFrame);
    f1.push(smoothF1 ?? NaN);
    f2.push(smoothF2 ?? NaN);

    if (onProgress && k % PROGRESS_EVERY_FRAMES === PROGRESS_EVERY_FRAMES - 1) {
      onProgress((k + 1) / frames);
    }
  }
  onProgress?.(1);

  return { t, f0, db, f1, f2, specFlat, specRows: frames, metrics: computeVqMetrics(pcm, PIPELINE_HZ) };
}

/** 嗓音质量四项（Jitter/Shimmer/HNR + CPPS），任意采样率的单声道 PCM */
export function computeVqMetrics(pcm: Float32Array, sampleRate: number): VqMetrics {
  const vq = computeVoiceQuality(pcm, sampleRate);
  const cppsDb = computeCpps(pcm, sampleRate);
  return { ...vq, cppsDb };
}
