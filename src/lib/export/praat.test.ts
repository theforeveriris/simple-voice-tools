import { describe, it, expect } from 'vitest';
import { recordToPitchTier, recordToFormant } from './praat';
import type { AnalysisRecord, RecordSeries } from '@/types';

function makeRecord(): AnalysisRecord {
  // 6 帧 @30fps：F0 三帧有声（150/160/155），F1/F2 各有一帧缺失
  const series: RecordSeries = {
    t: [0, 1 / 30, 2 / 30, 3 / 30, 4 / 30, 5 / 30],
    f0: [150.25, 160, null, 155, null, 152],
    rmsDb: [-20, -19, -21, -18.5, -22, -19],
    f1: [750, 760, 770, null, 755, 745],
    f2: [1200, null, 1220, 1210, 1190, 1185],
  };
  return {
    id: 'rec-1',
    createdAt: 1700000000000,
    durationSec: 5 / 30,
    sampleHz: 30,
    series,
    stats: {
      durationSec: 5 / 30, sampleHz: 30, totalSamples: 6, voicedSamples: 4,
      avgF0: 154, medianF0: 154, minF0: 150, maxF0: 160, p10F0: 150, p90F0: 160, stdF0: 4,
      malePct: 0, femalePct: 0, transitionPct: 0,
      avgF1: 756, avgF2: 1201, f1Range: [745, 770], f2Range: [1185, 1220],
      avgDb: -20, peakDb: -15,
    },
  };
}

/** 行式 token 读取（oo 文本 reader 的极简等价：`name = value` / `name [i]:` / `name: size = N`） */
function readLines(text: string): { raw: string; indent: number }[] {
  return text.split('\n').map((raw) => ({
    raw,
    indent: raw.length - raw.trimStart().length,
  }));
}

describe('recordToPitchTier', () => {
  it('头部 + points: size + 逐点 number/value；只含有声帧，时间递增', () => {
    const text = recordToPitchTier(makeRecord());
    const lines = readLines(text);
    expect(lines[0].raw).toBe('File type = "ooTextFile"');
    expect(lines[1].raw).toBe('Object class = "PitchTier"');

    const sizeLine = lines.find((l) => l.raw.startsWith('points: size ='));
    expect(sizeLine?.raw).toBe('points: size = 4');

    // 逐点块
    const pointOpens = lines.filter((l) => /^\tpoints \[\d+\]:$/.test(l.raw));
    expect(pointOpens).toHaveLength(4);
    const numbers = lines.filter((l) => l.raw.trim().startsWith('number =')).map((l) => Number(l.raw.split('= ')[1]));
    const values = lines.filter((l) => l.raw.trim().startsWith('value =')).map((l) => Number(l.raw.split('= ')[1]));
    expect(numbers).toEqual([0, 1 / 30, 3 / 30, 5 / 30]);
    expect(values).toEqual([150.25, 160, 155, 152]);
    // xmin/xmax 取首末 point 时间
    expect(text).toContain('xmin = 0\n');
    expect(text).toContain(`xmax = ${5 / 30}\n`);
  });

  it('全部无声时 size = 0 且无点块', () => {
    const rec = makeRecord();
    rec.series.f0 = rec.series.f0.map(() => null);
    const text = recordToPitchTier(rec);
    expect(text).toContain('points: size = 0');
    expect(text).not.toContain('number =');
  });
});

describe('recordToFormant', () => {
  it('帧网格（nx/dx/x1）+ 逐帧 intensity/numberOfFormants/formant；缺检帧写 (empty)', () => {
    const rec = makeRecord();
    const text = recordToFormant(rec);
    const lines = readLines(text);
    expect(lines[1].raw).toBe('Object class = "Formant"');
    expect(text).toContain('nx = 6\n');
    expect(text).toContain(`dx = ${1 / 30}\n`);
    expect(text).toContain('x1 = 0\n');
    expect(text).toContain('maxnFormants = 2\n');
    expect(lines.filter((l) => /^\tframes \[\d+\]:$/.test(l.raw))).toHaveLength(6);

    // 帧 4（f1 缺失）只有 F2 一条；帧 3（f0 无声但 f1/f2 有值）仍写两条——序列为准
    const emptyFrames = lines.filter((l) => l.raw.includes('formant []: (empty)'));
    expect(emptyFrames).toHaveLength(0); // 每帧 F1/F2 至少一个有值

    const frequencies = lines.filter((l) => l.raw.includes('frequency =')).map((l) => Number(l.raw.split('= ')[1]));
    expect(frequencies).toHaveLength(10); // 12 列 - f1 缺 1 - f2 缺 1
  });

  it('某帧 F1/F2 全缺时写 numberOfFormants = 0 + (empty)', () => {
    const rec = makeRecord();
    rec.series.f1 = rec.series.f1.map(() => null);
    rec.series.f2 = rec.series.f2.map(() => null);
    const text = recordToFormant(rec);
    expect(text).toContain('numberOfFormants = 0');
    expect(text.match(/formant \[\]: \(empty\)/g)).toHaveLength(6);
    expect(text).not.toContain('frequency =');
  });
});
