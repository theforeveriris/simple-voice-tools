/**
 * 咝音分析器（/s/ 之刃，实验性）
 * 咝音（/s/ /z/ /x/ /sh/ 等摩擦音）的频谱重心（spectral centroid）直接关联
 * 音色的性别感知：/s/ 重心在 4kHz 上下偏男声取向，7–8kHz 以上偏女声取向。
 * 本模块从录音音频重新计算高频谱（管线 32kHz 采样、2048 点 FFT → 16kHz Nyquist），
 * 自动挑选咝音帧并输出重心统计与参考区间定位——变声训练的核心量化反馈。
 *
 * 咝音帧判定（高频能量判别，双条件）：
 *   - 高频带能量占比：4kHz 以上能量 / 全带能量 > 0.55（摩擦音的主体在高频）
 *   - 相对电平：帧 RMS dB 高于该录音中位电平 12dB 以上（排除纯底噪帧）
 * 参考区间（按训练方向，中心 ± 半宽，变声训练文献的常用口径，仅供训练参考）：
 *   - 女性化取向（mtf）：中心 7.5kHz，半宽 2.5kHz
 *   - 男性化取向（ftm）：中心 4.5kHz，半宽 2.0kHz
 */

import { fft } from './cpp';
import { PIPELINE_HZ } from './analysisPipeline';

/** 分析窗（样本数，2 的幂；32kHz 下 1024 = 32ms，频率分辨率 31.25Hz 足够重心统计） */
const WINDOW = 1024;
/** 帧移（样本）：32ms 窗 + 16ms 步 → ~62fps */
const HOP = 512;
/** 参与重心统计的频率下限（Hz）：低于此的谐波/基音能量不参与（咝音无基音，排除口误帧） */
const CENTROID_FMIN = 1000;
/** 高频带界（Hz）：4kHz 以上能量占比判据 */
const HF_BOUNDARY = 4000;
/** 高频能量占比阈值（超过则视为摩擦音主导帧） */
const HF_RATIO_MIN = 0.55;
/** 帧电平相对录音中位电平的最小高出量（dB），排除底噪 */
const LEVEL_MARGIN_DB = 12;
/** 候选咝音帧中最少保留数（避免长录音全被电平判据筛没） */
const MIN_FRAMES = 4;

export interface SibilanceStats {
  /** 参与统计的咝音帧数 */
  frames: number;
  /** 频谱重心（Hz，帧级中位数） */
  centroidHz: number;
  /** 重心分布的 P10 / P90（Hz） */
  p10Hz: number;
  p90Hz: number;
  /** 咝音段累计时长（秒，帧级估算） */
  totalSec: number;
  /** 参考区间定位：0 = 区间下沿，1 = 区间上沿；区间外可 <0 / >1 */
  refPos: number | null;
  /** 参考区间 [min, max]（Hz）；无训练方向时 null */
  refRange: [number, number] | null;
}

/** 训练方向 → 参考区间（中心 Hz, 半宽 Hz） */
export function sibilanceRefRange(goal: 'mtf' | 'ftm' | 'other' | undefined): [number, number] | null {
  if (goal === 'mtf') return [5000, 10000];
  if (goal === 'ftm') return [2500, 6500];
  return null;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  return n === 0 ? 0 : sorted[Math.floor(n / 2)];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * 管线 PCM（32kHz 单声道）→ 咝音统计。
 * 仅需要咝音统计的场景用本入口；不必跑完整管线。
 */
export function analyzeSibilance(
  pcm: Float32Array,
  goal: 'mtf' | 'ftm' | 'other' | undefined,
): SibilanceStats | null {
  if (pcm.length < WINDOW) return null;
  const binHz = PIPELINE_HZ / WINDOW;
  const bins = WINDOW / 2;

  // 每帧：RMS dB + 1kHz 以上重心 + 高频占比（一次 FFT 三样全出）
  interface Frame { db: number; centroid: number; hfRatio: number }
  const frames: Frame[] = [];
  const win = new Float32Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) {
    // Hann 窗：摩擦音分析不需要 Blackman 的深旁瓣，主瓣窄些对重心更友好
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WINDOW);
  }
  const re = new Float32Array(WINDOW);
  const im = new Float32Array(WINDOW);
  const centroidBinFrom = Math.max(1, Math.ceil(CENTROID_FMIN / binHz));
  const hfBinFrom = Math.ceil(HF_BOUNDARY / binHz);
  const frameSec = HOP / PIPELINE_HZ;

  for (let start = 0; start + WINDOW <= pcm.length; start += HOP) {
    let energy = 0;
    for (let i = 0; i < WINDOW; i++) {
      const s = pcm[start + i] * win[i];
      re[i] = s;
      im[i] = 0;
      energy += pcm[start + i] * pcm[start + i];
    }
    const db = 20 * Math.log10(Math.sqrt(energy / WINDOW) + 1e-12);
    fft(re, im);
    let sum = 0;
    let weighted = 0;
    let hf = 0;
    for (let b = centroidBinFrom; b < bins; b++) {
      const mag = Math.hypot(re[b], im[b]);
      sum += mag;
      weighted += mag * b;
      if (b >= hfBinFrom) hf += mag;
    }
    frames.push({
      db,
      centroid: sum > 0 ? (weighted / sum) * binHz : 0,
      hfRatio: sum > 0 ? hf / sum : 0,
    });
  }
  if (frames.length === 0) return null;

  // 电平中位数（底噪门限基准）
  const dbs = frames.map((f) => f.db).sort((a, b) => a - b);
  const medianDb = median(dbs);

  // 咝音帧：高频占比 + 电平双条件
  let cands = frames.filter((f) => f.hfRatio >= HF_RATIO_MIN && f.db >= medianDb + LEVEL_MARGIN_DB);
  // 兜底：帧太少时放宽电平（短促的 /s/ 峰值帧可能少于 MIN_FRAMES）
  if (cands.length < MIN_FRAMES) {
    cands = frames
      .filter((f) => f.hfRatio >= HF_RATIO_MIN)
      .sort((a, b) => b.db - a.db)
      .slice(0, MIN_FRAMES);
  }
  if (cands.length === 0) return null;

  const centroids = cands.map((f) => f.centroid).filter((c) => c > 0).sort((a, b) => a - b);
  if (centroids.length === 0) return null;

  const centroidHz = median(centroids);
  const refRange = sibilanceRefRange(goal);
  const refPos = refRange
    ? (centroidHz - refRange[0]) / (refRange[1] - refRange[0])
    : null;

  return {
    frames: centroids.length,
    centroidHz,
    p10Hz: percentile(centroids, 0.1),
    p90Hz: percentile(centroids, 0.9),
    totalSec: centroids.length * frameSec,
    refPos,
    refRange,
  };
}

/**
 * 录音音频 Blob → 咝音统计（decode + mixdown + 重采样 + 分析）。
 * 独立于完整管线：不落库、不改记录，分析页按需展示。
 */
export async function analyzeSibilanceAudio(
  audio: Blob,
  goal: 'mtf' | 'ftm' | 'other' | undefined,
): Promise<SibilanceStats | null> {
  const { audioToPipelinePcm } = await import('./reanalyze');
  const { pcm } = await audioToPipelinePcm(audio);
  return analyzeSibilance(pcm, goal);
}
