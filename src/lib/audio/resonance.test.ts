import { describe, it, expect } from 'vitest';
import { f2f1Gaps, frameSpectralTilt, aggregateResonance, TILT_MIN_HZ, TILT_MAX_HZ } from './resonance';

describe('f2f1Gaps', () => {
  it('同帧检出且有序的帧才计入', () => {
    const f1 = [700, 500, null, 800, 300];
    const f2 = [1700, 1200, 2000, 750, 2200]; // 帧三无 F1、帧四倒挂（F2 < F1）
    const gaps = f2f1Gaps(f1, f2);
    expect(gaps).toEqual([1000, 700, 1900]);
  });

  it('NaN 缺口跳过', () => {
    const gaps = f2f1Gaps([NaN as unknown as number], [1700]);
    expect(gaps).toEqual([]);
  });
});

describe('frameSpectralTilt', () => {
  // 32kHz 管线、2048 点 FFT → binHz = 15.625
  const binHz = 32000 / 2048;

  it('每 octave 衰减 6dB 的谱 → 斜率 ≈ −6', () => {
    const n = 1024;
    const spec = new Float32Array(n);
    for (let bin = 0; bin < n; bin++) {
      const f = bin * binHz;
      // dB = -6 * log2(f / 200)，在 200Hz 处为 0
      spec[bin] = f >= TILT_MIN_HZ && f <= TILT_MAX_HZ ? -6 * Math.log2(f / 200) : -120;
    }
    const tilt = frameSpectralTilt(spec, binHz);
    expect(tilt).not.toBeNull();
    expect(tilt!).toBeCloseTo(-6, 1);
  });

  it('平直谱 → 斜率 ≈ 0', () => {
    const spec = new Float32Array(1024).fill(-30);
    const tilt = frameSpectralTilt(spec, binHz);
    expect(tilt).toBeCloseTo(0, 5);
  });
});

describe('aggregateResonance', () => {
  it('均值与中位数；空输入为 null', () => {
    const r = aggregateResonance([1000, 700, 1900], [-6, -3]);
    expect(r.f2f1GapHz).toBeCloseTo(1200);
    expect(r.f2f1GapMedianHz).toBe(1000);
    expect(r.spectralTiltDbOct).toBeCloseTo(-4.5);
    const empty = aggregateResonance([], []);
    expect(empty.f2f1GapHz).toBeNull();
    expect(empty.spectralTiltDbOct).toBeNull();
  });
});
