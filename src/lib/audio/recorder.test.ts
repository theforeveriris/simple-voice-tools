import { describe, it, expect } from 'vitest';
import { computeStats, toRecordSeries, toRecordSpec, computeInTargetPct, recorder } from './recorder';
import { bytesFromBase64 } from './spectrogram';
import { SPEC_BANDS, SPEC_MAX_ROWS } from '@/constants';
import type { RecordSeries } from '@/types';

describe('recorder 模块导入安全性', () => {
  it('纯 Node 环境可导入且单例未处于录音态', () => {
    expect(recorder.isRecording()).toBe(false);
  });
});

describe('computeStats', () => {
  // 手工预算：f0 有声值 [100, 200, 220]，均值 173.33，std ≈ 52.49
  const series: RecordSeries = {
    t: [0, 0.1, 0.2, 0.3],
    f0: [100, null, 200, 220],
    rmsDb: [-40, -60, -30, -20],
    f1: [500, null, 700, 800],
    f2: [1500, null, 1800, 2000],
  };

  it('聚合统计与手工计算一致', () => {
    const s = computeStats(series, 30);
    expect(s.durationSec).toBe(0.3);
    expect(s.sampleHz).toBe(30);
    expect(s.totalSamples).toBe(4);
    expect(s.voicedSamples).toBe(3);
    expect(s.avgF0).toBeCloseTo(173.333, 2);
    expect(s.medianF0).toBe(200); // floor(3·0.5)=1 → 排序后第 1 位
    expect(s.minF0).toBe(100);
    expect(s.maxF0).toBe(220);
    expect(s.p10F0).toBe(100); // floor(3·0.1)=0
    expect(s.p90F0).toBe(220); // floor(3·0.9)=2
    expect(s.stdF0).toBeCloseTo(52.493, 2);
    // 默认音区边界 85/165/180/255：100→男声区，200/220→女声区
    expect(s.malePct).toBe(33);
    expect(s.femalePct).toBe(67);
    expect(s.transitionPct).toBe(0);
    // 响度只统计 -50dB 以上的发声帧 [-40,-30,-20]
    expect(s.avgDb).toBe(-30);
    expect(s.peakDb).toBe(-20);
    expect(s.avgF1).toBeCloseTo(666.667, 2);
    expect(s.avgF2).toBeCloseTo(1766.667, 2);
    expect(s.f1Range).toEqual([500, 800]);
    expect(s.f2Range).toEqual([1500, 2000]);
  });

  it('空序列返回零值与 null 范围', () => {
    const empty: RecordSeries = { t: [], f0: [], rmsDb: [], f1: [], f2: [] };
    const s = computeStats(empty, 30);
    expect(s.durationSec).toBe(0);
    expect(s.totalSamples).toBe(0);
    expect(s.avgF0).toBe(0);
    expect(s.minF0).toBe(0);
    expect(s.maxF0).toBe(0);
    expect(s.avgF1).toBeNull();
    expect(s.f1Range).toBeNull();
    expect(s.avgDb).toBe(-90);
    expect(s.peakDb).toBe(-90);
  });
});

describe('toRecordSeries', () => {
  it('NaN/非法值 → null、四舍五入、keepEvery 降采样', () => {
    const s = toRecordSeries(
      [0.12345, 0.22345, 0.32345],
      [123.46, NaN, -5],
      [-20.56, -90, -30.44],
      [700.6, NaN, Infinity],
      [1500.4, NaN, 1234.5],
      2,
    );
    expect(s.t).toEqual([0.123, 0.323]);
    expect(s.f0).toEqual([123.5, null]);
    expect(s.rmsDb).toEqual([-20.6, -30.4]);
    expect(s.f1).toEqual([701, null]);
    expect(s.f2).toEqual([1500, 1235]);
  });

  it('keepEvery=1 保留全部帧', () => {
    const s = toRecordSeries([0, 0.1, 0.2], [100, NaN, 120], [-30, -40, -50], [500, NaN, 600], [1500, NaN, 1700], 1);
    expect(s.t.length).toBe(3);
    expect(s.f0).toEqual([100, null, 120]);
  });
});

describe('toRecordSpec', () => {
  const mkRow = (v: number) => new Uint8Array(SPEC_BANDS).fill(v);

  it('编码为 base64 且解码内容一致', () => {
    const b64 = toRecordSpec([mkRow(1), mkRow(2), mkRow(3)], 1);
    expect(typeof b64).toBe('string');
    const bytes = bytesFromBase64(b64!);
    expect(bytes.length).toBe(3 * SPEC_BANDS);
    expect(bytes[0]).toBe(1);
    expect(bytes[SPEC_BANDS]).toBe(2);
    expect(bytes[2 * SPEC_BANDS]).toBe(3);
  });

  it('keepEvery 降采样行数', () => {
    const rows = Array.from({ length: 10 }, (_, i) => mkRow(i));
    const bytes = bytesFromBase64(toRecordSpec(rows, 2)!);
    expect(bytes.length).toBe(5 * SPEC_BANDS);
    expect(bytes[0]).toBe(0);
    expect(bytes[SPEC_BANDS]).toBe(2);
  });

  it('行数截断至 SPEC_MAX_ROWS', () => {
    const rows = Array.from({ length: SPEC_MAX_ROWS + 500 }, () => mkRow(7));
    const bytes = bytesFromBase64(toRecordSpec(rows, 1)!);
    expect(bytes.length).toBe(SPEC_MAX_ROWS * SPEC_BANDS);
  });

  it('空输入返回 undefined', () => {
    expect(toRecordSpec([], 1)).toBeUndefined();
  });
});

describe('computeInTargetPct', () => {
  it('未启用靶标（range 为空）返回 null', () => {
    const s: RecordSeries = { t: [0], f0: [100], rmsDb: [-30], f1: [], f2: [] };
    expect(computeInTargetPct(s, null)).toBeNull();
    expect(computeInTargetPct(s, undefined)).toBeNull();
  });

  it('只统计有声帧且计入区间内占比', () => {
    // 有声帧 [100, 200, 250]，区间内 [200, 250] → 2/3 ≈ 67%
    const s: RecordSeries = {
      t: [0, 0.1, 0.2, 0.3, 0.4],
      f0: [100, 200, null, 0, 250],
      rmsDb: [-30, -30, -90, -90, -30],
      f1: [],
      f2: [],
    };
    expect(computeInTargetPct(s, [150, 255])).toBe(67);
  });

  it('全部无声帧返回 null', () => {
    const s: RecordSeries = { t: [0, 0.1], f0: [null, 0], rmsDb: [-90, -90], f1: [], f2: [] };
    expect(computeInTargetPct(s, [100, 200])).toBeNull();
  });
});
