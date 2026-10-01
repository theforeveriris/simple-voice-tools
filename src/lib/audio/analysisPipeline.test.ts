import { describe, it, expect } from 'vitest';
import { analyzePcmFrames } from './analysisPipeline';
import { SPEC_BANDS } from '@/constants';
import { makePulseTrain } from './testHelpers';

describe('analyzePcmFrames', () => {
  it('2 秒 100Hz 脉冲串端到端：帧数、序列长度、语谱、指标', () => {
    const sr = 32000;
    const pcm = makePulseTrain({ f0: 100, sampleRate: sr, durSec: 2, amp: 0.5 });
    const r = analyzePcmFrames(pcm);

    // 30fps × 2s ≈ 60 帧（±2）
    expect(r.t.length).toBeGreaterThanOrEqual(58);
    expect(r.t.length).toBeLessThanOrEqual(62);
    expect(r.specRows).toBe(r.t.length);
    expect(r.specFlat.length).toBe(r.specRows * SPEC_BANDS);
    expect(r.f0.length).toBe(r.t.length);
    expect(r.db.length).toBe(r.t.length);
    expect(r.f1.length).toBe(r.t.length);
    expect(r.f2.length).toBe(r.t.length);

    // 周期信号：所有帧都应检出 100Hz 基频（±2Hz）
    expect(r.f0.some((v) => Number.isNaN(v))).toBe(false);
    for (const f0 of r.f0) expect(Math.abs(f0 - 100)).toBeLessThanOrEqual(2);

    // 脉冲串占空比低，能量约 -31dB，但高于静音门限
    expect(r.db[0]).toBeGreaterThan(-50);

    // 嗓音质量四项：CPPS 为有限数值（周期信号谐波结构显著）
    expect(r.metrics.cppsDb).not.toBeNull();
    expect(Number.isFinite(r.metrics.cppsDb!)).toBe(true);
    expect(r.metrics.cppsDb!).toBeGreaterThan(0);

    // 语谱行有能量分布
    expect(r.specFlat.some((v) => v > 0)).toBe(true);
  });

  it('进度回调最终收到 1', () => {
    const pcm = makePulseTrain({ f0: 100, sampleRate: 32000, durSec: 0.5, amp: 0.5 });
    const fracs: number[] = [];
    analyzePcmFrames(pcm, (f) => fracs.push(f));
    expect(fracs.length).toBeGreaterThan(0);
    expect(fracs[fracs.length - 1]).toBe(1);
  });
});
