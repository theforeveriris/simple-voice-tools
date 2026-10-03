/**
 * LLM Token 用量统计（本机 IndexedDB kv）
 * 每次实际调用（缓存命中不计）由 lib/llm.ts 在请求完成时落账一条明细，
 * 聚合计数器与封顶明细日志分别存 kv 仓 `llm:usage:totals` / `llm:usage:log`。
 * 不进 AppSettings：避免混入 localStorage 持久化与设置导出链路。
 * 服务商未返回 usage 时以本地估算兜底（est 标记，仅供量级参考）。
 */

import { idbGetKV, idbPutKV } from '@/lib/storage/idb';

export type LlmFeature = 'advice' | 'weekly' | 'translate' | 'test';

export const LLM_FEATURES: readonly LlmFeature[] = ['advice', 'weekly', 'translate', 'test'];

/** 服务商返回的真实用量 */
export interface LlmUsageReal {
  promptTokens: number;
  completionTokens: number;
}

/** 单次调用明细（log 内最新在前） */
export interface LlmUsageEntry {
  at: number;
  feature: LlmFeature;
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** true = 服务商未返回 usage，由本地估算 */
  est: boolean;
}

/** 单一功能的聚合计数 */
export interface LlmUsageCount {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  /** 估算条目的调用数 */
  estCalls: number;
}

export interface LlmUsageTotals {
  byFeature: Record<LlmFeature, LlmUsageCount>;
  all: LlmUsageCount;
}

export interface LlmUsageSnapshot {
  totals: LlmUsageTotals;
  log: LlmUsageEntry[];
}

const KV_LOG = 'llm:usage:log';
const KV_TOTALS = 'llm:usage:totals';
const LOG_CAP = 200;

/* ------------------------------ 纯函数（可单测） ------------------------------ */

const CJK_RE = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;

/**
 * 粗略估算 token 数：CJK 字符 ≈ 1 token/字，其余 ≈ 4 字符 1 token。
 * 仅在服务商未返回 usage 时兜底，误差可为倍级，故落账时带 est 标记。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let total = 0;
  for (const ch of text) {
    total++;
    if (CJK_RE.test(ch)) cjk++;
  }
  return cjk + Math.ceil((total - cjk) / 4);
}

export function emptyCount(): LlmUsageCount {
  return { calls: 0, promptTokens: 0, completionTokens: 0, estCalls: 0 };
}

export function emptyTotals(): LlmUsageTotals {
  const byFeature = {} as Record<LlmFeature, LlmUsageCount>;
  for (const f of LLM_FEATURES) byFeature[f] = emptyCount();
  return { byFeature, all: emptyCount() };
}

/** 把一条明细累进聚合（byFeature 与 all 各一次）；聚合对象需已归一化 */
export function applyEntry(totals: LlmUsageTotals, entry: LlmUsageEntry): void {
  const targets = [totals.byFeature[entry.feature], totals.all];
  for (const c of targets) {
    if (!c) continue;
    c.calls++;
    c.promptTokens += entry.promptTokens;
    c.completionTokens += entry.completionTokens;
    if (entry.est) c.estCalls++;
  }
}

/** 补齐缺失功能键并夹紧非法数值（兼容手改 / 旧版本数据） */
export function normalizeTotals(raw: LlmUsageTotals | null | undefined): LlmUsageTotals {
  const out = emptyTotals();
  if (!raw || typeof raw !== 'object') return out;
  for (const f of LLM_FEATURES) {
    const c = raw.byFeature?.[f];
    if (!c || typeof c !== 'object') continue;
    out.byFeature[f] = {
      calls: Math.max(0, Number(c.calls) || 0),
      promptTokens: Math.max(0, Number(c.promptTokens) || 0),
      completionTokens: Math.max(0, Number(c.completionTokens) || 0),
      estCalls: Math.max(0, Number(c.estCalls) || 0),
    };
  }
  out.all = {
    calls: Math.max(0, Number(raw.all?.calls) || 0),
    promptTokens: Math.max(0, Number(raw.all?.promptTokens) || 0),
    completionTokens: Math.max(0, Number(raw.all?.completionTokens) || 0),
    estCalls: Math.max(0, Number(raw.all?.estCalls) || 0),
  };
  return out;
}

function isEntry(v: unknown): v is LlmUsageEntry {
  if (typeof v !== 'object' || v == null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.at === 'number' &&
    typeof e.feature === 'string' && (LLM_FEATURES as readonly string[]).includes(e.feature) &&
    typeof e.model === 'string' &&
    typeof e.promptTokens === 'number' &&
    typeof e.completionTokens === 'number' &&
    typeof e.est === 'boolean'
  );
}

/* ------------------------------ 持久化（内存缓存 + 串行写） ------------------------------ */

let totalsCache: LlmUsageTotals | null = null;
let logCache: LlmUsageEntry[] | null = null;
// 串行队列：避免读改写与并发写入交错（翻译任务一次连发多批）
let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const next = queue.then(task);
  queue = next.catch(() => {});
  return next;
}

async function ensureLoaded(): Promise<void> {
  if (totalsCache != null && logCache != null) return;
  try {
    const [t, l] = await Promise.all([
      idbGetKV<LlmUsageTotals>(KV_TOTALS),
      idbGetKV<LlmUsageEntry[]>(KV_LOG),
    ]);
    totalsCache = normalizeTotals(t);
    logCache = Array.isArray(l) ? l.filter(isEntry).slice(0, LOG_CAP) : [];
  } catch {
    // IndexedDB 不可用（含单测环境）：退化为会话内存统计
    totalsCache ??= emptyTotals();
    logCache ??= [];
  }
}

/** 落账一次调用（fire-and-forget；失败静默，绝不影响调用本身） */
export function recordLlmUsage(
  feature: LlmFeature,
  model: string,
  promptText: string,
  completionText: string,
  real: LlmUsageReal | null,
): void {
  const entry: LlmUsageEntry = {
    at: Date.now(),
    feature,
    model,
    promptTokens: real?.promptTokens ?? estimateTokens(promptText),
    completionTokens: real?.completionTokens ?? estimateTokens(completionText),
    est: real == null,
  };
  void enqueue(async () => {
    await ensureLoaded();
    applyEntry(totalsCache!, entry);
    logCache = [entry, ...logCache!].slice(0, LOG_CAP);
    await Promise.all([
      idbPutKV(KV_TOTALS, totalsCache),
      idbPutKV(KV_LOG, logCache),
    ]);
  });
}

/** 读取快照（等待挂起写入完成；无数据时返回全零） */
export async function readLlmUsage(): Promise<LlmUsageSnapshot> {
  await enqueue(async () => {});
  await ensureLoaded();
  return { totals: totalsCache!, log: logCache! };
}

/** 清空统计（面板的清空按钮；连日志一起删） */
export async function clearLlmUsage(): Promise<void> {
  await enqueue(async () => {
    totalsCache = emptyTotals();
    logCache = [];
    await Promise.all([
      idbPutKV(KV_TOTALS, totalsCache),
      idbPutKV(KV_LOG, logCache),
    ]);
  });
}
