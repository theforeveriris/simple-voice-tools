/**
 * 录音引擎（单例）
 * 负责麦克风采集、实时分析循环（音高 / 能量 / 共振峰 / 语谱频带）、
 * 实时数据缓冲供图表绘制，以及停止时生成可持久化的分析记录。
 * 同时用 MediaRecorder 抓取压缩音频，停止后解码 PCM 计算
 * 嗓音质量指标（Jitter / Shimmer / HNR）并返回音频 Blob 供持久化。
 */

import { detectPitchYin, rmsDb } from './pitch';
import { extractFormants } from './formants';
import { computeVoiceQuality } from './voiceQuality';
import { computeCpps } from './cpp';
import { spectrumRowToBands, base64FromBytes } from './spectrogram';
import { SPEC_BANDS, SPEC_MAX_ROWS } from '@/constants';
import type { AnalysisRecord, RecordSeries, TestMode, VoiceStats } from '@/types';

/** 序列降采样倍率：60fps 采集 → 约 30Hz 存储 */
const STORAGE_DECIMATE = 2;
/** 共振峰计算节流：每 N 帧计算一次（LPC 开销较大） */
const FORMANT_EVERY = 2;

/**
 * 由数据序列聚合统计信息
 */
export function computeStats(series: RecordSeries, sampleHz: number): VoiceStats {
  const durationSec = series.t.length > 0 ? series.t[series.t.length - 1] : 0;
  const f0s: number[] = [];
  const f1s: number[] = [];
  const f2s: number[] = [];
  let voiced = 0;

  for (let i = 0; i < series.t.length; i++) {
    const f0 = series.f0[i];
    if (f0 != null && f0 > 0) {
      f0s.push(f0);
      voiced++;
    }
    const f1 = series.f1[i];
    if (f1 != null) f1s.push(f1);
    const f2 = series.f2[i];
    if (f2 != null) f2s.push(f2);
  }

  const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
  const pct = (arr: number[], p: number) =>
    arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
  const mean = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const sf0 = sorted(f0s);
  const avgF0 = mean(f0s);
  const stdF0 = f0s.length
    ? Math.sqrt(mean(f0s.map((f) => (f - avgF0) * (f - avgF0))))
    : 0;

  let male = 0, female = 0, transition = 0;
  for (const f of f0s) {
    if (f >= 85 && f < 165) male++;
    else if (f >= 165 && f < 180) transition++;
    else if (f >= 180 && f <= 255) female++;
  }

  const rmsVals = series.rmsDb;

  return {
    durationSec,
    sampleHz,
    totalSamples: series.t.length,
    voicedSamples: voiced,
    avgF0,
    medianF0: pct(sf0, 0.5),
    minF0: sf0[0] ?? 0,
    maxF0: sf0[sf0.length - 1] ?? 0,
    p10F0: pct(sf0, 0.1),
    p90F0: pct(sf0, 0.9),
    stdF0,
    malePct: voiced ? Math.round((male / voiced) * 100) : 0,
    femalePct: voiced ? Math.round((female / voiced) * 100) : 0,
    transitionPct: voiced ? Math.round((transition / voiced) * 100) : 0,
    avgF1: f1s.length ? mean(f1s) : null,
    avgF2: f2s.length ? mean(f2s) : null,
    f1Range: f1s.length ? [Math.min(...f1s), Math.max(...f1s)] : null,
    f2Range: f2s.length ? [Math.min(...f2s), Math.max(...f2s)] : null,
    avgDb: mean(rmsVals),
    peakDb: rmsVals.length ? Math.max(...rmsVals) : -90,
    jitterPct: null,
    shimmerPct: null,
    hnrDb: null,
    cppsDb: null,
  };
}

/** 将内部缓冲（NaN 缺口）转为可序列化序列（null 缺口），并降采样 */
function toRecordSeries(
  t: number[], f0: number[], db: number[], f1: number[], f2: number[],
  keepEvery: number,
): RecordSeries {
  const s: RecordSeries = { t: [], f0: [], rmsDb: [], f1: [], f2: [] };
  for (let i = 0; i < t.length; i += keepEvery) {
    s.t.push(Math.round(t[i] * 1000) / 1000);
    s.f0.push(f0[i] >= 0 && f0[i] < Infinity ? Math.round(f0[i] * 10) / 10 : null);
    s.rmsDb.push(Math.round(db[i] * 10) / 10);
    s.f1.push(f1[i] >= 0 && f1[i] < Infinity ? Math.round(f1[i]) : null);
    s.f2.push(f2[i] >= 0 && f2[i] < Infinity ? Math.round(f2[i]) : null);
  }
  return s;
}

/** 将逐帧语谱行降采样（与分析序列对齐）、截断并编码为 base64 */
function toRecordSpec(rows: Uint8Array[], keepEvery: number): string | undefined {
  if (rows.length === 0) return undefined;
  const kept: Uint8Array[] = [];
  for (let i = 0; i < rows.length && kept.length < SPEC_MAX_ROWS; i += keepEvery) {
    kept.push(rows[i]);
  }
  const flat = new Uint8Array(kept.length * SPEC_BANDS);
  for (let r = 0; r < kept.length; r++) flat.set(kept[r], r * SPEC_BANDS);
  return base64FromBytes(flat);
}

