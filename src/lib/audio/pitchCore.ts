/**
 * 音高检测共享内核
 * pitch.ts（YIN）与 pitchAlt.ts（pYIN / MPM）共同使用的基础件：
 * - tau 搜索范围推算（采样率 + 频率界 → [tauMin, tauMax]）
 * - 差分函数 + 累积均值归一化（CMND）—— YIN / pYIN 同款前处理
 * - 抛物线插值细化 —— 三处同款公式收敛为一处，修插值 bug 只改这里
 * - 模块级复用缓冲（实时循环 60fps 稳态零分配）—— 统一管理，
 *   避免两模块各持一套 diff/cmnd 缓冲导致峰值内存翻倍
 * 同一线程内调用严格串行（实时循环 / 离线管线 / Worker 各自独占本线程），复用安全。
 */

/* ------------------------------ 复用缓冲 ------------------------------ */
let diffBuf = new Float32Array(0);
let cmndBuf = new Float32Array(0);
let nsdfBuf = new Float32Array(0);
/** 极值候选池（tau/val 平行数组 + 计数），pYIN 存谷、MPM 存峰 */
let extTau = new Float64Array(0);
let extVal = new Float64Array(0);

/** 确保各复用缓冲 ≥ len；只增不缩 */
export function ensurePitchScratch(len: number): void {
  if (diffBuf.length < len) {
    diffBuf = new Float32Array(len);
    cmndBuf = new Float32Array(len);
  }
  if (nsdfBuf.length < len) nsdfBuf = new Float32Array(len);
  if (extTau.length < len) {
    extTau = new Float64Array(len);
    extVal = new Float64Array(len);
  }
}

/** 复用缓冲只读视图（调用方在 ensurePitchScratch(len) 之后取用） */
export function pitchScratch() {
  return { diff: diffBuf, cmnd: cmndBuf, nsdf: nsdfBuf, extTau, extVal };
}

/* ------------------------------ tau 范围 ------------------------------ */

/**
 * 由采样率与频率界推算周期搜索范围
 * @returns [tauMin, tauMax]；无可行范围（tauMax <= tauMin）时返回 null
 */
export function tauRange(
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
): [number, number] | null {
  const half = samples.length >> 1; // 窗长 W
  const tauMax = Math.min(half - 1, Math.floor(sampleRate / minHz));
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  if (tauMax <= tauMin) return null;
  return [tauMin, tauMax];
}

/* --------------------------- 差分 + CMND --------------------------- */

/**
 * 差分函数 d(tau) 与累积均值归一化 d'(tau)，写入复用缓冲。
 * 返回 { diff, cmnd } 只读视图；需先 ensurePitchScratch(tauMax + 1)。
 */
export function computeCmnd(
  samples: Float32Array,
  tauMin: number,
  tauMax: number,
): { diff: Float32Array; cmnd: Float32Array } {
  const half = samples.length >> 1;
  const { diff, cmnd } = pitchScratch();

  // 1. 差分函数 d(tau)
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const delta = samples[i] - samples[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // 2. 累积均值归一化 d'(tau)
  let runningSum = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    runningSum += diff[tau];
    cmnd[tau] = runningSum === 0 ? 1 : (diff[tau] * (tau - tauMin + 1)) / runningSum;
  }
  return { diff, cmnd };
}

/* --------------------------- 抛物线插值 --------------------------- */

/**
 * 抛物线插值细化周期：用 buf[tau-1..tau+1] 三点估计真极值位置。
 * 越界或曲率退化（|denom| 过小）时原样返回 tau。
 */
export function parabolicRefine(
  buf: Float32Array,
  tau: number,
  tauMin: number,
  tauMax: number,
): number {
  if (tau <= tauMin || tau >= tauMax) return tau;
  const s0 = buf[tau - 1];
  const s1 = buf[tau];
  const s2 = buf[tau + 1];
  const denom = 2 * (2 * s1 - s2 - s0);
  if (Math.abs(denom) <= 1e-9) return tau;
  return tau + (s2 - s0) / denom;
}
