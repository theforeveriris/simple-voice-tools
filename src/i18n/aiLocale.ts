/**
 * AI 翻译语言表（语言子页面 · 依赖 实验性功能 的大模型配置）
 * 把 zh-CN 基准词典分批交给大模型翻译成目标语言，生成的新语言词典
 * 缓存在 localStorage（svt:i18n-ai:<slug>），经 registerAiDict 注入 i18n
 * 即可作为界面语言使用；未翻译到的词条自动回退简体中文。
 */

import { zhCN } from './zh-CN';
import { registerAiDict } from './index';
import { llmChat, type LlmConfig } from '@/lib/llm';

const LS_PREFIX = 'svt:i18n-ai:';
/** 每批翻译的词条数：全量约 660 键 → 8 批左右，兼顾单次请求体积与调用次数 */
const BATCH = 90;

/** AI 语言词典缓存（localStorage 持久化结构） */
export interface AiLocaleCache {
  /** 目标语言显示名（用户输入，如 Deutsch） */
  label: string;
  /** 翻译词典（key → 译文；缺键回退 zh-CN） */
  dict: Record<string, string>;
  /** 生成时使用的模型 id（重新生成时可参考） */
  model: string;
  /** 生成时间（epoch ms） */
  at: number;
}

/** 语言显示名 → 缓存键 slug（小写字母数字） */
export function aiSlug(label: string): string {
  return (
    label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
    || 'custom'
  );
}

/** 读取某语言的 AI 词典缓存；无或损坏返回 null */
export function loadAiCache(label: string): AiLocaleCache | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + aiSlug(label));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiLocaleCache;
    if (typeof parsed.label !== 'string' || typeof parsed.dict !== 'object' || parsed.dict == null) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 清除某语言的 AI 词典缓存 */
export function clearAiCache(label: string): void {
  try {
    localStorage.removeItem(LS_PREFIX + aiSlug(label));
  } catch {
    /* 忽略存储异常 */
  }
}

/**
 * 启动恢复：把已生成语言的缓存词典注册进 i18n（main.tsx 在语言为 ai 时调用）。
 * 缓存缺失返回 false（调用方应回退默认语言）
 */
export function hydrateAiLocale(label: string): boolean {
  const cache = loadAiCache(label);
  if (!cache) return false;
  registerAiDict(cache.label, cache.dict, aiSlug(label));
  return true;
}

/** 翻译提示词：术语与占位符保护 + 纯 JSON 输出 */
function systemPrompt(lang: string): string {
  return [
    'You are the UI translator for "Simple Voice Tool", a self-tracking voice-training app',
    '(transgender voice training and voice health).',
    `Translate the Simplified Chinese UI strings in the user message into ${lang}.`,
    'Rules:',
    '- Keep {placeholder} tokens (e.g. {n}, {msg}, {pct}) exactly as-is, position adapted to the target grammar.',
    '- Keep technical terms and units unchanged: F0, F1, F2, MPT, CPPS, HNR, Jitter, Shimmer, YIN, pYIN,',
    '  MPM, LPC, Hz, dB, P10, P90, PWA, CSV, JSON, HTML, PNG, ZIP, AI, API, GitHub, WebDAV, NAS.',
    '- Keep each translation short and natural for app UI text.',
    'Respond ONLY with a single JSON object mapping the SAME ids to the translations;',
    'no markdown fences, no commentary.',
  ].join('\n');
}

/** 解析单批回复：取首个 JSON 对象，仅接受已知键与非空字符串值 */
function parseBatch(content: string, allowed: Set<string>): Record<string, string> {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in response');
  const obj = JSON.parse(m[0]) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (allowed.has(k) && typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

/**
 * 分批调用大模型翻译整个基准词典，写入缓存并注册生效。
 * 某批失败即抛错（已完成批次保留在返回的缓存中，未覆盖词条回退中文）。
 */
export async function generateAiLocale(
  label: string,
  cfg: LlmConfig,
  onProgress?: (frac: number) => void,
): Promise<AiLocaleCache> {
  const entries = Object.entries(zhCN as unknown as Record<string, string>);
  const dict: Record<string, string> = {};
  const total = Math.max(1, Math.ceil(entries.length / BATCH));
  const system = systemPrompt(label.trim());
  for (let i = 0; i < total; i++) {
    const batch = entries.slice(i * BATCH, (i + 1) * BATCH);
    const parsed = parseBatch(
      await llmChat(cfg, system, JSON.stringify(Object.fromEntries(batch), null, 1)),
      new Set(batch.map(([k]) => k)),
    );
    Object.assign(dict, parsed);
    onProgress?.((i + 1) / total);
  }
  const cache: AiLocaleCache = { label: label.trim(), dict, model: cfg.modelId, at: Date.now() };
  try {
    localStorage.setItem(LS_PREFIX + aiSlug(label), JSON.stringify(cache));
  } catch {
    /* 配额不足等：词典仍可在本次会话使用 */
  }
  registerAiDict(cache.label, dict, aiSlug(label));
  return cache;
}
