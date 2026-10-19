import { describe, it, expect } from 'vitest';
import { flowerOf, rotationJitter, _internal } from './flower';
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

/** 造一个「某频带独强」的语谱 */
function specWithPeak(bands: number, peakBand: number, fill = 100, peak = 255): AnalysisRecord {
  const rows = 50;
  const bytes = new Uint8Array(rows * bands);
  for (let r = 0; r < rows; r++) {
    for (let b = 0; b < bands; b++) bytes[r * bands + b] = b === peakBand ? peak : fill;
  }
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return makeRecord({ spec: { bands, data: btoa(bin) } });
}

describe('flowerOf v2 — 俯视频谱指纹', () => {
  it('有语谱：瓣数 = 频带数，瓣长 = 能量归一化', () => {
    const rec = specWithPeak(10, 2);
    const f = flowerOf(rec);
    expect(f.petals).toHaveLength(10);
    expect(f.basis.petalsFrom).toBe('spec');
    // peak 瓣最长
    const longest = f.petals.reduce((a, p) => (p.length > a.length ? p : a));
    expect(longest.bandHz).not.toBeNull();
  });

  it('角度：低频在正上方（0°），顺时针排布', () => {
    const f = flowerOf(specWithPeak(8, 0));
    expect(f.petals[0].angleDeg).toBe(0);
    expect(f.petals[1].angleDeg).toBe(45);
    expect(f.petals[7].angleDeg).toBe(315);
  });

  it('能量集中在单频带 → 该瓣最长、其余短（瓣参差大）', () => {
    const f = flowerOf(specWithPeak(8, 3, 10, 255));
    const lengths = f.petals.map((p) => p.length);
    const max = Math.max(...lengths);
    const min = Math.min(...lengths);
    expect(max - min).toBeGreaterThan(0.4);
  });

  it('平坦频谱 → 瓣长接近（参差小）', () => {
    const f = flowerOf(specWithPeak(8, -1, 200, 200)); // -1 不会命中，全 fill
    const lengths = f.petals.map((p) => p.length);
    const max = Math.max(...lengths);
    const min = Math.min(...lengths);
    expect(max - min).toBeLessThan(0.15);
  });

  it('无语谱：模版瓣（8 瓣、bandHz null、瓣长 0.55–0.8）', () => {
    const f = flowerOf(makeRecord());
    expect(f.petals).toHaveLength(8);
    expect(f.basis.petalsFrom).toBe('template');
    for (const p of f.petals) {
      expect(p.bandHz).toBeNull();
      expect(p.length).toBeGreaterThanOrEqual(0.55);
      expect(p.length).toBeLessThanOrEqual(0.8);
    }
  });

  it('花心 = F1：F1 小 → 花心小', () => {
    const small = flowerOf(makeRecord({ stats: { ...makeRecord().stats, avgF1: 550 } }));
    const large = flowerOf(makeRecord({ stats: { ...makeRecord().stats, avgF1: 950 } }));
    expect(small.coreF1).toBeLessThan(large.coreF1);
  });

  it('瓣长基线 = F2：F2 高 → 基线大，且瓣尖更尖锐', () => {
    const hi = flowerOf(makeRecord({ stats: { ...makeRecord().stats, avgF2: 2500 } }));
    const lo = flowerOf(makeRecord({ stats: { ...makeRecord().stats, avgF2: 1500 } }));
    expect(hi.baselineF2).toBeGreaterThan(lo.baselineF2);
    expect(hi.tipSharpness).toBeGreaterThan(lo.tipSharpness);
  });

  it('无共振峰：花心/基线取中性（0.8），瓣尖中性（0.5）', () => {
    const s = makeRecord().stats;
    const f = flowerOf(makeRecord({ stats: { ...s, avgF1: null, avgF2: null, f1Range: null, f2Range: null } }));
    expect(f.coreF1).toBeCloseTo(0.8);
    expect(f.baselineF2).toBeCloseTo(0.8);
    expect(f.tipSharpness).toBeCloseTo(0.5);
    expect(f.basis.facts.join()).toContain('无共振峰');
  });

  it('所有瓣长在 0.15–1 区间（不依赖具体输入）', () => {
    for (const rec of [specWithPeak(16, 5), specWithPeak(6, 0), makeRecord()]) {
      const f = flowerOf(rec);
      for (const p of f.petals) {
        expect(p.length).toBeGreaterThanOrEqual(0.15);
        expect(p.length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('rotationJitter', () => {
  it('同 id 稳定、范围 ±10°', () => {
    expect(rotationJitter('abc')).toBe(rotationJitter('abc'));
    for (const id of ['a', 'xyz', 'long-id-123']) {
      const v = rotationJitter(id);
      expect(v).toBeGreaterThanOrEqual(-10);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});

describe('_internal.bandEnergies', () => {
  it('无语谱返回 null', () => {
    expect(_internal.bandEnergies(makeRecord())).toBeNull();
  });

  it('频带中心频率为对数轴（低频在数组前段）', () => {
    const rec = specWithPeak(8, 0);
    const { hz } = _internal.bandEnergies(rec)!;
    expect(hz[0]).toBeLessThan(hz[3]);
    expect(hz[3]).toBeLessThan(hz[7]);
    // 与录音管线语谱分带同源：80 Hz（SPEC_FMIN）→ 5000 Hz（SPEC_FMAX）
    expect(hz[0]).toBeGreaterThanOrEqual(80);
    expect(hz[7]).toBeLessThanOrEqual(5000);
  });
});
