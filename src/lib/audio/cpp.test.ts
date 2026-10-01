import { describe, it, expect } from 'vitest';
import { fft, computeCpps } from './cpp';
import { makeSine, makePulseTrain, makeWhiteNoise } from './testHelpers';

describe('fft', () => {
  it('1000Hz 正弦峰值 bin = 32（±1 bin），能量为正且有限', () => {
    const n = 1024;
    const sr = 32000;
    const sine = makeSine(1000, sr, n / sr); // 恰好 32 个整周期，无泄漏
    const re = Float32Array.from(sine);
    const im = new Float32Array(n);
    fft(re, im);

    let peak = -1;
    let peakBin = 0;
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const m = re[i] * re[i] + im[i] * im[i];
      energy += m;
      if (m > peak) {
        peak = m;
        peakBin = i;
      }
    }
    expect(Math.abs(peakBin - 32)).toBeLessThanOrEqual(1);
    expect(energy).toBeGreaterThan(0);
    expect(Number.isFinite(energy)).toBe(true);
    // Parseval：Σ|X[k]|² = N·Σ|x[n]|² = 1024·(1024·0.25/2) = 131072
    expect(Math.abs(energy - 131072)).toBeLessThan(1);
  });
});

describe('computeCpps', () => {
  it('周期脉冲串 CPPS 比同 RMS 白噪声高 ≥ 5dB', () => {
    const sr = 32000;
    const pulse = makePulseTrain({ f0: 100, sampleRate: sr, durSec: 1, amp: 0.5 });
    let sum = 0;
    for (let i = 0; i < pulse.length; i++) sum += pulse[i] * pulse[i];
    const noise = makeWhiteNoise(pulse.length, 42, Math.sqrt(sum / pulse.length));

    const cppsPulse = computeCpps(pulse, sr);
    const cppsNoise = computeCpps(noise, sr);
    expect(cppsPulse).not.toBeNull();
    expect(cppsNoise).not.toBeNull();
    expect(cppsPulse! - cppsNoise!).toBeGreaterThanOrEqual(5);
  });

  it('样本不足一帧（< frameLen + hop）返回 null', () => {
    expect(computeCpps(new Float32Array(1000), 32000)).toBeNull();
  });

  it('全零静音（有效帧不足 MIN_FRAMES）返回 null', () => {
    expect(computeCpps(new Float32Array(32000), 32000)).toBeNull();
  });
});
