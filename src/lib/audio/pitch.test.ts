import { describe, it, expect } from 'vitest';
import { detectPitchYin, rmsDb } from './pitch';
import { makeSine } from './testHelpers';

describe('detectPitchYin', () => {
  it('检测 110Hz 正弦 @ 48kHz（±2Hz）', () => {
    const p = detectPitchYin(makeSine(110, 48000, 0.2), 48000);
    expect(p).not.toBeNull();
    expect(Math.abs(p!.freq - 110)).toBeLessThanOrEqual(2);
    expect(p!.prob).toBeGreaterThan(0.8);
  });

  it('检测 220Hz 正弦 @ 48kHz（±2Hz）', () => {
    const p = detectPitchYin(makeSine(220, 48000, 0.2), 48000);
    expect(p).not.toBeNull();
    expect(Math.abs(p!.freq - 220)).toBeLessThanOrEqual(2);
  });

  it('检测 100Hz 正弦 @ 32kHz（±2Hz）', () => {
    const p = detectPitchYin(makeSine(100, 32000, 0.25), 32000);
    expect(p).not.toBeNull();
    expect(Math.abs(p!.freq - 100)).toBeLessThanOrEqual(2);
  });

  it('全零静音输入返回 null（无周期性）', () => {
    expect(detectPitchYin(new Float32Array(4096), 32000)).toBeNull();
  });
});

describe('rmsDb', () => {
  it('振幅 0.5 的正弦 ≈ -9 dBFS（±1dB）', () => {
    const db = rmsDb(makeSine(440, 32000, 0.1));
    expect(db).toBeGreaterThanOrEqual(-10);
    expect(db).toBeLessThanOrEqual(-8);
  });

  it('全零静音返回 -90 下限', () => {
    expect(rmsDb(new Float32Array(1024))).toBe(-90);
  });
});