export interface RecorderOptions {
  deviceId?: string;
  maxDurationSec?: number;
  onAutoStop?: () => void;
  /** 本次录音的测试模式（写入记录） */
  mode?: TestMode;
  /** 是否抓取录音音频（设置关闭时跳过，嗓音质量指标将不可用） */
  saveAudio?: boolean;
}

/**
 * 实时数据快照（供图表每帧读取）
 */
export interface LiveSeries {
  t: number[];
  f0: number[];    // NaN = 未检出
  rmsDb: number[];
  f1: number[];
  f2: number[];
  elapsedSec: number;
}

/** 按浏览器支持度挑选录音容器（Chrome/Firefox: webm-opus；Safari: mp4-aac） */
function pickAudioMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* 忽略个别浏览器 isTypeSupported 抛错 */
    }
  }
  return undefined;
}

/**
 * 录音引擎
 */
class VoiceRecorder {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private rafId: number | null = null;
  private timeBuf = new Float32Array(4096);
  private freqBuf: Float32Array<ArrayBuffer> | null = null;

  private startTime = 0;
  private frameCount = 0;
  private bufT: number[] = [];
  private bufF0: number[] = [];
  private bufDb: number[] = [];
  private bufF1: number[] = [];
  private bufF2: number[] = [];
  private bufSpec: Uint8Array[] = [];
  private smoothF1: number | null = null;
  private smoothF2: number | null = null;

  private maxDurationSec = 0;
  private onAutoStop: (() => void) | null = null;
  private autoStopFired = false;
  private pendingMode: TestMode | undefined;

  private mediaRecorder: MediaRecorder | null = null;
  private mediaChunks: Blob[] = [];
  /** MediaRecorder.stop() 后数据落盘完成的信号 */
  private mediaStopped: Promise<void> | null = null;

  /** 是否正在录音 */
  isRecording(): boolean {
    return this.audioContext !== null;
  }

  /** 读取实时序列快照（数组仍在增长，图表按需截取） */
  getLive(): LiveSeries {
    return {
      t: this.bufT,
      f0: this.bufF0,
      rmsDb: this.bufDb,
      f1: this.bufF1,
      f2: this.bufF2,
      elapsedSec: this.bufT.length > 0 ? this.bufT[this.bufT.length - 1] : 0,
    };
  }

  /** 最近一帧的检测结果（供右上角实时读数） */
  lastPitch: { freq: number; prob: number } | null = null;

  /**
   * 启动录音与分析
   */
  async start(opts: RecorderOptions = {}): Promise<void> {
    if (this.audioContext) return;

    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(opts.deviceId ? { deviceId: { exact: opts.deviceId } } : {}),
      },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    this.stream = stream;
    this.audioContext = ctx;
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = this.timeBuf.length;
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
    this.freqBuf = new Float32Array(this.analyser.frequencyBinCount);

