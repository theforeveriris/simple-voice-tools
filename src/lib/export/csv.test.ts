import { describe, it, expect } from 'vitest';
import { recordToFrameCsv, recordsToSummaryCsv } from './csv';
import type { AnalysisRecord, VoiceStats } from '@/types';

function makeStats(): VoiceStats {
  return {
    durationSec: 12.34,
    sampleHz: 30,
    totalSamples: 370,
    voicedSamples: 300,
    avgF0: 173.3,
    medianF0: 200,
    minF0: 100,
    maxF0: 221,
    p10F0: 99,
    p90F0: 230,
    stdF0: 52.5,
    malePct: 33,
    femalePct: 67,
    transitionPct: 0,
    avgF1: 667,
    avgF2: 1767,
    f1Range: [500, 800],
    f2Range: [1500, 2000],
    avgDb: -31.3,
    peakDb: -20,
    jitterPct: null,
    shimmerPct: null,
    hnrDb: null,
    cppsDb: 12.3,
  };
}

function makeRecord(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id: 'r1',
    createdAt: Date.UTC(2024, 0, 2, 3, 4, 5),
    durationSec: 12.34,
    sampleHz: 30,
    series: {
      t: [0.12345, 1],
      f0: [123.46, null],
      rmsDb: [-20.56, -90],
      f1: [700.6, null],
      f2: [1500.44, 2000],
    },
    stats: makeStats(),
    ...overrides,
  };
}

describe('recordToFrameCsv', () => {
  it('表头 + 帧级数据：舍入与 null → 空单元格', () => {
    const csv = recordToFrameCsv(makeRecord());
    const lines = csv.split('\n');
    expect(lines[0]).toBe('t_s,f0_hz,rms_db,f1_hz,f2_hz');
    expect(lines[1]).toBe('0.123,123.5,-20.6,701,1500');
    expect(lines[2]).toBe('1,,-90,,2000');
  });
});

describe('recordsToSummaryCsv', () => {
  it('表头字段齐全', () => {
    const csv = recordsToSummaryCsv([makeRecord()]);
    const header = csv.split('\n')[0];
    expect(header).toBe(
      'id,created_at,mode,note,duration_sec,'
      + 'avg_f0_hz,median_f0_hz,min_f0_hz,max_f0_hz,p10_f0_hz,p90_f0_hz,std_f0_hz,'
      + 'male_pct,female_pct,transition_pct,avg_f1_hz,avg_f2_hz,avg_db,peak_db,'
      + 'jitter_pct,shimmer_pct,hnr_db,cpps_db',
    );
  });

  it('数值舍入、null 指标为空单元格、ISO 时间', () => {
    const line = recordsToSummaryCsv([
      makeRecord({ id: 'r2', createdAt: 0 }),
    ]).split('\n')[1];
    const fields = line.split(',');
    expect(fields[0]).toBe('r2');
    expect(fields[1]).toBe('1970-01-01T00:00:00.000Z');
    expect(fields[2]).toBe(''); // 无 mode
    expect(fields[3]).toBe(''); // 无 note
    expect(fields[4]).toBe('12.3');
    expect(fields[5]).toBe('173.3');
    expect(fields[7]).toBe('100');
    expect(fields[19]).toBe(''); // jitter null
    expect(fields[22]).toBe('12.3'); // cpps
  });

  it('备注含逗号/引号时按 CSV 规则转义', () => {
    const csv = recordsToSummaryCsv([
      makeRecord({ note: '晨读, 说 "啊"' }),
    ]);
    expect(csv).toContain('"晨读, 说 ""啊"""');
  });
});
