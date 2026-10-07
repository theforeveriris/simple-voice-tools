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

/* ------------------------------ 复用缓冲 ------------------------------ */
/**
 * 实时循环 60fps 逐帧调用，工作数组按需增长 + 模块级复用，稳态零分配。
 * 同一线程内调用严格串行（实时循环 / 离线管线 / Worker 各自独占本线程），复用安全。
 */
let diffBuf = new Float32Array(0);
let cmndBuf = new Float32Array(0);
let nsdfBuf = new Float32Array(0);
/** 极值候选池（tau/val 平行数组 + 计数），pYIN 存谷、MPM 存峰 */
let extTau = new Float64Array(0);
let extVal = new Float64Array(0);

function ensureScratch(len: number): void {
  if (diffBuf.length < len) {
    diffBuf = new Float32Array(len);
    cmndBuf = new Float32Array(len);
  }
  if (extTau.length < len) {
    extTau = new Float64Array(len);
    extVal = new Float64Array(len);
  }
  if (nsdfBuf.length < len) nsdfBuf = new Float32Array(len);
}

/* ---------------------------------- pYIN ---------------------------------- */

/** 阈值分布的档位数与取值范围（Beta(2,18) 权重集中在低端，覆盖 YIN 阈值 0.14 一带） */
const PYIN_THRESHOLDS = 12;
const PYINE_TMIN = 0.05;
const PYINE_TMAX = 0.5;

/** 阈值档位与归一化权重：纯常量，模块级一次算好 */
const PYIN_TH = new Float64Array(PYIN_THRESHOLDS);
const PYIN_WT = new Float64Array(PYIN_THRESHOLDS);
{
  let wsum = 0;
  for (let i = 0; i < PYIN_THRESHOLDS; i++) {
    const x = (i + 0.5) / PYIN_THRESHOLDS;
    PYIN_TH[i] = PYINE_TMIN + (PYINE_TMAX - PYINE_TMIN) * x;
    PYIN_WT[i] = x * Math.pow(1 - x, 17);
    wsum += PYIN_WT[i];
  }
  for (let i = 0; i < PYIN_THRESHOLDS; i++) PYIN_WT[i] /= wsum;
}

/** 谷 → 票重桶：模块级复用，调用前清空 */
const voteBucket = new Map<number, number>();

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
  ensureScratch(tauMax + 1);
  const diff = diffBuf;
  const cmnd = cmndBuf;

  // 1. 差分函数 + 累积均值归一化（与 YIN 相同的白色谱处理）
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const delta = samples[i] - samples[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }
  let runningSum = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    runningSum += diff[tau];
    cmnd[tau] = runningSum === 0 ? 1 : (diff[tau] * (tau - tauMin + 1)) / runningSum;
  }

  // 2. 收集 CMND 的局部极小（候选周期的谷）
  let nMinima = 0;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (cmnd[tau] < cmnd[tau - 1] && cmnd[tau] <= cmnd[tau + 1]) {
      extTau[nMinima] = tau;
      extVal[nMinima] = cmnd[tau];
      nMinima++;
    }
  }
  if (nMinima === 0) return null;

  // 3. 阈值分布投票：每个阈值取「首个低于它的谷」，权重 Beta(2,18)；
  //    全部谷都高于阈值的档位计入无声概率
  voteBucket.clear();
  let unvoiced = 0;
  for (let i = 0; i < PYIN_THRESHOLDS; i++) {
    let hitTau = -1;
    for (let m = 0; m < nMinima; m++) {
      if (extVal[m] < PYIN_TH[i]) {
        hitTau = extTau[m];
        break;
      }
    }
    if (hitTau >= 0) voteBucket.set(hitTau, (voteBucket.get(hitTau) ?? 0) + PYIN_WT[i]);
    else unvoiced += PYIN_WT[i];
  }

  let bestTau = -1;
  let bestP = 0;
  for (const [tau, p] of voteBucket) {
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
  ensureScratch(tauMax + 1);
  const nsdf = nsdfBuf;

  // 1. 归一化平方差函数
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
  let nMaxima = 0;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (nsdf[tau] > nsdf[tau - 1] && nsdf[tau] >= nsdf[tau + 1] && nsdf[tau] > 0) {
      extTau[nMaxima] = tau;
      extVal[nMaxima] = nsdf[tau];
      nMaxima++;
    }
  }
  if (nMaxima === 0) return null;

  let globalMax = 0;
  for (let m = 0; m < nMaxima; m++) if (extVal[m] > globalMax) globalMax = extVal[m];
  // 清晰度不足：无声/噪声
  if (globalMax < 0.5) return null;

  // 3. 首个 ≥ 0.9×全局峰的极大值 = 基音周期（更低的 τ，避免落到次谐波）
  let chosenTau = -1;
  let chosenVal = 0;
  const gate = 0.9 * globalMax;
  for (let m = 0; m < nMaxima; m++) {
    if (extVal[m] >= gate) {
      chosenTau = extTau[m];
      chosenVal = extVal[m];
      break;
    }
  }
  if (chosenTau < 0 || chosenVal < 0.5) return null;

  // 4. 抛物线插值细化
  let betterTau = chosenTau;
  if (chosenTau > tauMin && chosenTau < tauMax) {
    const s0 = nsdf[chosenTau - 1];
    const s1 = nsdf[chosenTau];
    const s2 = nsdf[chosenTau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-9) betterTau = chosenTau + (s2 - s0) / denom;
  }

  const freq = sampleRate / betterTau;
  if (freq < minHz || freq > maxHz) return null;
  return { freq, prob: Math.max(0, Math.min(1, chosenVal)) };
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
