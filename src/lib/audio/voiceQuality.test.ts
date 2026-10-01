import { describe, it, expect } from 'vitest';
import { computeVoiceQuality } from './voiceQuality';
import { makeSine, makePulseTrain, makeWhiteNoise } from './testHelpers';

const SR = 32000;

describe('computeVoiceQuality', () => {
  it('完美周期脉冲串：jitter/shimmer < 1%，HNR > 20dB', () => {
    const sig = makePulseTrain({ f0: 100, sampleRate: SR, durSec: 1, amp: 0.5, pulseWidth: 96 });
    const { jitterPct, shimmerPct, hnrDb } = computeVoiceQuality(sig, SR);
    expect(jitterPct).not.toBeNull();
    expect(jitterPct!).toBeLessThan(1);
    expect(shimmerPct).not.toBeNull();
    expect(shimmerPct!).toBeLessThan(1);
    expect(hnrDb).not.toBeNull();
    expect(hnrDb!).toBeGreaterThan(20);
  });

  it('周期 ±2% 随机扰动：jitter > 0.5%，低于 5% 离群上限', () => {
    const sig = makePulseTrain({
      f0: 100, sampleRate: SR, durSec: 1, amp: 0.5,
      jitterPct: 0.02, pulseWidth: 96, seed: 7,
    });
    const { jitterPct } = computeVoiceQuality(sig, SR);
    expect(jitterPct).not.toBeNull();
    expect(jitterPct!).toBeGreaterThan(0.5);
    expect(jitterPct!).toBeLessThan(5);
  });

  it('幅度 ±5% 随机扰动：shimmer > 0.5%，低于 15% 离群上限', () => {
    const sig = makePulseTrain({
      f0: 100, sampleRate: SR, durSec: 1, amp: 0.5,
      shimmerPct: 0.05, pulseWidth: 96, seed: 11,
    });
    const { shimmerPct } = computeVoiceQuality(sig, SR);
    expect(shimmerPct).not.toBeNull();
    expect(shimmerPct!).toBeGreaterThan(0.5);
    expect(shimmerPct!).toBeLessThan(15);
  });

  it('纯净正弦 HNR 高于叠加强白噪声的版本', () => {
    const clean = makeSine(200, SR, 1);
    const sineRms = 0.5 / Math.SQRT2;
    const noise = makeWhiteNoise(clean.length, 99, sineRms * 0.5); // 信噪比约 6dB
    const noisy = new Float32Array(clean.length);
    for (let i = 0; i < clean.length; i++) noisy[i] = clean[i] + noise[i];

    const a = computeVoiceQuality(clean, SR);
    const b = computeVoiceQuality(noisy, SR);
    expect(a.hnrDb).not.toBeNull();
    expect(a.hnrDb!).toBeGreaterThan(15);
    // 强噪声下 HNR 大幅下降（噪声极大时可能直接判为不可用，见源码 MIN_PROB 门限）
    if (b.hnrDb != null) {
      expect(a.hnrDb! - b.hnrDb!).toBeGreaterThan(3);
    }
  });
});
