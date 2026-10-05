import { describe, it, expect } from 'vitest';
import { sampleRows, seriesTable, trendTable, toTsv } from './seriesTable';
import type { AnalysisRecord, RecordSeries } from '@/types';

describe('sampleRows', () => {
  it('不超上限时原样返回', () => {
    const rows = [1, 2, 3];
    expect(sampleRows(rows, 10)).toEqual([1, 2, 3]);
  });

  it('超限等距抽样，保留首末行', () => {
    const rows = Array.from({ length: 1001 }, (_, i) => i);
    const out = sampleRows(rows, 400);
    expect(out).toHaveLength(400);
    expect(out[0]).toBe(0);
    expect(out[399]).toBe(1000);
    // 等距：中间某点应接近线性位置
    expect(out[100]).toBeCloseTo(250, -1);
  });

  it('上限为 1 / 2 等边界不崩', () => {
    expect(sampleRows([1, 2, 3], 1)).toEqual([1]);
    expect(sampleRows([1, 2, 3], 2)).toEqual([1, 3]);
  });
});

const HEADERS = { time: 't', f0: 'F0', db: 'dB', f1: 'F1', f2: 'F2' };

function makeSeries(): RecordSeries {
  return {
    t: [0, 0.5, 1, 1.5, 2],
    f0: [200, null, 210.4, 220.6, 230],
    rmsDb: [-30.15, -28, -26.4, -25.3, -20],
    f1: [700, 710, null, 720, 730],
    f2: [1800, 1810, 1820, 1830, null],
  };
}

describe('seriesTable', () => {
  it('音高：区间过滤 + null 空串 + Hz 取整 + 时间两位小数', () => {
    const td = seriesTable('pitch', makeSeries(), [0.4, 2], HEADERS);
    expect(td.headers).toEqual(['t', 'F0']);
    expect(td.total).toBe(4);
    expect(td.rows[0]).toEqual(['0.50', '']);
    expect(td.rows[1]).toEqual(['1.00', '210']);
    expect(td.rows[3]).toEqual(['2.00', '230']);
    expect(td.shown).toBe(4);
  });

  it('能量：dB 一位小数；共振峰：F1/F2 两列', () => {
    const energy = seriesTable('energy', makeSeries(), [0, 2], HEADERS);
    expect(energy.rows[0]).toEqual(['0.00', '-30.1']); // -30.15 浮点就近取 -30.1
    expect(energy.rows[3][1]).toBe('-25.3');
    const formant = seriesTable('formant', makeSeries(), [0, 2], HEADERS);
    expect(formant.headers).toEqual(['t', 'F1', 'F2']);
    expect(formant.rows[0]).toEqual(['0.00', '700', '1800']);
  });

  it('帧数超上限时抽样渲染，total 仍为全量', () => {
    const n = 1000;
    const series: RecordSeries = {
      t: Array.from({ length: n }, (_, i) => i / n),
      f0: Array.from({ length: n }, (_, i) => 100 + i),
      rmsDb: Array.from({ length: n }, () => -30),
      f1: Array.from({ length: n }, () => 700),
      f2: Array.from({ length: n }, () => 1800),
    };
    const td = seriesTable('pitch', series, [0, 1], HEADERS);
    expect(td.total).toBe(1000);
    expect(td.shown).toBe(400);
    expect(td.rows).toHaveLength(400);
  });
});

const MODE_LABEL: Record<string, string> = { reading: '朗读', sustained: '长音' };

function makeRecord(id: string, createdAt: number, mode: 'reading' | 'sustained', stats: Partial<AnalysisRecord['stats']>): AnalysisRecord {
  return {
    id,
    createdAt,
    mode,
    durationSec: 10,
    sampleHz: 48000,
    series: { t: [], f0: [], rmsDb: [], f1: [], f2: [] },
    stats: {
      durationSec: 10,
      sampleHz: 48000,
      totalSamples: 0,
      voicedSamples: 0,
      avgF0: 0, medianF0: 0, minF0: 0, maxF0: 0, p10F0: 0, p90F0: 0, stdF0: 0,
      malePct: 0, femalePct: 0, transitionPct: 0,
      avgF1: null, avgF2: null, f1Range: null, f2Range: null,
      avgDb: 0, peakDb: 0,
      ...stats,
    } as AnalysisRecord['stats'],
  };
}

describe('trendTable', () => {
  const records = [
    makeRecord('a', 1000, 'reading', { avgF0: 180.25, p10F0: 140.4, p90F0: 230.6 }),
    makeRecord('b', 2000, 'sustained', { avgF0: 0, p10F0: 120, p90F0: 150 }),
  ];

  it('f0 指标：时间/模式/均值/P10–P90，无效均值留空', () => {
    const td = trendTable(records, 'f0', {
      date: 'd', mode: 'm', valueF0: 'F0', valueMpt: 'MPT', valueCpps: 'CPPS', p10p90: 'P10–P90',
      modeOf: (m) => MODE_LABEL[m] ?? m,
    });
    expect(td.headers).toEqual(['d', 'm', 'F0', 'P10–P90']);
    expect(td.rows[0]).toEqual(['1/1 08:00', '朗读', '180.3', '140–231']);
    expect(td.rows[1][2]).toBe(''); // avgF0 = 0 → null → 空
  });

  it('cpps 指标：无值留空、有值一位小数', () => {
    const withCpps = [
      ...records,
      makeRecord('c', 3000, 'reading', { avgF0: 200, cppsDb: 14.26 }),
    ];
    const td = trendTable(withCpps, 'cpps', {
      date: 'd', mode: 'm', valueF0: 'F0', valueMpt: 'MPT', valueCpps: 'CPPS', p10p90: 'P',
      modeOf: (m) => MODE_LABEL[m] ?? m,
    });
    expect(td.headers).toEqual(['d', 'm', 'CPPS']);
    expect(td.rows[0][2]).toBe('');
    expect(td.rows[2][2]).toBe('14.3');
  });

  it('toTsv 输出表头 + 全部行（制表符分隔）', () => {
    const td = trendTable(records, 'f0', {
      date: 'd', mode: 'm', valueF0: 'F0', valueMpt: 'MPT', valueCpps: 'CPPS', p10p90: 'P',
      modeOf: (m) => m,
    });
    const tsv = toTsv(td);
    const lines = tsv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('d\tm\tF0\tP');
    expect(lines[1].split('\t')).toHaveLength(4);
  });
});
