import { describe, it, expect, vi } from 'vitest';
import {
  applyEntry, emptyTotals, estimateTokens, normalizeTotals, usageSince,
  type LlmUsageEntry,
} from './llmUsage';

function entry(partial: Partial<LlmUsageEntry>): LlmUsageEntry {
  return {
    at: 1_700_000_000_000,
    feature: 'advice',
    model: 'test-model',
    promptTokens: 100,
    completionTokens: 200,
    est: false,
    ...partial,
  };
}

describe('estimateTokens', () => {
  it('空文本为 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('CJK 字符按 1 token/字计', () => {
    expect(estimateTokens('你好世界')).toBe(4);
  });

  it('拉丁字符按 4 字符 1 token 计（向上取整）', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('混合文本分别累计', () => {
    // 2 CJK + 8 latin → 2 + 2 = 4
    expect(estimateTokens('你好abcdefgh')).toBe(4);
  });
});

describe('applyEntry', () => {
  it('累进对应功能与 all 各一次', () => {
    const totals = emptyTotals();
    applyEntry(totals, entry({ feature: 'advice' }));
    applyEntry(totals, entry({ feature: 'weekly', promptTokens: 10, completionTokens: 20 }));
    applyEntry(totals, entry({ feature: 'advice', est: true }));
    expect(totals.byFeature.advice.calls).toBe(2);
    expect(totals.byFeature.advice.promptTokens).toBe(200);
    expect(totals.byFeature.advice.completionTokens).toBe(400);
    expect(totals.byFeature.advice.estCalls).toBe(1);
    expect(totals.byFeature.weekly.calls).toBe(1);
    expect(totals.all.calls).toBe(3);
    expect(totals.all.promptTokens).toBe(210);
    expect(totals.all.estCalls).toBe(1);
  });
});

describe('normalizeTotals', () => {
  it('null / 缺功能键时返回全零结构', () => {
    const t1 = normalizeTotals(null);
    expect(t1.all.calls).toBe(0);
    expect(t1.byFeature.translate.calls).toBe(0);
    const t2 = normalizeTotals({ byFeature: {} as never, all: undefined as never });
    expect(t2.byFeature.advice.calls).toBe(0);
  });

  it('非法数值被夹紧为 0，合法值保留', () => {
    const t = normalizeTotals({
      byFeature: {
        advice: { calls: -1, promptTokens: 'x' as unknown as number, completionTokens: 5, estCalls: 2 },
      } as never,
      all: { calls: 7, promptTokens: 1, completionTokens: 2, estCalls: 3 },
    });
    expect(t.byFeature.advice.calls).toBe(0);
    expect(t.byFeature.advice.promptTokens).toBe(0);
    expect(t.byFeature.advice.completionTokens).toBe(5);
    expect(t.all.calls).toBe(7);
  });
});

describe('usageSince', () => {
  it('只统计时间窗内的明细，跨功能累加', () => {
    const now = 1_700_000_000_000;
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const snap = {
        totals: emptyTotals(),
        log: [
          entry({ at: now - 1000, feature: 'advice' }), // 窗口内
          entry({ at: now - 3 * 24 * 3600 * 1000, feature: 'weekly', promptTokens: 10, completionTokens: 20 }), // 窗口内
          entry({ at: now - 10 * 24 * 3600 * 1000, feature: 'assistant', promptTokens: 999, completionTokens: 999 }), // 窗口外
        ],
      };
      const usage = usageSince(snap, 7 * 24 * 3600 * 1000);
      expect(usage.calls).toBe(2);
      expect(usage.promptTokens).toBe(110);
      expect(usage.completionTokens).toBe(220);
    } finally {
      dateNow.mockRestore();
    }
  });

  it('空日志返回全零', () => {
    const usage = usageSince({ totals: emptyTotals(), log: [] }, 1000);
    expect(usage.calls).toBe(0);
    expect(usage.promptTokens).toBe(0);
  });
});
