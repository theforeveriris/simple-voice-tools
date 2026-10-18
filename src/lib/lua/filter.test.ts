/**
 * Lua 记录过滤器测试
 */

import { describe, expect, it } from 'vitest';
import { isLuaFilter, luaFilterExpr, luaFilterRecords } from './filter';
import type { AnalysisRecord } from '@/types';

function fake(id: string, over: Partial<AnalysisRecord['stats']>, mode: AnalysisRecord['mode'] = 'reading', note = ''): AnalysisRecord {
  return {
    id,
    createdAt: 0,
    durationSec: 10,
    sampleHz: 30,
    series: { t: [], f0: [], rmsDb: [], f1: [], f2: [] },
    stats: {
      durationSec: 10, sampleHz: 30, totalSamples: 300, voicedSamples: 250,
      avgF0: 180, medianF0: 175, minF0: 120, maxF0: 240, p10F0: 140, p90F0: 220,
      stdF0: 20, malePct: 10, femalePct: 70, transitionPct: 20,
      avgF1: 600, avgF2: 1800, f2f1GapHz: 1200, avgDb: -30, peakDb: -12,
      ...over,
    },
    mode,
    note,
  } as AnalysisRecord;
}

describe('lua filter', () => {
  it('detects lua: prefix and extracts expression', () => {
    expect(isLuaFilter('lua:stats.avgF0 < 100')).toBe(true);
    expect(isLuaFilter('  LUA:x')).toBe(true);
    expect(isLuaFilter('plain search')).toBe(false);
    expect(luaFilterExpr('lua: stats.avgF0 < 100 ')).toBe('stats.avgF0 < 100');
  });

  it('filters records by expression', async () => {
    const recs = [
      fake('a', { avgF0: 120 }),
      fake('b', { avgF0: 200 }),
      fake('c', { avgF0: 150 }, 'sustained'),
    ];
    const { hits, error } = await luaFilterRecords(recs, "stats.avgF0 < 160 and record.mode == 'reading'");
    expect(error).toBeNull();
    expect([...hits]).toEqual(['a']);
  });

  it('can access record fields and note', async () => {
    const recs = [fake('a', { avgF0: 120 }, 'reading', '晨起'), fake('b', { avgF0: 130 })];
    const { hits } = await luaFilterRecords(recs, "note ~= ''");
    expect([...hits]).toEqual(['a']);
    const r2 = await luaFilterRecords(recs, "record.mode == 'reading' and record.note == ''");
    expect([...r2.hits]).toEqual(['b']);
  });

  it('null stats fields compare as nil without crashing', async () => {
    const recs = [fake('a', { jitterPct: null })];
    const { hits, error } = await luaFilterRecords(recs, 'stats.jitterPct == nil');
    expect(error).toBeNull();
    expect([...hits]).toEqual(['a']);
  });

  it('syntax errors surface as error with no hits', async () => {
    const recs = [fake('a', {})];
    const { hits, error } = await luaFilterRecords(recs, 'stats.avgF0 <');
    expect(hits.size).toBe(0);
    expect(error).toBeTruthy();
  });

  it('empty expression matches nothing but no error', async () => {
    const recs = [fake('a', {})];
    const { hits, error } = await luaFilterRecords(recs, '');
    expect(error).toBeNull();
    expect(hits.size).toBe(0);
  });
});
