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

/** 会话内存缓存；kv 读取失败时仍作为降级缓存（本会话命中语义不变） */
let cache: StoredResult[] = [];
/** kv 是否已成功读取（含确认无数据）；未成功前不落盘，避免覆盖旧结果 */
let kvReadOk = false;
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
  if (kvReadOk) return;
  try {
    const raw = await idbGetKV<StoredResult[]>(KV_RESULTS);
    // 读取成功：kv 数据与失败期间累积的会话缓存按 key 合并（新写入优先），
    // 再按 at 置顶排序截断
    const byKey = new Map<string, StoredResult>();
    if (Array.isArray(raw)) {
      for (const e of raw) {
        if (!!e && typeof e === 'object'
          && typeof e.key === 'string' && typeof e.at === 'number'
          && isValidResult(e.result)) byKey.set(e.key, e);
      }
    }
    for (const e of cache) byKey.set(e.key, e);
    cache = [...byKey.values()]
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_RESULTS);
    kvReadOk = true;
  } catch {
    // IndexedDB 瞬态不可用：不把「失败」当「无数据」缓存，下次读取重试；
    // 本会话仍可命中失败期间写入的会话缓存
  }
}

/** 按缓存键取已持久化的结果；无 / 损坏 / IDB 不可用返回 null */
export async function loadLlmResult(key: string): Promise<LlmAdviceResult | null> {
  await enqueue(async () => {
    await ensureLoaded();
  });
  return cache.find((e) => e.key === key)?.result ?? null;
}

/** 保存成功结果（fire-and-forget；同键覆盖后置顶，失败静默不影响调用方） */
export function saveLlmResult(key: string, result: LlmAdviceResult): void {
  void enqueue(async () => {
    await ensureLoaded();
    cache = [{ key, at: Date.now(), result }, ...cache.filter((e) => e.key !== key)]
      .slice(0, MAX_RESULTS);
    // 读取未成功（瞬态失败）前不落盘：整键写回会覆盖 kv 里的旧结果；
    // 会话缓存已更新，下次保存时重试读取 + 落盘
    if (!kvReadOk) return;
    await idbPutKV(KV_RESULTS, cache);
  });
}
