import { describe, it, expect, beforeEach, vi } from 'vitest';

/** 可控的 kv 后端：模拟 IndexedDB 瞬态失败 / 已存档案 */
const h = vi.hoisted(() => ({
  failGet: false,
  stored: null as unknown,
  puts: [] as unknown[],
}));

vi.mock('@/lib/storage/idb', () => ({
  idbGetKV: async () => {
    if (h.failGet) throw new Error('IndexedDB blocked');
    return h.stored ?? undefined;
  },
  idbPutKV: async (_key: string, value: unknown) => {
    h.puts.push(value);
    h.stored = value;
  },
}));

const existing = {
  id: 'p_old',
  name: '旧档案',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-keep-me',
  modelId: 'm1',
};

async function freshModule() {
  vi.resetModules();
  return import('./llmProfiles');
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  h.failGet = false;
  h.stored = null;
  h.puts = [];
});

describe('llmProfiles 落盘保护', () => {
  it('读取失败时不落盘，避免把存储里的档案（含 API Key）整键覆盖', async () => {
    h.failGet = true;
    h.stored = [existing];
    const m = await freshModule();

    m.addProfile('新档案', { baseUrl: 'u2', apiKey: 'sk-new', modelId: 'm2' });
    await flush();

    expect(h.puts).toEqual([]);
    // 本会话内存态仍可用
    expect((m.getProfilesSnapshot() ?? []).map((p) => p.name)).toContain('新档案');
  });

  it('读取成功后新增档案按 id 合并，不覆盖已有档案', async () => {
    h.stored = [existing];
    const m = await freshModule();
    await m.profilesReady();

    m.addProfile('新档案', { baseUrl: 'u2', apiKey: 'sk-new', modelId: 'm2' });
    await flush();

    const written = h.puts.at(-1) as { id: string; name: string; apiKey: string }[];
    expect(written.map((p) => p.name).sort()).toEqual(['新档案', '旧档案'].sort());
    expect(written.find((p) => p.id === 'p_old')?.apiKey).toBe('sk-keep-me');
  });

  it('加载期间写入的档案在后端读取成功后仍然保留', async () => {
    h.stored = [existing];
    const m = await freshModule();
    // 未 await load 就写入（模拟 UI 抢跑）
    m.addProfile('抢跑档案', { baseUrl: 'u3', apiKey: 'sk-rush', modelId: 'm3' });
    await m.profilesReady();
    await flush();

    const names = (m.getProfilesSnapshot() ?? []).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['抢跑档案', '旧档案']));
  });
});
