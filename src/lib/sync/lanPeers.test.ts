import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getRecentPeers, rememberPeer } from './lanPeers';

function mockStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', mockStorage());
});

describe('lanPeers', () => {
  it('初始为空', () => {
    expect(getRecentPeers()).toEqual([]);
  });

  it('记住对端：最新在前', () => {
    rememberPeer('Phone');
    rememberPeer('PC');
    expect(getRecentPeers().map((p) => p.name)).toEqual(['PC', 'Phone']);
  });

  it('重复记住同一设备只置顶不重复', () => {
    rememberPeer('Phone');
    rememberPeer('PC');
    rememberPeer('Phone');
    const names = getRecentPeers().map((p) => p.name);
    expect(names).toEqual(['Phone', 'PC']);
    expect(names.filter((n) => n === 'Phone')).toHaveLength(1);
  });

  it('最多保留 5 条', () => {
    for (let i = 0; i < 8; i++) rememberPeer(`dev-${i}`);
    const names = getRecentPeers().map((p) => p.name);
    expect(names).toHaveLength(5);
    expect(names[0]).toBe('dev-7');
  });

  it('空名忽略', () => {
    rememberPeer('   ');
    expect(getRecentPeers()).toEqual([]);
  });
});
