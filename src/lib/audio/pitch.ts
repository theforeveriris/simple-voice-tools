/**
 * YIN 音高检测
 * 基于差分函数 + 累积均值归一化（CMND）+ 抛物线插值，
 * 相比旧的频谱谐波方案可输出亚赫兹级精度的连续基频，
 * 适合绘制平滑的实时音高曲线。
 * 差分/CMND/插值/复用缓冲等公共件见 pitchCore.ts。
 */

import { getAlgoParams } from './algoParams';
import { computeCmnd, ensurePitchScratch, parabolicRefine, tauRange } from './pitchCore';

export interface PitchEstimate {
  /** 基频 Hz */
  freq: number;
  /** 周期性置信度 0-1（1 - 最小 CMND 值） */
  prob: number;
}

/**
 * 对一帧时域信号做 YIN 音高检测
 * @param samples 时域采样（长度需 >= 2 * tauMax）
 * @param sampleRate 采样率
 * @param minHz 最低检测频率
 * @param maxHz 最高检测频率
 * @returns 检测结果，无声/噪声时返回 null
 */
export function detectPitchYin(
  samples: Float32Array,
  sampleRate: number,
  minHz = 60,
  maxHz = 600,
): PitchEstimate | null {
  const range = tauRange(samples, sampleRate, minHz, maxHz);
  if (!range) return null;
  const [tauMin, tauMax] = range;
  ensurePitchScratch(tauMax + 1);
  const { cmnd } = computeCmnd(samples, tauMin, tauMax);

  // 3. 找第一个低于阈值的局部极小值
  // 阈值（实验性可调，见 algoParams）；无周期性的绝对门限随阈值联动，
  // 保持默认口径：0.14 + 0.31 = 0.45
  const { yinThreshold } = getAlgoParams();
  const APERIODIC_MARGIN = 0.31;
  let bestTau = -1;
  let bestVal = Infinity;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (cmnd[tau] < bestVal) {
      bestVal = cmnd[tau];
      bestTau = tau;
    }
    if (cmnd[tau] < yinThreshold) {
      // 继续走到局部极小再停，避免取到下降沿
      while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      bestTau = tau;
      bestVal = cmnd[tau];
      break;
    }
  }

  if (bestTau < 0 || bestVal > yinThreshold + APERIODIC_MARGIN) return null; // 无明显周期性

  // 4. 抛物线插值细化
  const betterTau = parabolicRefine(cmnd, bestTau, tauMin, tauMax);

  const freq = sampleRate / betterTau;
  if (freq < minHz || freq > maxHz) return null;
  return { freq, prob: Math.max(0, Math.min(1, 1 - bestVal)) };
}

/**
 * 计算一帧信号的 RMS 能量（dB）
 * @returns dB 值（-90 ~ 0），静音时接近 -90
 */
export function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  if (rms < 1e-5) return -90;
  return Math.max(-90, Math.min(0, 20 * Math.log10(rms)));
}
