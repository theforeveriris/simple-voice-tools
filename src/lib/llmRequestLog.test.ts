import { describe, it, expect, vi, beforeEach } from 'vitest';

// 内存版 kv 仓库模拟 IndexedDB（单测环境无 indexedDB）
const kvStore = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/lib/storage/idb', () => ({
  idbGetKV: async (key: string) => kvStore.get(key),
  idbPutKV: async (key: string, value: unknown) => {
    kvStore.set(key, structuredClone(value));
  },
  idbDeleteKV: async (key: string) => {
    kvStore.delete(key);
  },
}));

import { recordLlmRequest, readLlmRequestLog, clearLlmRequestLog } from './llmRequestLog';

const CFG = { baseUrl: 'https://api.example.com/v1', modelId: 'test-model' };

describe('llmRequestLog', () => {
  beforeEach(async () => {
    kvStore.clear();
    await clearLlmRequestLog();
  });

  it('记录一次请求并可读回（feature/model/host/stream）', async () => {
    await recordLlmRequest('advice', CFG, {
      model: CFG.modelId,
      temperature: 0.4,
      messages: [{ role: 'user', content: 'hello' }],
    }, true);
    const log = await readLlmRequestLog();
    expect(log).toHaveLength(1);
    expect(log[0].feature).toBe('advice');
    expect(log[0].model).toBe('test-model');
    expect(log[0].host).toBe('api.example.com');
    expect(log[0].stream).toBe(true);
  });

  it('请求体为完整 JSON（含 messages），不含任何密钥字段', async () => {
    await recordLlmRequest('weekly', CFG, {
      model: CFG.modelId,
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'user payload' },
      ],
    }, false);
    const log = await readLlmRequestLog();
    const body = JSON.parse(log[0].body) as { model: string; messages: { role: string }[] };
    expect(body.model).toBe('test-model');
    expect(body.messages).toHaveLength(2);
    expect(log[0].body).not.toContain('apiKey');
  });

  it('超长 content 被截断并标注剩余长度', async () => {
    const long = 'x'.repeat(5000);
    await recordLlmRequest('translate', CFG, {
      messages: [{ role: 'user', content: long }],
    }, false);
    const log = await readLlmRequestLog();
    expect(log[0].body).toContain('…(1000 more chars)');
  });

  it('封顶 10 条，新的在前', async () => {
    for (let i = 0; i < 13; i++) {
      await recordLlmRequest('test', CFG, { messages: [{ role: 'user', content: `req-${i}` }] }, false);
    }
    const log = await readLlmRequestLog();
    expect(log).toHaveLength(10);
    expect(log[0].body).toContain('req-12');
    expect(log[9].body).toContain('req-3');
  });

  it('feature 未标注时计为 other；清空后为空', async () => {
    await recordLlmRequest(undefined, CFG, { messages: [] }, false);
    let log = await readLlmRequestLog();
    expect(log[0].feature).toBe('other');
    await clearLlmRequestLog();
    log = await readLlmRequestLog();
    expect(log).toHaveLength(0);
  });
});
