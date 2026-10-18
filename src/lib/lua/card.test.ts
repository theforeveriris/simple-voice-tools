/**
 * Lua 分享卡模板测试（指令规范化）
 */

import { describe, expect, it } from 'vitest';
import { runLuaFn } from './engine';
import { normalizeOps, safeColor, CARD_W, CARD_H } from './card';
import darkMinimalCard from '../../../lua-scripts/card/dark-minimal.lua?raw';
import type { AnalysisRecord } from '@/types';

function fake(): AnalysisRecord {
  return {
    id: 't1', createdAt: 1735689600000, durationSec: 10, sampleHz: 30,
    series: { t: [], f0: [], rmsDb: [], f1: [], f2: [] },
    stats: {
      durationSec: 10, sampleHz: 30, totalSamples: 300, voicedSamples: 250,
      avgF0: 180, medianF0: 175, minF0: 120, maxF0: 240, p10F0: 140, p90F0: 220,
      stdF0: 20, malePct: 10, femalePct: 70, transitionPct: 20,
      avgF1: 600, avgF2: 1800, f2f1GapHz: 1200, avgDb: -30, peakDb: -12,
    },
    mode: 'reading',
  } as unknown as AnalysisRecord;
}

describe('lua card template', () => {
  it('builtin dark-minimal template returns valid ops', async () => {
    const rec = fake();
    const res = await runLuaFn<unknown>(darkMinimalCard, 'template', [{
      id: rec.id, createdAt: rec.createdAt, dateStr: '2025/1/1 12:00',
      durationSec: rec.durationSec, mode: rec.mode, note: '',
      stats: { ...rec.stats, target: { enabled: false, min: 130, max: 210 } },
    }]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ops = normalizeOps(res.value);
    expect(ops.length).toBeGreaterThan(8);
    expect(ops[0].op).toBe('bg');
    // 内置子绘制存在
    expect(ops.some((o) => o.op === 'ruler')).toBe(true);
    expect(ops.some((o) => o.op === 'pitch')).toBe(true);
    expect(ops.some((o) => o.op === 'qr')).toBe(true);
  });

  it('normalizeOps drops invalid entries', () => {
    const ops = normalizeOps([
      { op: 'text', text: 'hi', x: 1, y: 2 },
      { op: 'unknown' }, // 未知 op 丢弃
      { op: 'text' }, // 缺 text 丢弃
      'junk', // 非对象丢弃
      { op: 'rect', x: 1, y: 2, w: 3, h: 4, color: 'not-a-color' }, // 保留（颜色渲染时回退）
    ]);
    expect(ops.map((o) => o.op)).toEqual(['text', 'rect']);
  });

  it('safeColor validates hex', () => {
    expect(safeColor('#FF00AA', '#000')).toBe('#FF00AA');
    expect(safeColor('#ff00aa80', '#000')).toBe('#ff00aa80');
    expect(safeColor('red', '#000')).toBe('#000');
    expect(safeColor(undefined, '#000')).toBe('#000');
  });

  it('card size constants match the built-in card', () => {
    expect(CARD_W).toBe(1080);
    expect(CARD_H).toBe(1350);
  });
});
