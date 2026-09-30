/**
 * 语谱图工具
 * 录音时将 AnalyserNode 的 FFT 频谱（dB）逐帧映射到对数频带并量化为 Uint8，
 * 以 base64 随记录持久化；绘制时解码回位图并套用 magma 系伪彩色。
 */

import {
  SPEC_BANDS, SPEC_FMIN, SPEC_FMAX, SPEC_DB_MIN, SPEC_DB_MAX,
} from '@/constants';

/**
 * 一帧频谱（dB 数组）→ 对数频带量化行
 * @param freqDb AnalyserNode.getFloatFrequencyData 输出（dB，-Infinity 起步）
 * @param binHz 每个 FFT bin 的频率宽度（sampleRate / fftSize）
 * @param out 输出行（长度须为 SPEC_BANDS）
 */
export function spectrumRowToBands(freqDb: Float32Array, binHz: number, out: Uint8Array): void {
  for (let b = 0; b < SPEC_BANDS; b++) {
    const f = SPEC_FMIN * Math.pow(SPEC_FMAX / SPEC_FMIN, b / (SPEC_BANDS - 1));
    const center = f / binHz;
    // 取邻近 bin 的最大值，避免高频段频带间距大于 bin 宽度时漏能量
    const i0 = Math.max(0, Math.floor(center) - 1);
    const i1 = Math.min(freqDb.length - 1, Math.ceil(center) + 1);
    let peak = -Infinity;
    for (let i = i0; i <= i1; i++) if (freqDb[i] > peak) peak = freqDb[i];
    out[b] = dbToU8(peak);
  }
}

export function dbToU8(db: number): number {
  const t = (db - SPEC_DB_MIN) / (SPEC_DB_MAX - SPEC_DB_MIN);
  return Math.round(Math.max(0, Math.min(1, t)) * 255);
}

/* ------------------------------ base64 编解码 ------------------------------ */

export function base64FromBytes(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

export function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* -------------------------------- 伪彩色板 -------------------------------- */

/** magma 色带锚点（0-1 → RGB），语音语谱图的高对比经典配色 */
const STOPS: [number, [number, number, number]][] = [
  [0.0, [0, 0, 4]],
  [0.25, [81, 18, 124]],
  [0.5, [183, 55, 121]],
  [0.75, [252, 137, 97]],
  [1.0, [252, 253, 191]],
];

/** t ∈ [0,1] → magma 伪彩色 RGB 三元组 */
export function specColorRgb(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const k = (x - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** 量化值 0-255 → CSS 颜色 */
export function specColor(v: number): string {
  const [r, g, b] = specColorRgb(v / 255);
  return `rgb(${r},${g},${b})`;
}
