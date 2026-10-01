/**
 * 备选音高检测算法（实验性）
 * pYIN：多阈值概率化的 YIN（Mauch & Dixon 2014 的简化实现），
 *       用阈值分布对「首个低于阈值的谷」投票，噪声下的倍频错误更少；
 * MPM：麦克劳德音高法（McLeod Pitch Method），归一化平方差函数 NSDF
 *       取首个 ≥ 0.9×全局峰的关键极大值，对低频与脉冲串更敏感。
 * 两者与 detectPitchYin 同构：同一输入输出 PitchEstimate，可互换（音高算法对比）。
 */

import { detectPitchYin, type PitchEstimate } from './pitch';
import type { PitchAlgorithm } from '@/types';

export type { PitchEstimate };

/* ---------------------------------- pYIN ---------------------------------- */

/** 阈值分布的档位数与取值范围（Beta(2,18) 权重集中在低端，覆盖 YIN 阈值 0.14 一带） */
const PYIN_THRESHOLDS = 12;
const PYINE_TMIN = 0.05;
const PYINE_TMAX = 0.5;

/**
 * 对一帧信号做 pYIN 音高检测
 * 输入约定与 detectPitchYin 完全一致（长度 ≥ 2 * tauMax）
 */
export function detectPitchPyin(
  samples: Float32Array,
  sampleRate: number,
  minHz = 60,
  maxHz = 600,
): PitchEstimate | null {
  const half = samples.length >> 1;
  const tauMax = Math.min(half - 1, Math.floor(sampleRate / minHz));
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  if (tauMax <= tauMin) return null;

  // 1. 差分函数 + 累积均值归一化（与 YIN 相同的白色谱处理）
  const diff = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const delta = samples[i] - samples[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[tauMin] = 1;
  let runningSum = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    runningSum += diff[tau];
    cmnd[tau] = runningSum === 0 ? 1 : (diff[tau] * (tau - tauMin + 1)) / runningSum;
  }

  // 2. 收集 CMND 的局部极小（候选周期的谷）
  const minima: { tau: number; val: number }[] = [];
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (cmnd[tau] < cmnd[tau - 1] && cmnd[tau] <= cmnd[tau + 1]) {
      minima.push({ tau, val: cmnd[tau] });
    }
  }
  if (minima.length === 0) return null;

  // 3. 阈值分布投票：每个阈值取「首个低于它的谷」，权重 Beta(2,18)；
  //    全部谷都高于阈值的档位计入无声概率
  const th = new Float64Array(PYIN_THRESHOLDS);
  const wt = new Float64Array(PYIN_THRESHOLDS);
  let wsum = 0;
  for (let i = 0; i < PYIN_THRESHOLDS; i++) {
    const x = (i + 0.5) / PYIN_THRESHOLDS;
    th[i] = PYINE_TMIN + (PYINE_TMAX - PYINE_TMIN) * x;
    wt[i] = x * Math.pow(1 - x, 17);
    wsum += wt[i];
  }
  for (let i = 0; i < PYIN_THRESHOLDS; i++) wt[i] /= wsum;

  const bucket = new Map<number, number>();
  let unvoiced = 0;
  for (let i = 0; i < PYIN_THRESHOLDS; i++) {
    let hit: { tau: number; val: number } | null = null;
    for (const m of minima) {
      if (m.val < th[i]) {
        hit = m;
        break;
      }
    }
    if (hit) bucket.set(hit.tau, (bucket.get(hit.tau) ?? 0) + wt[i]);
    else unvoiced += wt[i];
  }

  let bestTau = -1;
  let bestP = 0;
  for (const [tau, p] of bucket) {
    if (p > bestP) {
      bestP = p;
      bestTau = tau;
    }
  }
  // 无声概率占优，或最强候选自身都压不过无声：判为无声
  if (bestTau < 0 || bestP <= unvoiced) return null;

  // 4. 抛物线插值细化（与 YIN 同款）
  let betterTau = bestTau;
  if (bestTau > tauMin && bestTau < tauMax) {
    const s0 = cmnd[bestTau - 1];
    const s1 = cmnd[bestTau];
    const s2 = cmnd[bestTau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-9) betterTau = bestTau + (s2 - s0) / denom;
  }

  const freq = sampleRate / betterTau;
  if (freq < minHz || freq > maxHz) return null;
  const voiced = Math.max(0, Math.min(1, 1 - unvoiced));
  return { freq, prob: voiced };
}

/* ----------------------------------- MPM ----------------------------------- */

/**
 * 对一帧信号做 MPM 音高检测
 * NSDF = 2·r(τ) / (Σx[i]² + Σx[i+τ]²)，关键极大值中取首个 ≥ 0.9×全局峰
 */
export function detectPitchMpm(
  samples: Float32Array,
  sampleRate: number,
  minHz = 60,
  maxHz = 600,
): PitchEstimate | null {
  const half = samples.length >> 1;
  const tauMax = Math.min(half - 1, Math.floor(sampleRate / minHz));
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  if (tauMax <= tauMin) return null;

  // 1. 归一化平方差函数
  const nsdf = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let acf = 0;
    let m0 = 0;
    let mTau = 0;
    for (let i = 0; i < half; i++) {
      acf += samples[i] * samples[i + tau];
      m0 += samples[i] * samples[i];
      mTau += samples[i + tau] * samples[i + tau];
    }
    const m = m0 + mTau;
    nsdf[tau] = m > 1e-12 ? (2 * acf) / m : 0;
  }

  // 2. 关键极大值（局部峰，且为正）
  const maxima: { tau: number; val: number }[] = [];
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (nsdf[tau] > nsdf[tau - 1] && nsdf[tau] >= nsdf[tau + 1] && nsdf[tau] > 0) {
      maxima.push({ tau, val: nsdf[tau] });
    }
  }
  if (maxima.length === 0) return null;

  let globalMax = 0;
  for (const m of maxima) if (m.val > globalMax) globalMax = m.val;
  // 清晰度不足：无声/噪声
  if (globalMax < 0.5) return null;

  // 3. 首个 ≥ 0.9×全局峰的极大值 = 基音周期（更低的 τ，避免落到次谐波）
  let chosen: { tau: number; val: number } | null = null;
  for (const m of maxima) {
    if (m.val >= 0.9 * globalMax) {
      chosen = m;
      break;
    }
  }
  if (!chosen || chosen.val < 0.5) return null;

  // 4. 抛物线插值细化
  let betterTau = chosen.tau;
  if (chosen.tau > tauMin && chosen.tau < tauMax) {
    const s0 = nsdf[chosen.tau - 1];
    const s1 = nsdf[chosen.tau];
    const s2 = nsdf[chosen.tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-9) betterTau = chosen.tau + (s2 - s0) / denom;
  }

  const freq = sampleRate / betterTau;
  if (freq < minHz || freq > maxHz) return null;
  return { freq, prob: Math.max(0, Math.min(1, chosen.val)) };
}

/* ---------------------------------- 调度器 ---------------------------------- */

/**
 * 按算法选择检测音高（recorder 实时循环与离线重算共用）
 * @param algo yin 经典基线 / pyin 概率化 / mpm 麦氏法
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  algo: PitchAlgorithm,
): PitchEstimate | null {
  switch (algo) {
    case 'pyin':
      return detectPitchPyin(samples, sampleRate, minHz, maxHz);
    case 'mpm':
      return detectPitchMpm(samples, sampleRate, minHz, maxHz);
    default:
      return detectPitchYin(samples, sampleRate, minHz, maxHz);
  }
}
