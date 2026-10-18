import { describe, it, expect } from 'vitest';
import {
  signatureBits, embedWatermark, extractWatermark, bitsMatchRate, verifyWatermark, CHIP_LEN,
} from './watermark';

/** 合成载体：缓慢正弦（模拟语音基波），幅度 0.5 */
function carrier(n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * 180 * i) / 32000) * 0.5;
  return out;
}

describe('signatureBits', () => {
  it('64-bit 且确定性（同一署名同一比特）', async () => {
    const a = await signatureBits('voicelab');
    const b = await signatureBits('voicelab');
    expect(a).toHaveLength(64);
    expect(bitsMatchRate(a, b)).toBe(1);
  });

  it('不同署名 → 大约一半比特不同（雪崩）', async () => {
    const a = await signatureBits('alice');
    const b = await signatureBits('bob');
    const rate = bitsMatchRate(a, b);
    expect(rate).toBeLessThan(0.8);
    expect(rate).toBeGreaterThan(0.2);
  });

  it('大小写与首尾空白归一', async () => {
    const a = await signatureBits('Alice');
    const b = await signatureBits('  alice ');
    expect(bitsMatchRate(a, b)).toBe(1);
  });
});

describe('embedWatermark / extractWatermark', () => {
  it('嵌入后音频与原信号差异极小（< 3% 峰值）', async () => {
    const pcm = carrier(CHIP_LEN * 200);
    const bits = await signatureBits('voicelab');
    const wm = embedWatermark(pcm, bits);
    let maxDelta = 0;
    for (let i = 0; i < pcm.length; i++) maxDelta = Math.max(maxDelta, Math.abs(wm[i] - pcm[i]));
    expect(maxDelta).toBeLessThan(0.03);
    // 嵌入不改长度
    expect(wm).toHaveLength(pcm.length);
  });

  it('完整提取：同一署名 match=true，不同署名 match=false', async () => {
    const pcm = carrier(CHIP_LEN * 300);
    const alice = await signatureBits('alice');
    const bob = await signatureBits('bob');
    const wm = embedWatermark(pcm, alice);
    expect(verifyWatermark(wm, alice).match).toBe(true);
    expect(verifyWatermark(wm, bob).match).toBe(false);
  });

  it('抗转码鲁棒：叠加小噪声后仍可提取', async () => {
    const pcm = carrier(CHIP_LEN * 300);
    const alice = await signatureBits('alice');
    const wm = embedWatermark(pcm, alice);
    // 模拟转码噪声：±1% 白噪声
    let s = 42;
    for (let i = 0; i < wm.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      wm[i] += ((s / 0xffffffff) * 2 - 1) * 0.01;
    }
    expect(verifyWatermark(wm, alice).match).toBe(true);
  });

  it('抗音量变化：整体衰减 6dB 后仍可提取', async () => {
    const pcm = carrier(CHIP_LEN * 300);
    const alice = await signatureBits('alice');
    const wm = embedWatermark(pcm, alice);
    for (let i = 0; i < wm.length; i++) wm[i] *= 0.5;
    expect(verifyWatermark(wm, alice).match).toBe(true);
  });

  it('短片段（仅承载部分比特）置信度不足时 match=false', async () => {
    const pcm = carrier(CHIP_LEN * 2); // 2 帧 → 只投 2 个比特的票
    const alice = await signatureBits('alice');
    const wm = embedWatermark(pcm, alice);
    const v = verifyWatermark(wm, alice);
    // 片段太短，置信度必然低于 0.9 门槛
    expect(v.confidence).toBeLessThan(0.9);
    expect(v.match).toBe(false);
  });

  it('无水印载体 → 与期望署名不匹配', async () => {
    const pcm = carrier(CHIP_LEN * 300);
    const alice = await signatureBits('alice');
    expect(verifyWatermark(pcm, alice).match).toBe(false);
  });

  it('过短音频 → 安全返回', () => {
    const { confidence } = extractWatermark(new Float32Array(100));
    expect(confidence).toBe(0);
  });
});
