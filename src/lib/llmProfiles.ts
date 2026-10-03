/**
 * 大模型接口配置档案（多套 baseUrl / API Key / 模型一键切换）
 * 档案整体存 IndexedDB kv（llm:profiles）——API Key 属敏感凭据，与 llm-api-key
 * 同理不进 localStorage / 设置导出。应用档案 = 把值写回设置里的
 * llmBaseUrl / llmApiKey / llmModelId 三个活动字段（llmActiveProfileId 只作选中态
 * 记录），现有消费方（resolveLlmConfig 等）零改动。
 * 内存快照 + 订阅（useSyncExternalStore），写操作经串行队列落 kv。
 */

import { idbGetKV, idbPutKV } from '@/lib/storage/idb';

export interface LlmProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

const KV_PROFILES = 'llm:profiles';

let profiles: LlmProfile[] | null = null;
const listeners = new Set<() => void>();
let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const next = queue.then(task);
  queue = next.catch(() => {});
  return next;
}

function notify(): void {
  for (const fn of listeners) fn();
}

async function ensureLoaded(): Promise<void> {
  if (profiles != null) return;
  try {
    const raw = await idbGetKV<LlmProfile[]>(KV_PROFILES);
    profiles = Array.isArray(raw)
      ? raw.filter((p): p is LlmProfile =>
        !!p && typeof p === 'object'
        && typeof p.id === 'string' && typeof p.name === 'string'
        && typeof p.baseUrl === 'string' && typeof p.apiKey === 'string'
        && typeof p.modelId === 'string')
      : [];
  } catch {
    profiles = []; // IndexedDB 不可用：本会话内仍可保存/切换（内存态）
  }
}

/** useSyncExternalStore 订阅入口：首次订阅时触发加载；快照引用稳定不触发重渲染 */
export function subscribeProfiles(fn: () => void): () => void {
  listeners.add(fn);
  if (profiles == null) {
    void enqueue(async () => {
      await ensureLoaded();
    }).then(notify);
  }
  return () => listeners.delete(fn);
}

/** 档案快照；null = 尚未加载完成 */
export function getProfilesSnapshot(): LlmProfile[] | null {
  return profiles;
}

function genId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 把当前活动配置存为新档案（名称已由调用方 trim；失败静默） */
export function saveProfile(
  name: string,
  cfg: { baseUrl: string; apiKey: string; modelId: string },
): void {
  void enqueue(async () => {
    await ensureLoaded();
    profiles = [...profiles!, { id: genId(), name, ...cfg }];
    try {
      await idbPutKV(KV_PROFILES, profiles);
    } catch {
      /* kv 不可用时保留内存态 */
    }
    notify();
  });
}

/** 删除档案（失败静默） */
export function deleteProfile(id: string): void {
  void enqueue(async () => {
    await ensureLoaded();
    profiles = profiles!.filter((p) => p.id !== id);
    try {
      await idbPutKV(KV_PROFILES, profiles);
    } catch {
      /* 同上 */
    }
    notify();
  });
}
