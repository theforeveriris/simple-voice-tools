import { describe, it, expect } from 'vitest';
import { estimateImportGainDb, applyGainDb, IMPORT_TARGET_RMS_DB, IMPORT_MAX_GAIN_DB } from './normalize';

const FS = 32000;

/** 语音状信号：交替响/轻段的正弦，峰值可控 */
function speechLike(amp: number, sec = 2): Float32Array {
  const n = Math.round(sec * FS);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // 每 200ms 交替（一半接近静音），模拟说话与停顿
    const loud = Math.floor(i / (0.2 * FS)) % 2 === 0;
    out[i] = (loud ? amp : amp * 0.02) * Math.sin((2 * Math.PI * 180 * i) / FS);
  }
  return out;
}

/** 全段 RMS（dB） */
function rmsDb(pcm: Float32Array): number {
  let s = 0;
  for (let i = 0; i < pcm.length; i++) s += pcm[i] * pcm[i];
  return 20 * Math.log10(Math.sqrt(s / pcm.length) + 1e-12);
}

describe('estimateImportGainDb', () => {
  it('低电平文件获得正增益，并且再次估计为 0（已达标）', () => {
    const pcm = speechLike(0.01); // 轻声约 -40dBFS
    const gain = estimateImportGainDb(pcm, FS);
    expect(gain).toBeGreaterThan(0);
    applyGainDb(pcm, gain);
    // 归一后应落在目标附近（±3dB 容差，分位估计近似）
    expect(rmsDb(pcm)).toBeGreaterThan(IMPORT_TARGET_RMS_DB - 12);
    expect(estimateImportGainDb(pcm, FS)).toBe(0);
  });

  it('已经足够响的文件不改（增益 0）', () => {
    const pcm = speechLike(0.5); // 约 -6dBFS
    expect(estimateImportGainDb(pcm, FS)).toBe(0);
  });

  it('峰值封顶：不因增益而削波（峰值 ≤ -1dBFS）', () => {
    const pcm = speechLike(0.001); // 极轻
    const gain = estimateImportGainDb(pcm, FS);
    expect(gain).toBeGreaterThan(0);
    applyGainDb(pcm, gain);
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    expect(20 * Math.log10(peak)).toBeLessThanOrEqual(-0.9);
  });

  it('提升量不超过上限', () => {
    const pcm = speechLike(1e-6);
    expect(estimateImportGainDb(pcm, FS)).toBeLessThanOrEqual(IMPORT_MAX_GAIN_DB);
  });

  it('空输入 / 非法采样率返回 0', () => {
    expect(estimateImportGainDb(new Float32Array(0), FS)).toBe(0);
    expect(estimateImportGainDb(speechLike(0.01), 0)).toBe(0);
  });
});

describe('applyGainDb', () => {
  it('小于阈值的增益不改动并返回 false', () => {
    const pcm = speechLike(0.5);
    const before = pcm[100];
    expect(applyGainDb(pcm, 0.2)).toBe(false);
    expect(pcm[100]).toBe(before);
  });

  it('就地线性放大并返回 true', () => {
    const pcm = new Float32Array([0.1, -0.2]);
    expect(applyGainDb(pcm, 20)).toBe(true);
    expect(pcm[0]).toBeCloseTo(1.0, 3);
    expect(pcm[1]).toBeCloseTo(-2.0, 3);
  });
});
