/**
 * 谐波谱类嗓音质量指标（离线，需「保存录音」）
 * 与 Jitter / Shimmer / HNR / CPPS 并列，补充气声与频谱倾斜系的口径：
 *   H1–H2  = 第一谐波幅度 − 第二谐波幅度（dB）：随声门开商增大而升高，偏高提示气声
 *   H2–H4  = 第二 − 第四谐波（dB）：又一频谱倾斜口径
 *   H1–A3  = 第一谐波 − F3 区最强谐波（dB）：气声的经典指标（A3 用 2–3.5kHz 频带内
 *            最强谐波作 F3 代理，避免额外做 F3 跟踪）
 *   气声度  = 0–1 综合指数：由 H1–H2 偏高与谱域谐波性偏低（谐波峰 vs 谐波间噪声）合成
 *
 * 逐帧（40ms 窗 / 10ms 移，与 CPPS 同口径）：能量过门限 + YIN 置信度过关 →
 * 汉宁窗 FFT → 幅度谱 → 每个谐波在 ±半谐波间距内取局部峰（抗频率对齐误差）。
 * 跨帧取中位数（气声度取均值）聚合为标量。数值仅供参考，不构成医学诊断。
 */

import { fft } from './cpp';
import { extractFormants } from './formants';
import { detectPitchYin } from './pitch';
import { getAlgoParams } from './algoParams';

export interface SpectralVoice {
  /** H1−H2（dB） */
  h1h2Db: number | null;
  /** H2−H4（dB） */
  h2h4Db: number | null;
  /** H1−A3（dB，A3 = F3 区最强谐波） */
  h1a3Db: number | null;
  /** 气声综合指数（0–1，越大越气声） */
  breathiness: number | null;
  /** A1−P1（dB，A1 = F1 处谐波幅度，P1 = 300–1000Hz 鼻腔峰）：越低鼻化越重，旧记录为 undefined */
  nasalityDb: number | null;
}

/** 帧长 / 帧移（秒），与 CPPS 口径一致 */
const FRAME_SEC = 0.04;
const HOP_SEC = 0.01;
/** 有效谐波统计上限（Hz） */
const MAX_HZ = 5000;
/** F3 代理区间（Hz）：A3 取该区间内最强谐波 */
const A3_LO = 2000;
const A3_HI = 3500;

/** FFT 长度须为 2 的幂 */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * 由完整录音 PCM 计算谐波谱类指标
 * @param samples 单声道 PCM
 * @param sampleRate 采样率
 */
export function computeSpectralVoice(samples: Float32Array, sampleRate: number): SpectralVoice {
  const win = Math.max(64, Math.round(FRAME_SEC * sampleRate));
  const hop = Math.max(1, Math.round(HOP_SEC * sampleRate));
  const n = nextPow2(win);
  const hann = new Float32Array(win);
  for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const mag = new Float32Array(n >> 1);
  const binHz = sampleRate / n;
  const half = n >> 1;

  const { activeGateDb, vqMinProb, pitchMinHz, pitchMaxHz } = getAlgoParams();

  const h1h2: number[] = [];
  const h2h4: number[] = [];
  const h1a3: number[] = [];
  const breath: number[] = [];
  const nasality: number[] = [];

  for (let start = 0; start + win <= samples.length; start += hop) {
    let sum = 0;
    for (let i = 0; i < win; i++) {
      const s = samples[start + i];
      sum += s * s;
    }
    const db = 20 * Math.log10(Math.sqrt(sum / win) + 1e-10);
    if (db < activeGateDb) continue;

    const frame = samples.subarray(start, start + win);
    const pitch = detectPitchYin(frame, sampleRate, pitchMinHz, pitchMaxHz);
    if (!pitch || pitch.prob < vqMinProb) continue;
    const f0 = pitch.freq;

    for (let i = 0; i < n; i++) {
      re[i] = i < win ? frame[i] * hann[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < half; b++) mag[b] = Math.hypot(re[b], im[b]);

    // 局部峰：谐波附近 ±半谐波间距内的最大幅度
    const ampAt = (f: number): number => {
      const lo = Math.max(1, Math.floor((f - f0 / 2) / binHz));
      const hi = Math.min(half - 1, Math.ceil((f + f0 / 2) / binHz));
      let peak = 0;
      for (let b = lo; b <= hi; b++) if (mag[b] > peak) peak = mag[b];
      return peak;
    };
    // 谐波间谷值：中点 ±1 bin（窄窗，避免吃到邻近谐波的泄漏）
    const noiseAt = (f: number): number => {
      const c = f / binHz;
      const lo = Math.max(1, Math.round(c) - 1);
      const hi = Math.min(half - 1, Math.round(c) + 1);
      let peak = 0;
      for (let b = lo; b <= hi; b++) if (mag[b] > peak) peak = mag[b];
      return peak;
    };

    const a1 = ampAt(f0);
    const a2 = ampAt(2 * f0);
    const a4 = ampAt(4 * f0);

    // 鼻化 A1−P1：A1 = F1 处谐波幅度，P1 = 300–1000Hz 鼻腔峰幅度（Chen 1997 口径）
    const fm = extractFormants(frame, sampleRate, db);
    if (fm.f1 != null && fm.f1 > 0) {
      const a1p = ampAt(fm.f1);
      const plo = Math.max(1, Math.floor(300 / binHz));
      const phi = Math.min(half - 1, Math.ceil(1000 / binHz));
      let p1 = 0;
      for (let b = plo; b <= phi; b++) if (mag[b] > p1) p1 = mag[b];
      if (a1p > 0 && p1 > 0) nasality.push(20 * Math.log10(a1p / p1));
    }

    if (!(a1 > 0) || !(a2 > 0) || !(a4 > 0)) continue;
    const d12 = 20 * Math.log10(a1 / a2);
    h1h2.push(d12);
    h2h4.push(20 * Math.log10(a2 / a4));

    let a3 = 0;
    for (let k = Math.ceil(A3_LO / f0); k * f0 <= A3_HI; k++) {
      const a = ampAt(k * f0);
      if (a > a3) a3 = a;
    }
    if (a3 > 0) h1a3.push(20 * Math.log10(a1 / a3));

    // 谱域谐波性：谐波峰能量 vs 谐波间（半阶）能量
    let hs = 0;
    let ns = 0;
    let cnt = 0;
    for (let k = 1; k * f0 <= MAX_HZ && (k + 0.5) * f0 < sampleRate / 2; k++) {
      const hp = ampAt(k * f0);
      const np = noiseAt((k + 0.5) * f0);
      hs += hp * hp;
      ns += np * np;
      cnt++;
    }
    if (cnt >= 3 && hs > 0) {
      const harmonicity = hs / (hs + ns); // 0–1
      const h1h2n = Math.max(0, Math.min(1, (d12 - 2) / 18)); // ~2–20dB → 0–1
      breath.push(Math.max(0, Math.min(1, 0.6 * h1h2n + 0.4 * (1 - harmonicity))));
    }
  }

  const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const breathMean = mean(breath);
  return {
    h1h2Db: r1(median(h1h2)),
    h2h4Db: r1(median(h2h4)),
    h1a3Db: r1(median(h1a3)),
    breathiness: breathMean == null ? null : Math.round(breathMean * 100) / 100,
    nasalityDb: r1(median(nasality)),
  };
}
