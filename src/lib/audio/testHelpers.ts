/**
 * DSP 单测辅助信号发生器（纯函数，无副作用，供多个测试文件复用）
 * 所有随机性均由种子伪随机数驱动，保证测试确定性。
 */

/** mulberry32 种子伪随机数发生器（返回 0..1 均匀分布） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 正弦波（振幅默认 0.5） */
export function makeSine(
  freq: number,
  sampleRate: number,
  durSec: number,
  amp = 0.5,
): Float32Array {
  const n = Math.round(durSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

export interface PulseTrainOptions {
  f0: number;
  sampleRate: number;
  durSec: number;
  /** 脉冲峰值幅度（默认 0.5） */
  amp?: number;
  /** 脉冲位置抖动（± 比例，种子伪随机、有界不累积漂移） */
  jitterPct?: number;
  /** 脉冲幅度扰动（± 比例） */
  shimmerPct?: number;
  /** 汉宁包络脉冲宽度（样本，偶数），默认 1 = 单样本脉冲 */
  pulseWidth?: number;
  seed?: number;
}

/**
 * 脉冲串（理想声门脉冲激励）。
 * 位置抖动采用「有界位置噪声」：pos_k = k·T ± jitterPct·T·u_k，
 * 局部周期差 ≈ 二阶差分，避免随机游走式漂移破坏 YIN 周期性。
 */
export function makePulseTrain(opts: PulseTrainOptions): Float32Array {
  const {
    f0, sampleRate, durSec, amp = 0.5,
    jitterPct = 0, shimmerPct = 0, pulseWidth = 1, seed = 1,
  } = opts;
  const n = Math.round(durSec * sampleRate);
  const out = new Float32Array(n);
  const rand = mulberry32(seed);
  const period = sampleRate / f0;
  const halfW = pulseWidth >> 1;
  for (let k = 0; ; k++) {
    const ideal = k * period;
    if (ideal >= n) break;
    const center = Math.round(ideal + (jitterPct > 0 ? (rand() * 2 - 1) * jitterPct * period : 0));
    const a = amp * (1 + (shimmerPct > 0 ? (rand() * 2 - 1) * shimmerPct : 0));
    if (pulseWidth <= 1) {
      if (center >= 0 && center < n) out[center] = a;
    } else {
      for (let j = 0; j < pulseWidth; j++) {
        const idx = center - halfW + j;
        if (idx >= 0 && idx < n) {
          out[idx] += a * (0.5 - 0.5 * Math.cos((2 * Math.PI * j) / pulseWidth));
        }
      }
    }
  }
  return out;
}

/** 白噪声（种子确定性），缩放到指定 RMS */
export function makeWhiteNoise(n: number, seed: number, rms: number): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    out[i] = rand() * 2 - 1;
    sum += out[i] * out[i];
  }
  const cur = Math.sqrt(sum / n);
  const g = cur > 0 ? rms / cur : 0;
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}
