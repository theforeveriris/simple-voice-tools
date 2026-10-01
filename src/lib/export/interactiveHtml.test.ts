import { describe, it, expect } from 'vitest';
import { buildInteractiveHtml } from './interactiveHtml';
import { computeStats, toRecordSeries } from '../audio/recorder';
import type { AnalysisRecord } from '@/types';

/** 构造一条最小的合法记录（2 秒 @30Hz） */
function makeRecord(): AnalysisRecord {
  const t: number[] = [];
  const f0: number[] = [];
  const db: number[] = [];
  const f1: number[] = [];
  const f2: number[] = [];
  for (let i = 0; i < 60; i++) {
    t.push(i / 30);
    f0.push(120 + Math.sin(i / 10) * 10);
    db.push(-30);
    f1.push(500);
    f2.push(1500);
  }
  const series = toRecordSeries(t, f0, db, f1, f2, 1);
  return {
    id: 'abcd1234-0000-0000-0000-000000000000',
    createdAt: 1730000000000,
    durationSec: 2,
    sampleHz: 30,
    series,
    stats: computeStats(series, 30),
    mode: 'reading',
    spec: { bands: 64, data: 'AAAA' },
  };
}

describe('buildInteractiveHtml', () => {
  it('生成自包含 HTML：含数据脚本、运行时与统计', async () => {
    const html = await buildInteractiveHtml(makeRecord(), { audio: null });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('id="svt-data"');
    expect(html).toContain('svt-data');
    // 恰好两个脚本闭合标签（数据 + 运行时），payload 中的 < 已转义
    expect(html.split('</' + 'script>').length - 1).toBe(2);

    const m = html.match(/id="svt-data">([\s\S]*?)<\/script>/);
    expect(m).not.toBeNull();
    const payload = JSON.parse(m![1]) as {
      meta: { durationSec: number };
      stats: [string, string][];
      series: { t: number[] };
      audio: { mime: string; data: string } | null;
      spec: { bands: number } | null;
    };
    expect(payload.meta.durationSec).toBe(2);
    expect(payload.series.t.length).toBe(60);
    expect(payload.stats.length).toBeGreaterThanOrEqual(20);
    expect(payload.audio).toBeNull();
    expect(payload.spec?.bands).toBe(64);
  });

  it('含音频时内嵌 base64 数据（运行时拼 data URL）', async () => {
    const audio = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    const html = await buildInteractiveHtml(makeRecord(), { audio });
    // 运行时由 mime + base64 拼 data URL
    expect(html).toContain("D.audio.mime + ';base64,'");
    const m = html.match(/id="svt-data">([\s\S]*?)<\/script>/);
    const payload = JSON.parse(m![1]) as { audio: { mime: string; data: string } };
    expect(payload.audio.mime).toBe('audio/webm');
    expect(payload.audio.data.length).toBeGreaterThan(0);
  });
});
