import { describe, it, expect } from 'vitest';
import { extractFormants } from './formants';
import { makePulseTrain } from './testHelpers';

/** 双极点数字谐振器：y[n] = x[n] + 2r·cos(ω)·y[n-1] − r²·y[n-2] */
function resonate(input: Float32Array, sampleRate: number, freq: number, r: number): Float32Array {
  const w = (2 * Math.PI * freq) / sampleRate;
  const c = 2 * r * Math.cos(w);
  const r2 = r * r;
  const out = new Float32Array(input.length);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const y0 = input[i] + c * y1 - r2 * y2;
    out[i] = y0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/** 源-滤波合成元音帧：100Hz 脉冲串依次过 F1 / F2 两个谐振器 */
function makeVowelFrame(f1: number, f2: number): Float32Array {
  const src = makePulseTrain({ f0: 100, sampleRate: 32000, durSec: 2048 / 32000, amp: 0.05 });
  return resonate(resonate(src, 32000, f1, 0.95), 32000, f2, 0.95);
}

describe('extractFormants', () => {
  it('F1=700 / F2=1220 合成元音：F1 ±15%、F2 ±20%', () => {
    const { f1, f2 } = extractFormants(makeVowelFrame(700, 1220), 32000, -20);
    expect(f1).not.toBeNull();
    expect(f1!).toBeGreaterThanOrEqual(700 * 0.85);
    expect(f1!).toBeLessThanOrEqual(700 * 1.15);
    expect(f2).not.toBeNull();
    expect(f2!).toBeGreaterThanOrEqual(1220 * 0.8);
    expect(f2!).toBeLessThanOrEqual(1220 * 1.2);
  });

  it('结果落在文档口径的接受带内：F1∈[200,1100]，F2≥max(F1+150,700)', () => {
    const { f1, f2 } = extractFormants(makeVowelFrame(700, 1220), 32000, -20);
    if (f1 != null) {
      expect(f1).toBeGreaterThanOrEqual(200);
      expect(f1).toBeLessThanOrEqual(1100);
      if (f2 != null) {
        expect(f2).toBeGreaterThanOrEqual(Math.max(f1 + 150, 700));
      }
    }
  });

  it('全零静音帧返回 { f1: null, f2: null }', () => {
    expect(extractFormants(new Float32Array(2048), 32000, -20)).toEqual({ f1: null, f2: null });
  });

  it('rms 低于 -52dB 静音门限直接返回 null', () => {
    expect(extractFormants(makeVowelFrame(700, 1220), 32000, -60)).toEqual({ f1: null, f2: null });
  });
});
