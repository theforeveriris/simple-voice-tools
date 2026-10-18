/**
 * 共鸣感知指标：F2−F1 间距与谱倾斜
 *
 * - F2−F1 间距（Hz）：有声帧的 (F2 − F1) 帧级统计。女性化共鸣的核心量化：
 *   收窄间距（提高 F2、压低 F1）= 元音空间整体前移。逐帧相减而非均值相减，
 *   避免把不同帧的开口状态（F1）与舌位（F2）错误配对。
 * - 谱倾斜（dB/octave）：有声帧幅度谱对 log2 频率的线性回归斜率。
 *   负得越多 = 高频能量衰减越快 = 音色越"暗/气"；偏平 = 明亮。
 *
 * 两者都是纯函数，输入来自分析管线的帧序列 / 逐帧 dB 谱，供
 * analyzePcmFrames（管线内）与 computeStats（帧序列聚合）消费。
 */

/** 谱倾斜回归的频段（Hz）：基波区非线性强、5kHz 以上能量弱噪声大，剔除两端 */
export const TILT_MIN_HZ = 200;
export const TILT_MAX_HZ = 5000;

/** 帧级 F2−F1 间距数组（同帧检出且有序才有效）；纯函数可单测 */
export function f2f1Gaps(f1: (number | null)[], f2: (number | null)[]): number[] {
  const gaps: number[] = [];
  for (let i = 0; i < f1.length; i++) {
    const a = f1[i];
    const b = f2[i];
    if (a == null || b == null || !isFinite(a) || !isFinite(b)) continue;
    const gap = b - a;
    if (gap > 0) gaps.push(gap);
  }
  return gaps;
}

/**
 * 一帧 dB 谱的谱倾斜：对 [TILT_MIN_HZ, TILT_MAX_HZ] 内的 bin 做
 * dB ~ log2(Hz) 最小二乘回归，返回斜率（dB/octave）。
 * @param specDb 全谱 dB（bin i 的中心频率 = i * binHz）
 * @param binHz 每 bin 的频率宽度
 */
export function frameSpectralTilt(specDb: Float32Array, binHz: number): number | null {
  const lo = Math.max(1, Math.ceil(TILT_MIN_HZ / binHz));
  const hi = Math.min(specDb.length - 1, Math.floor(TILT_MAX_HZ / binHz));
  if (hi - lo < 8) return null; // 频段内 bin 太少（不应发生，防呆）

  // 最小二乘：x = log2(f)，y = dB
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let bin = lo; bin <= hi; bin++) {
    const x = Math.log2(bin * binHz);
    const y = specDb[bin];
    n++;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null;
  return (n * sxy - sx * sy) / denom;
}

/** 间距/倾斜统计（与 VoiceStats 字段同构，无有效帧时为 null） */
export interface ResonanceStats {
  /** F2−F1 间距均值（Hz） */
  f2f1GapHz: number | null;
  /** F2−F1 间距中位数（Hz） */
  f2f1GapMedianHz: number | null;
  /** 谱倾斜均值（dB/octave；越负越暗） */
  spectralTiltDbOct: number | null;
}

/** 从帧级间距聚合（computeStats 与管线聚合共用） */
export function aggregateResonance(gaps: number[], tilts: number[]): ResonanceStats {
  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const gapsSorted = [...gaps].sort((a, b) => a - b);
  return {
    f2f1GapHz: gaps.length ? mean(gaps) : null,
    f2f1GapMedianHz: gaps.length ? gapsSorted[Math.floor(gapsSorted.length / 2)] : null,
    spectralTiltDbOct: tilts.length ? mean(tilts) : null,
  };
}
