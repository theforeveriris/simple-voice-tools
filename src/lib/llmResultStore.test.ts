import { describe, it, expect } from 'vitest';
import { loadLlmResult, saveLlmResult } from './llmResultStore';
import type { LlmAdviceResult } from './llm';

function result(summary: string): LlmAdviceResult {
  return { summary, assessments: [], advice: ['建议一'] };
}

// 单测环境无 IndexedDB：llmResultStore 退化为会话内存缓存，语义（命中/覆盖/封顶）不变

describe('llmResultStore', () => {
  it('未保存时返回 null', async () => {
    expect(await loadLlmResult('k-empty')).toBeNull();
  });

  it('保存后同键命中，不同键不串', async () => {
    saveLlmResult('k-a', result('A'));
    saveLlmResult('k-b', result('B'));
    expect((await loadLlmResult('k-a'))?.summary).toBe('A');
    expect((await loadLlmResult('k-b'))?.summary).toBe('B');
    expect(await loadLlmResult('k-c')).toBeNull();
  });

  it('同键覆盖', async () => {
    saveLlmResult('k-over', result('旧'));
    saveLlmResult('k-over', result('新'));
    expect((await loadLlmResult('k-over'))?.summary).toBe('新');
  });

  it('封顶：最旧的键被挤出（MAX_RESULTS = 50）', async () => {
    for (let i = 0; i < 51; i++) saveLlmResult(`k-cap-${i}`, result(`v${i}`));
    expect(await loadLlmResult('k-cap-0')).toBeNull();
    expect((await loadLlmResult('k-cap-50'))?.summary).toBe('v50');
  });
});
