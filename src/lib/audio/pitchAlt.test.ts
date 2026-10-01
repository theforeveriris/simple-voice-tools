import { describe, it, expect } from 'vitest';
import { detectPitchPyin, detectPitchMpm, detectPitch } from './pitchAlt';
import { makeSine, makeWhiteNoise } from './testHelpers';

describe('detectPitchPyin', () => {
  it('检测 110Hz 正弦 @ 48kHz（±2Hz）', () => {
    const p = detectPitchPyin(makeSine(110, 48000, 0.2), 48000);
    expect(p).not.toBeNull();
    expect(Math.abs(p!.freq - 110)).toBeLessThanOrEqual(2);
    expect(p!.prob).toBeGreaterThan(0.8);
  });

  it('检测 220Hz 正弦 @ 48kHz（±2Hz）', () => {
    const p = detectPitchPyin(makeSine(220, 48000, 0.2), 48000);
    expect(p).not.toBeNull();
    expect(Math.abs(p!.freq - 220)).toBeLessThanOrEqual(2);
  });

  it('检测 100Hz 正弦 @ 32kHz（±2Hz）', () => {
    const p = detectPitchPyin(makeSine(100, 32000, 0.25), 32000);
    expect(p).not.toBeNull();
    expect(Math.abs(p!.freq - 100)).toBeLessThanOrEqual(2);
  });

  it('全零静音输入返回 null', () => {
    expect(detectPitchPyin(new Float32Array(4096), 32000)).toBeNull();
  });

  it('白噪声输入返回 null（无声占优）', () => {
    expect(detectPitchPyin(makeWhiteNoise(4096, 7, 0.3), 32000)).toBeNull();
  });
});

describe('detectPitchMpm', () => {
  it('检测 110Hz 正弦 @ 48kHz（±2Hz）', () => {
    const p = detectPitchMpm(makeSine(110, 48000, 0.2), 48000);
    expect(p).not.toBeNull();
    expect(Math.abs(p!.freq - 110)).toBeLessThanOrEqual(2);
    expect(p!.prob).toBeGreaterThan(0.8);
  });

  it('检测 220Hz 正弦 @ 48kHz（±2Hz）', () => {
    const p = detectPitchMpm(makeSine(220, 48000, 0.2), 48000);
    expect(p).not.toBeNull();
    expect(Math.abs(p!.freq - 220)).toBeLessThanOrEqual(2);
  });

  it('检测 82Hz 低音正弦 @ 32kHz（±2Hz，低频敏感度）', () => {
    const p = detectPitchMpm(makeSine(82, 32000, 0.3), 32000);
    expect(p).not.toBeNull();
    expect(Math.abs(p!.freq - 82)).toBeLessThanOrEqual(2);
  });

  it('全零静音输入返回 null', () => {
    expect(detectPitchMpm(new Float32Array(4096), 32000)).toBeNull();
  });

  it('白噪声输入返回 null（清晰度不足）', () => {
    expect(detectPitchMpm(makeWhiteNoise(4096, 7, 0.3), 32000)).toBeNull();
  });
});

describe('detectPitch 调度器', () => {
  it('三种算法在同一 196Hz 正弦上结果一致（±2Hz）', () => {
    const sig = makeSine(196, 48000, 0.2);
    const algos = ['yin', 'pyin', 'mpm'] as const;
    for (const algo of algos) {
      const p = detectPitch(sig, 48000, 60, 600, algo);
      expect(p, algo).not.toBeNull();
      expect(Math.abs(p!.freq - 196), algo).toBeLessThanOrEqual(2);
    }
  });
});
