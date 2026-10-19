import { describe, it, expect } from 'vitest';
import { smoothPitch, PITCH_SMOOTH_MAX } from './pitchSmooth';

/** 抖动序列：均值附近 ±幅度交替 */
function jittery(n: number, base = 180, amp = 20): (number | null)[] {
  return Array.from({ length: n }, (_, i) => base + (i % 2 === 0 ? amp : -amp));
}

/** 相邻差值平方和（总变差，衡量抖动） */
function roughness(xs: (number | null)[]): number {
  let s = 0;
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i - 1];
    const b = xs[i];
    if (a == null || b == null) continue;
    s += (b - a) * (b - a);
  }
  return s;
}

describe('smoothPitch', () => {
  it('级别 0 返回原数组引用（关闭时零开销）', () => {
    const f0 = jittery(10);
    expect(smoothPitch(f0, 0)).toBe(f0);
  });

  it('级别越高越平滑（总变差单调下降）', () => {
    const f0 = jittery(40);
    const r1 = roughness(smoothPitch(f0, 1));
    const r2 = roughness(smoothPitch(f0, 2));
    const r3 = roughness(smoothPitch(f0, 3));
    expect(r1).toBeLessThan(roughness(f0));
    expect(r2).toBeLessThan(r1);
    expect(r3).toBeLessThan(r2);
  });

  it('不修改原序列', () => {
    const f0 = jittery(10);
    const copy = [...f0];
    smoothPitch(f0, 3);
    expect(f0).toEqual(copy);
  });

  it('null 段保持为 null，且不跨段平滑', () => {
    const f0: (number | null)[] = [100, 100, null, 300, 300];
    const out = smoothPitch(f0, 3);
    expect(out[2]).toBeNull();
    // 300 段的首个样本不被前一发音段（100）拉低
    expect(out[3]).toBe(300);
  });

  it('越界/非法级别被夹紧，不抛错', () => {
    const f0 = jittery(5);
    expect(() => smoothPitch(f0, 99)).not.toThrow();
    expect(() => smoothPitch(f0, -5)).not.toThrow();
    expect(smoothPitch(f0, PITCH_SMOOTH_MAX + 10).length).toBe(f0.length);
  });
});
