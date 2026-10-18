import { describe, it, expect } from 'vitest';
import { envInsights } from './envInsights';
import type { AnalysisRecord, RecordSeries, VoiceStats } from '@/types';

let seq = 0;
function makeRecord(opts: {
  daysAgo?: number;
  hour?: number;
  noiseFloorDb?: number;
  micLabel?: string;
  avgF0?: number;
}): AnalysisRecord {
  const series: RecordSeries = { t: [0], f0: [NaN], rmsDb: [-20], f1: [NaN], f2: [NaN] };
  const stats: VoiceStats = {
    durationSec: 10, sampleHz: 30, totalSamples: 300, voicedSamples: 200,
    avgF0: opts.avgF0 ?? 160, medianF0: 160, minF0: 120, maxF0: 220, p10F0: 130, p90F0: 200, stdF0: 10,
    malePct: 0, femalePct: 0, transitionPct: 0,
    avgF1: null, avgF2: null, f1Range: null, f2Range: null,
    avgDb: -20, peakDb: -15,
  };
  seq++;
  return {
    id: `rec-${seq}`,
    createdAt: Date.now() - (opts.daysAgo ?? 0) * 86400_000,
    durationSec: 10,
    sampleHz: 30,
    series,
    stats,
    env: {
      ...(opts.noiseFloorDb != null ? { noiseFloorDb: opts.noiseFloorDb } : {}),
      ...(opts.hour != null ? { hourOfDay: opts.hour } : {}),
      ...(opts.micLabel != null ? { micLabel: opts.micLabel } : {}),
    },
  };
}

describe('envInsights', () => {
  it('无 env 字段的记录 → 空洞察', () => {
    const r = makeRecord({ avgF0: 160 });
    delete (r as { env?: unknown }).env;
    expect(envInsights([r])).toEqual([]);
  });

  it('样本不足（<3+3）→ 空', () => {
    const recs = [
      makeRecord({ noiseFloorDb: -50, avgF0: 170 }),
      makeRecord({ noiseFloorDb: -30, avgF0: 150 }),
    ];
    expect(envInsights(recs)).toEqual([]);
  });

  it('安静环境 F0 系统性更高 → quieterBetter', () => {
    const recs = [
      ...Array.from({ length: 4 }, (_, i) => makeRecord({ noiseFloorDb: -55 + i * 0.1, avgF0: 170, daysAgo: i })),
      ...Array.from({ length: 4 }, (_, i) => makeRecord({ noiseFloorDb: -25 + i * 0.1, avgF0: 155, daysAgo: 10 + i })),
    ];
    const out = envInsights(recs);
    expect(out.some((x) => x.key === 'envInsight.quieterBetter')).toBe(true);
  });

  it('晨间 F0 更高 → morningHigher', () => {
    const recs = [
      ...Array.from({ length: 4 }, (_, i) => makeRecord({ hour: 7, avgF0: 168, daysAgo: i, noiseFloorDb: -50 })),
      ...Array.from({ length: 4 }, (_, i) => makeRecord({ hour: 20, avgF0: 156, daysAgo: i, noiseFloorDb: -52 })),
    ];
    const out = envInsights(recs);
    expect(out.some((x) => x.key === 'envInsight.morningHigher')).toBe(true);
  });

  it('麦克风标签多于一枚 → micChanged', () => {
    const recs = [
      makeRecord({ micLabel: 'Built-in Mic', noiseFloorDb: -50, hour: 8, avgF0: 160 }),
      makeRecord({ micLabel: 'USB Headset', noiseFloorDb: -50, hour: 9, avgF0: 160 }),
      makeRecord({ micLabel: 'Built-in Mic', noiseFloorDb: -51, hour: 8, avgF0: 160 }),
      makeRecord({ micLabel: 'USB Headset', noiseFloorDb: -51, hour: 9, avgF0: 160 }),
      makeRecord({ micLabel: 'Built-in Mic', noiseFloorDb: -52, hour: 8, avgF0: 160 }),
      makeRecord({ micLabel: 'USB Headset', noiseFloorDb: -52, hour: 9, avgF0: 160 }),
    ];
    const out = envInsights(recs);
    expect(out.some((x) => x.key === 'envInsight.micChanged')).toBe(true);
  });

  it('差异太小不提示', () => {
    const recs = [
      ...Array.from({ length: 4 }, (_, i) => makeRecord({ hour: 7, avgF0: 161, daysAgo: i, noiseFloorDb: -50 })),
      ...Array.from({ length: 4 }, (_, i) => makeRecord({ hour: 20, avgF0: 160, daysAgo: i, noiseFloorDb: -50 })),
    ];
    expect(envInsights(recs)).toEqual([]);
  });

  it('最多返回 2 条', () => {
    const recs = [
      ...Array.from({ length: 4 }, (_, i) => makeRecord({ hour: 7, avgF0: 170, daysAgo: i, noiseFloorDb: -60, micLabel: 'A' })),
      ...Array.from({ length: 4 }, (_, i) => makeRecord({ hour: 20, avgF0: 155, daysAgo: i, noiseFloorDb: -30, micLabel: 'B' })),
    ];
    expect(envInsights(recs).length).toBeLessThanOrEqual(2);
  });
});
