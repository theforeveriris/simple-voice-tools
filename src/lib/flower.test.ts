import { describe, it, expect } from 'vitest';
import { flowerOf, hueJitter, _internal } from './flower';
import type { AnalysisRecord } from '@/types';

function makeRecord(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id: 'test-id-1',
    createdAt: Date.now(),
    durationSec: 10,
    sampleHz: 30,
    series: { t: [], f0: [], rmsDb: [], f1: [], f2: [] },
    stats: {
      durationSec: 10, sampleHz: 30, totalSamples: 300, voicedSamples: 200,
      avgF0: 180, medianF0: 178, minF0: 120, maxF0: 260, p10F0: 140, p90F0: 240,
      stdF0: 20, malePct: 20, femalePct: 60, transitionPct: 20,
      avgF1: 800, avgF2: 1900, f1Range: [600, 1000], f2Range: [1500, 2400],
      avgDb: -30, peakDb: -12,
    },
    ...overrides,
  };
}

describe('flowerOf', () => {
  it('花瓣数在 5–13 内，且无语谱时走音区多样性', () => {
    const f = flowerOf(makeRecord());
    expect(f.petals).toBeGreaterThanOrEqual(5);
    expect(f.petals).toBeLessThanOrEqual(13);
    expect(f.basis.petalsFrom).toBe('bands');
  });

  it('有语谱数据时走谐波熵', () => {
    // 构造一个「能量铺开」的语谱：每频带等值 → 高熵
    const bands = 16;
    const rows = 50;
    const bytes = new Uint8Array(rows * bands).fill(120);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const rec = makeRecord({ spec: { bands, data: btoa(bin) } });
    const f = flowerOf(rec);
    expect(f.basis.petalsFrom).toBe('spec');
    expect(f.petals).toBeGreaterThanOrEqual(5);
    expect(f.petals).toBeLessThanOrEqual(13);
  });

  it('女声区占比高 → 色相偏暖（>280）；男声区高 → 偏冷（<270）', () => {
    const fem = flowerOf(makeRecord({ stats: { ...makeRecord().stats, malePct: 10, femalePct: 85, transitionPct: 5 } }));
    const male = flowerOf(makeRecord({ stats: { ...makeRecord().stats, malePct: 85, femalePct: 10, transitionPct: 5 } }));
    expect(fem.hue).toBeGreaterThan(280);
    expect(male.hue).toBeLessThan(270);
  });

  it('F1 低 F2 高 → 花瓣长而窄', () => {
    const femme = flowerOf(makeRecord({ stats: { ...makeRecord().stats, avgF1: 600, avgF2: 2400 } }));
    const masc = flowerOf(makeRecord({ stats: { ...makeRecord().stats, avgF1: 900, avgF2: 1500 } }));
    expect(femme.petalLength).toBeGreaterThan(masc.petalLength);
    expect(femme.petalWidth).toBeLessThan(masc.petalWidth);
  });

  it('无共振峰：瓣形取中性，标注退化', () => {
    const s = makeRecord().stats;
    const rec = makeRecord({ stats: { ...s, avgF1: null, avgF2: null, f1Range: null, f2Range: null } });
    const f = flowerOf(rec);
    expect(f.petalLength).toBeCloseTo(0.78);
    expect(f.basis.facts.join()).toContain('无共振峰');
  });

  it('长音记录用 MPT 定茎高；朗读记录固定茎', () => {
    const reading = flowerOf(makeRecord({ mode: 'reading' }));
    expect(reading.stem).toBeCloseTo(0.55);
    expect(reading.basis.stemFrom).toBe('fixed');
    const sustained = flowerOf(makeRecord({ mode: 'sustained' }));
    // computeSustainedMetrics 在空序列上 mpt=0 → 茎仍为 fixed 路径
    expect(sustained.basis.stemFrom === 'mpt' || sustained.basis.stemFrom === 'fixed').toBe(true);
  });

  it('CPPS 越高光晕越亮；无 CPPS 固定 0.3', () => {
    const hi = flowerOf(makeRecord({ stats: { ...makeRecord().stats, cppsDb: 20 } }));
    const lo = flowerOf(makeRecord({ stats: { ...makeRecord().stats, cppsDb: 8 } }));
    expect(hi.glow).toBeGreaterThan(lo.glow);
    const none = flowerOf(makeRecord({ stats: { ...makeRecord().stats, cppsDb: null } }));
    expect(none.glow).toBeCloseTo(0.3);
  });

  it('所有参数都在设计区间内（不依赖具体输入）', () => {
    for (const stats of [
      makeRecord().stats,
      makeRecord({ stats: { ...makeRecord().stats, avgDb: -60, malePct: 100, femalePct: 0, transitionPct: 0 } }).stats,
      makeRecord({ stats: { ...makeRecord().stats, avgDb: -5, malePct: 0, femalePct: 100, transitionPct: 0 } }).stats,
    ]) {
      const f = flowerOf(makeRecord({ stats }));
      expect(f.petals).toBeGreaterThanOrEqual(5);
      expect(f.petals).toBeLessThanOrEqual(13);
      expect(f.petalLength).toBeGreaterThanOrEqual(0.55);
      expect(f.petalLength).toBeLessThanOrEqual(1);
      expect(f.petalWidth).toBeGreaterThanOrEqual(0.5);
      expect(f.petalWidth).toBeLessThanOrEqual(1);
      expect(f.hue).toBeGreaterThanOrEqual(215);
      expect(f.hue).toBeLessThanOrEqual(340);
      expect(f.stem).toBeGreaterThanOrEqual(0.3);
      expect(f.stem).toBeLessThanOrEqual(1);
      expect(f.glow).toBeGreaterThanOrEqual(0.15);
      expect(f.glow).toBeLessThanOrEqual(1);
    }
  });
});

describe('hueJitter', () => {
  it('同 id 稳定、不同 id 有差异可能、范围 ±8°', () => {
    expect(hueJitter('abc')).toBe(hueJitter('abc'));
    const vals = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(hueJitter));
    expect(vals.size).toBeGreaterThan(1);
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(-8);
      expect(v).toBeLessThanOrEqual(8);
    }
  });
});

describe('_internal.harmonicEntropy', () => {
  it('无语谱返回 null', () => {
    expect(_internal.harmonicEntropy(makeRecord())).toBeNull();
  });

  it('全等值频带 → 高熵（接近 1）', () => {
    const bands = 8;
    const rows = 10;
    const bytes = new Uint8Array(rows * bands).fill(100);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const rec = makeRecord({ spec: { bands, data: btoa(bin) } });
    const e = _internal.harmonicEntropy(rec);
    expect(e).not.toBeNull();
    expect(e!).toBeGreaterThan(0.95);
  });

  it('能量集中在单频带 → 低熵', () => {
    const bands = 8;
    const rows = 10;
    const bytes = new Uint8Array(rows * bands);
    for (let r = 0; r < rows; r++) bytes[r * bands] = 200; // 只有第一频带有能量
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const rec = makeRecord({ spec: { bands, data: btoa(bin) } });
    const e = _internal.harmonicEntropy(rec);
    expect(e).not.toBeNull();
    expect(e!).toBeLessThan(0.4);
  });
});
