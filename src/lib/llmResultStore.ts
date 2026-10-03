/**
 * 大模型结果持久化（IndexedDB kv）
 * cachedLlmAdvice / cachedWeeklyReport 的会话内存缓存之外的第二层：
 * 成功结果按缓存键存入 kv（llm:results，最新在前，封顶 MAX_RESULTS 条），
 * 应用重启后同键直接命中、不重新付费调用。缓存键语义（配置 / 模型 / 语言 /
 * 靶标 / 基线 / 提示词 / 记录集合任一变化即换键）天然承担失效；
 * 失败与被取消的结果照旧不落任何缓存。
 */

import { idbGetKV, idbPutKV } from '@/lib/storage/idb';
import type { LlmAdviceResult } from './llm';

const KV_RESULTS = 'llm:results';
const MAX_RESULTS = 50;

interface StoredResult {
  key: string;
  at: number;
  result: LlmAdviceResult;
}

let cache: StoredResult[] | null = null;
// 串行队列：读改写不与并发保存交错
let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const next = queue.then(task);
  queue = next.catch(() => {});
  return next;
}

/** 存储结果的形状校验（防脏数据进入渲染层） */
function isValidResult(v: unknown): v is LlmAdviceResult {
  if (typeof v !== 'object' || v == null) return false;
  const r = v as Record<string, unknown>;
  return (r.summary === null || typeof r.summary === 'string')
    && Array.isArray(r.assessments)
    && Array.isArray(r.advice);
}

async function ensureLoaded(): Promise<void> {
  if (cache != null) return;
  try {
    const raw = await idbGetKV<StoredResult[]>(KV_RESULTS);
    cache = Array.isArray(raw)
      ? raw
        .filter((e): e is StoredResult =>
          !!e && typeof e === 'object'
          && typeof e.key === 'string' && typeof e.at === 'number'
          && isValidResult(e.result))
        .slice(0, MAX_RESULTS)
      : [];
  } catch {
    cache = []; // IndexedDB 不可用（含单测环境）：退化为纯会话缓存
  }
}

/** 按缓存键取已持久化的结果；无 / 损坏 / IDB 不可用返回 null */
export async function loadLlmResult(key: string): Promise<LlmAdviceResult | null> {
  await enqueue(async () => {});
  await ensureLoaded();
  return cache!.find((e) => e.key === key)?.result ?? null;
}

/** 保存成功结果（fire-and-forget；同键覆盖后置顶，失败静默不影响调用方） */
export function saveLlmResult(key: string, result: LlmAdviceResult): void {
  void enqueue(async () => {
    await ensureLoaded();
    cache = [{ key, at: Date.now(), result }, ...cache!.filter((e) => e.key !== key)]
      .slice(0, MAX_RESULTS);
    await idbPutKV(KV_RESULTS, cache);
  });
}