    // 音频抓取（可选）：失败不影响分析主链路
    this.mediaRecorder = null;
    this.mediaChunks = [];
    this.mediaStopped = null;
    if (opts.saveAudio !== false) {
      const mimeType = pickAudioMime();
      try {
        const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.mediaChunks.push(e.data);
        };
        mr.onerror = () => {
          this.mediaRecorder = null;
        };
        mr.start(1000);
        this.mediaRecorder = mr;
      } catch (err) {
        console.warn('MediaRecorder 不可用，本次不保存音频:', err);
      }
    }

    this.startTime = performance.now();
    this.frameCount = 0;
    this.bufT = []; this.bufF0 = []; this.bufDb = []; this.bufF1 = []; this.bufF2 = [];
    this.bufSpec = [];
    this.smoothF1 = null; this.smoothF2 = null;
    this.lastPitch = null;
    this.maxDurationSec = opts.maxDurationSec ?? 0;
    this.onAutoStop = opts.onAutoStop ?? null;
    this.autoStopFired = false;
    this.pendingMode = opts.mode;

    this.loop();
  }

  /**
   * 停止录音并生成记录（不含嗓音质量指标，见 finishRecord）
   * @returns 录音有效时长不足 1 秒时返回 null
   */
  stop(): AnalysisRecord | null {
    if (!this.audioContext) return null;

    // 音频收尾：stop 后数据在 onstop 中冲刷完成，finishRecord 中等待
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaStopped = new Promise<void>((resolve) => {
        const mr = this.mediaRecorder as MediaRecorder;
        mr.addEventListener('stop', () => resolve(), { once: true });
        try {
          mr.stop();
        } catch {
          resolve();
        }
      });
    }

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.source?.disconnect();
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.audioContext.close();
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.freqBuf = null;

    const series = toRecordSeries(this.bufT, this.bufF0, this.bufDb, this.bufF1, this.bufF2, STORAGE_DECIMATE);
    const durationSec = series.t.length > 0 ? series.t[series.t.length - 1] : 0;
    const specData = toRecordSpec(this.bufSpec, STORAGE_DECIMATE);
    // 清空缓冲，为下次录音做准备
    this.bufT = []; this.bufF0 = []; this.bufDb = []; this.bufF1 = []; this.bufF2 = [];
    this.bufSpec = [];
    if (durationSec < 1 || series.t.length < 4) {
      this.mediaChunks = [];
      return null;
    }

    const sampleHz = series.t.length > 1 ? 1 / (series.t[1] - series.t[0]) : 30;
    const record: AnalysisRecord = {
      id: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
      createdAt: Date.now(),
      durationSec,
      sampleHz,
      series,
      stats: computeStats(series, sampleHz),
      ...(this.pendingMode ? { mode: this.pendingMode } : {}),
      ...(specData ? { spec: { bands: SPEC_BANDS, data: specData } } : {}),
    };
    this.pendingMode = undefined;
    return record;
  }

  /**
   * 录音收尾：等待音频数据冲刷，解码 PCM 计算嗓音质量指标。
   * 解码失败时保留曲线统计继续落库，仅嗓音质量为空。
   */
  async finishRecord(record: AnalysisRecord): Promise<{ record: AnalysisRecord; audio: Blob | null }> {
    const chunks = this.mediaChunks;
    const mimeType = this.mediaRecorder?.mimeType ?? 'audio/webm';
    this.mediaChunks = [];
    this.mediaRecorder = null;
    if (this.mediaStopped) {
      await Promise.race([this.mediaStopped, new Promise<void>((r) => setTimeout(r, 2000))]);
      this.mediaStopped = null;
    }
    if (chunks.length === 0) return { record, audio: null };

    try {
      const blob = new Blob(chunks, { type: mimeType });
      const buf = await blob.arrayBuffer();
      const ctx = new AudioContext();
      const audioBuffer = await ctx.decodeAudioData(buf);
      void ctx.close();
      const pcm = audioBuffer.getChannelData(0);
      const vq = computeVoiceQuality(pcm, audioBuffer.sampleRate);
      const cppsDb = computeCpps(pcm, audioBuffer.sampleRate);
      return {
        record: { ...record, stats: { ...record.stats, ...vq, cppsDb } },
        audio: blob,
      };
    } catch (err) {
      console.error('录音音频处理失败（嗓音质量不可用）:', err);
      return { record, audio: null };
    }
  }

  /**
     * 采集与分析主循环（requestAnimationFrame 驱动，约 60fps）
     */
  private loop = (): void => {
    if (!this.analyser || !this.audioContext || !this.freqBuf) return;
    this.rafId = requestAnimationFrame(this.loop);

    // 最长时长自动停止
    if (this.maxDurationSec > 0 && !this.autoStopFired) {
      const elapsed = (performance.now() - this.startTime) / 1000;
      if (elapsed >= this.maxDurationSec) {
        this.autoStopFired = true;
        this.onAutoStop?.();
        return;
      }
    }

    this.analyser.getFloatTimeDomainData(this.timeBuf);
    const db = rmsDb(this.timeBuf);
    const now = (performance.now() - this.startTime) / 1000;

    // 音高（每帧）
    const pitch = db > -55 ? detectPitchYin(this.timeBuf, this.audioContext.sampleRate) : null;
    this.lastPitch = pitch ? { freq: pitch.freq, prob: pitch.prob } : null;

    // 共振峰（每 2 帧一次，带指数平滑）
    if (this.frameCount % FORMANT_EVERY === 0 && pitch) {
      const raw = extractFormants(this.timeBuf, this.audioContext.sampleRate, db);
      // 指数平滑减少帧间抖动
      this.smoothF1 = raw.f1 != null ? (this.smoothF1 ?? raw.f1) * 0.45 + raw.f1 * 0.55 : null;
      this.smoothF2 = raw.f2 != null ? (this.smoothF2 ?? raw.f2) * 0.45 + raw.f2 * 0.55 : null;
    } else if (!pitch) {
      // 无声帧打断平滑链，避免跨哑音段拉直线
      this.smoothF1 = null;
      this.smoothF2 = null;
    }

    // 语谱频带（每帧）
    this.analyser.getFloatFrequencyData(this.freqBuf);
    const row = new Uint8Array(SPEC_BANDS);
    const binHz = this.audioContext.sampleRate / (this.freqBuf.length * 2);
    spectrumRowToBands(this.freqBuf, binHz, row);

    this.bufT.push(now);
    this.bufF0.push(pitch ? pitch.freq : NaN);
    this.bufDb.push(db);
    this.bufF1.push(this.smoothF1 ?? NaN);
    this.bufF2.push(this.smoothF2 ?? NaN);
    this.bufSpec.push(row);
    this.frameCount++;
  };
}

/** 全局唯一录音引擎实例 */
export const recorder = new VoiceRecorder();
