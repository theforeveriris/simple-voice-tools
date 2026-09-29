/**
 * 录音引擎（单例）
 * 负责麦克风采集、实时分析循环（音高 / 能量 / 共振峰）、
 * 实时数据缓冲供图表绘制，以及停止时生成可持久化的分析记录。
 */

import { detectPitchYin, rmsDb } from './pitch';
import { extractFormants } from './formants';
import type { AnalysisRecord, RecordSeries, VoiceStats } from '@/types';

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

export interface RecorderOptions {
  deviceId?: string;
  maxDurationSec?: number;
  onAutoStop?: () => void;
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

  private startTime = 0;
  private frameCount = 0;
  private bufT: number[] = [];
  private bufF0: number[] = [];
  private bufDb: number[] = [];
  private bufF1: number[] = [];
  private bufF2: number[] = [];
  private smoothF1: number | null = null;
  private smoothF2: number | null = null;

  private maxDurationSec = 0;
  private onAutoStop: (() => void) | null = null;
  private autoStopFired = false;

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

    this.startTime = performance.now();
    this.frameCount = 0;
    this.bufT = []; this.bufF0 = []; this.bufDb = []; this.bufF1 = []; this.bufF2 = [];
    this.smoothF1 = null; this.smoothF2 = null;
    this.lastPitch = null;
    this.maxDurationSec = opts.maxDurationSec ?? 0;
    this.onAutoStop = opts.onAutoStop ?? null;
    this.autoStopFired = false;

    this.loop();
  }

  /**
   * 停止录音并生成记录
   * @returns 录音有效时长不足 1 秒时返回 null
   */
  stop(): AnalysisRecord | null {
    if (!this.audioContext) return null;

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

    const series = toRecordSeries(this.bufT, this.bufF0, this.bufDb, this.bufF1, this.bufF2, STORAGE_DECIMATE);
    const durationSec = series.t.length > 0 ? series.t[series.t.length - 1] : 0;
    if (durationSec < 1 || series.t.length < 4) return null;

    const record: AnalysisRecord = {
      id: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
      createdAt: Date.now(),
      durationSec,
      sampleHz: series.t.length > 1 ? 1 / (series.t[1] - series.t[0]) : 30,
      series,
      stats: computeStats(series, 30),
    };

    // 清空缓冲，为下次录音做准备
    this.bufT = []; this.bufF0 = []; this.bufDb = []; this.bufF1 = []; this.bufF2 = [];
    return record;
  }

  /**
     * 采集与分析主循环（requestAnimationFrame 驱动，约 60fps）
     */
  private loop = (): void => {
    if (!this.analyser || !this.audioContext) return;
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

    this.bufT.push(now);
    this.bufF0.push(pitch ? pitch.freq : NaN);
    this.bufDb.push(db);
    this.bufF1.push(this.smoothF1 ?? NaN);
    this.bufF2.push(this.smoothF2 ?? NaN);
    this.frameCount++;
  };
}

/** 全局唯一录音引擎实例 */
export const recorder = new VoiceRecorder();

