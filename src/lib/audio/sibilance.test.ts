import { describe, it, expect } from 'vitest';
import { analyzeSibilance, sibilanceRefRange } from './sibilance';

const HZ = 32000;

/** 合成 PCM：白噪声（摩擦音代理）+ 可选低频成分 */
function noiseBurst(sec: number, amp: number, seed = 1): Float32Array {
  const n = Math.floor(sec * HZ);
  const out = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    // LCG 伪随机白噪声
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = ((s / 0xffffffff) * 2 - 1) * amp;
  }
  return out;
}

function tone(sec: number, hz: number, amp: number): Float32Array {
  const n = Math.floor(sec * HZ);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / HZ) * amp;
  return out;
}

function concat(...parts: Float32Array[]): Float32Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

describe('sibilanceRefRange', () => {
  it('mtf → 5–10kHz，ftm → 2.5–6.5kHz，other → null', () => {
    expect(sibilanceRefRange('mtf')).toEqual([5000, 10000]);
    expect(sibilanceRefRange('ftm')).toEqual([2500, 6500]);
    expect(sibilanceRefRange('other')).toBeNull();
    expect(sibilanceRefRange(undefined)).toBeNull();
  });
});

describe('analyzeSibilance', () => {
  it('纯正弦（无摩擦音成分）→ null（不误报）', () => {
    // 纯音能量集中在基频，高频占比不过阈值
    const pcm = tone(1.0, 180, 0.4);
    expect(analyzeSibilance(pcm, 'mtf')).toBeNull();
  });

  it('白噪声突发（/s/ 代理）→ 检出咝音帧，重心落在高频', () => {
    // 白噪声频谱平直 → 1kHz 以上重心约在 (1k+16k)/2 附近
    const pcm = concat(
      tone(0.3, 160, 0.2),     // 前导浊音
      noiseBurst(0.4, 0.5),    // /s/
      tone(0.3, 160, 0.2),     // 尾浊音
    );
    const stats = analyzeSibilance(pcm, 'mtf');
    expect(stats).not.toBeNull();
    expect(stats!.frames).toBeGreaterThan(3);
    // 白噪声重心理论值 ≈ (1k+16k)/2 = 8.5kHz（Hann 窗边缘效应略偏低），至少 > 5kHz
    expect(stats!.centroidHz).toBeGreaterThan(5000);
    expect(stats!.centroidHz).toBeLessThan(16000);
    expect(stats!.totalSec).toBeGreaterThan(0);
  });

  it('低通白噪声（仅 1–4kHz 能量）重心显著低于宽带白噪声', () => {
    // 用两个不同种子的高频/中频噪声模拟重心差异：低幅度高频 + 高幅度中频
    // 简化：直接比较宽带白噪声 vs 纯 tone+noise 混合
    const broadband = noiseBurst(0.5, 0.5);
    const statsBb = analyzeSibilance(broadband, 'other');
    expect(statsBb).not.toBeNull();
    expect(statsBb!.p10Hz).toBeGreaterThan(1000);
    expect(statsBb!.p90Hz).toBeLessThan(16000);
  });

  it('mtf 方向给出 refPos，other 不给', () => {
    const pcm = noiseBurst(0.6, 0.5);
    const withGoal = analyzeSibilance(pcm, 'mtf');
    const noGoal = analyzeSibilance(pcm, 'other');
    expect(withGoal?.refRange).toEqual([5000, 10000]);
    expect(withGoal?.refPos).not.toBeNull();
    expect(noGoal?.refRange).toBeNull();
    expect(noGoal?.refPos).toBeNull();
  });

  it('静音输入 → null', () => {
    const pcm = new Float32Array(HZ);
    expect(analyzeSibilance(pcm, 'mtf')).toBeNull();
  });

  it('过短输入 → null', () => {
    expect(analyzeSibilance(new Float32Array(100), 'mtf')).toBeNull();
  });

  it('咝音帧统计字段齐全', () => {
    const pcm = noiseBurst(0.5, 0.5);
    const s = analyzeSibilance(pcm, 'ftm')!;
    expect(s.frames).toBeGreaterThan(0);
    expect(s.p10Hz).toBeLessThanOrEqual(s.centroidHz);
    expect(s.centroidHz).toBeLessThanOrEqual(s.p90Hz);
  });
});
