/**
 * 大模型训练建议（实验性）
 * 调用用户在 设置 → 实验性功能 → 大模型配置 中自填的 OpenAI 兼容接口
 * （POST {baseUrl}/chat/completions），仅上传录音统计指标生成建议，
 * 不上传任何音频数据；API Key 仅保存在本地 localStorage。
 */

import type { AnalysisRecord } from '@/types';
import type { AdviceTarget } from '@/lib/advice';
import { computeSustainedMetrics } from '@/lib/audio/sustained';
import { LOCALES, getLocale } from '@/i18n';

/** 大模型接口配置（由设置解析而来） */
export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

/** 从设置解析配置；三项任一为空返回 null（调用方提示先补全） */
export function resolveLlmConfig(s: {
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModelId?: string;
}): LlmConfig | null {
  const baseUrl = s.llmBaseUrl?.trim().replace(/\/+$/, '') ?? '';
  const apiKey = s.llmApiKey?.trim() ?? '';
  const modelId = s.llmModelId?.trim() ?? '';
  if (!baseUrl || !apiKey || !modelId) return null;
  return { baseUrl, apiKey, modelId };
}

/** OpenAI 兼容端点：baseUrl 允许填到 /v1，也可直接填到 /chat/completions */
function chatEndpoint(baseUrl: string): string {
  if (/\/chat\/completions$/.test(baseUrl)) return baseUrl;
  return `${baseUrl}/chat/completions`;
}

/** 要求模型以当前界面语言回答 */
function languageName(): string {
  return LOCALES.find((l) => l.id === getLocale())?.label ?? '简体中文';
}

/** 一条记录的统计摘要（键值行，控制体积） */
function recordStats(rec: AnalysisRecord, target: AdviceTarget): string {
  const s = rec.stats;
  const voicedPct = s.totalSamples > 0
    ? Math.round((s.voicedSamples / s.totalSamples) * 100)
    : null;
  const lines: (string | null)[] = [
    `date: ${new Date(rec.createdAt).toISOString().slice(0, 16).replace('T', ' ')}`,
    `mode: ${rec.mode ?? 'unknown'}`,
    `durationSec: ${s.durationSec.toFixed(1)}`,
    `avgF0: ${s.avgF0.toFixed(1)} Hz`,
    `medianF0: ${s.medianF0.toFixed(1)} Hz`,
    `minF0: ${s.minF0.toFixed(0)} Hz`,
    `maxF0: ${s.maxF0.toFixed(0)} Hz`,
    `p10F0: ${s.p10F0.toFixed(0)} Hz`,
    `p90F0: ${s.p90F0.toFixed(0)} Hz`,
    `stdF0: ${s.stdF0.toFixed(1)} Hz`,
    `avgDb: ${s.avgDb.toFixed(1)} dB`,
    `peakDb: ${s.peakDb.toFixed(1)} dB`,
    s.avgF1 != null ? `avgF1: ${s.avgF1.toFixed(0)} Hz` : null,
    s.avgF2 != null ? `avgF2: ${s.avgF2.toFixed(0)} Hz` : null,
    s.jitterPct != null ? `jitterPct: ${s.jitterPct.toFixed(2)}%` : null,
    s.shimmerPct != null ? `shimmerPct: ${s.shimmerPct.toFixed(2)}%` : null,
    s.hnrDb != null ? `hnrDb: ${s.hnrDb.toFixed(1)} dB` : null,
    s.cppsDb != null ? `cppsDb: ${s.cppsDb.toFixed(1)} dB` : null,
    voicedPct != null ? `voicedPct: ${voicedPct}%` : null,
    s.inTargetPct != null ? `inTargetPct: ${s.inTargetPct.toFixed(0)}%` : null,
    rec.mode === 'sustained'
      ? `mptSec: ${computeSustainedMetrics(rec).mptSec.toFixed(1)}`
      : null,
    target.enabled ? `targetF0Range: ${target.min}-${target.max} Hz` : null,
  ];
  return lines.filter((l): l is string => l != null).join('\n');
}

/** 组装用户消息：单条记录 = 单份统计；两条记录 = A/B 对比 */
function buildUserPrompt(records: AnalysisRecord[], target: AdviceTarget): string {
  const parts: string[] = [];
  if (records.length >= 2) {
    parts.push(
      'Two recordings from the same user are compared below (A and B). '
      + 'Comment on the change between them, then give advice for continued training:',
    );
    records.forEach((rec, i) => {
      parts.push(`--- Recording ${i === 0 ? 'A' : 'B'} ---`);
      parts.push(recordStats(rec, target));
    });
  } else {
    parts.push('One voice recording from the user:');
    parts.push(recordStats(records[0], target));
  }
  parts.push(`Answer language: ${languageName()}`);
  return parts.join('\n');
}

/**
 * 调用接口生成建议（1–4 条纯文本）
 * 失败抛出含可读原因的 Error，由调用方展示
 */
export async function fetchLlmAdvice(
  records: AnalysisRecord[],
  target: AdviceTarget,
  cfg: LlmConfig,
): Promise<string[]> {
  const res = await fetch(chatEndpoint(cfg.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.modelId,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You are a voice training advisor. Based only on the statistics the user provides, '
            + 'give 1-3 short actionable training suggestions, one sentence each. '
            + 'Do not invent measurements that are not provided. '
            + 'If everything looks within common reference ranges, encourage the user. '
            + 'Respond ONLY with JSON of the shape {"advice": ["...", "..."]}.',
        },
        { role: 'user', content: buildUserPrompt(records, target) },
      ],
    }),
  });
  if (!res.ok) throw new Error(await describeHttpError(res));
  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Empty response');
  const advice = parseAdvice(content);
  if (advice.length === 0) throw new Error('No advice in response');
  return advice;
}

/** 最小连通性测试：返回模型回复摘要（供 toast 展示），失败抛错 */
export async function testLlmConnection(cfg: LlmConfig): Promise<string> {
  const res = await fetch(chatEndpoint(cfg.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.modelId,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    }),
  });
  if (!res.ok) throw new Error(await describeHttpError(res));
  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data.choices?.[0]?.message?.content;
  // 回复异常（空 / JSON 体 / 超长）时直接展示模型 ID，避免 toast 出现一大段文字
  if (typeof content !== 'string') return cfg.modelId;
  const trimmed = content.trim();
  return trimmed && !trimmed.startsWith('{') && trimmed.length <= 40
    ? trimmed
    : cfg.modelId;
}

/** HTTP 错误摘要：状态码 + 接口返回的 error.message（截断） */
async function describeHttpError(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  let msg = `HTTP ${res.status}`;
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string };
    const em = typeof j.error === 'string' ? j.error : j.error?.message;
    if (em) msg += `: ${em.slice(0, 160)}`;
  } catch {
    if (body) msg += `: ${body.slice(0, 160)}`;
  }
  return msg;
}

/**
 * 解析模型回复：优先取 JSON 里的 advice 数组，
 * 解析失败时按非空行兜底（去掉行首序号/项目符号）
 */
function parseAdvice(content: string): string[] {
  const m = content.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]) as { advice?: unknown };
      if (Array.isArray(obj.advice)) {
        const arr = obj.advice
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x) => x.trim());
        if (arr.length > 0) return arr.slice(0, 4);
      }
    } catch {
      /* 落到行拆分兜底 */
    }
  }
  const lines = content
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length > 0 && l.length <= 200);
  return lines.slice(0, 4);
}

/* ------------------------------ 会话内缓存 ------------------------------ */

const adviceCache = new Map<string, Promise<string[]>>();

/**
 * 同一配置 + 同一记录在会话内只请求一次；
 * 失败不缓存（下次取同 key 会重新请求，实现重试）
 */
export function cachedLlmAdvice(key: string, run: () => Promise<string[]>): Promise<string[]> {
  const hit = adviceCache.get(key);
  if (hit) return hit;
  const p = run().catch((err: unknown) => {
    adviceCache.delete(key);
    throw err;
  });
  adviceCache.set(key, p);
  return p;
}

/** 缓存键：接口配置 / 模型 / 语言 / 靶标 / 记录（id+备注）任一变化即失效 */
export function llmAdviceKey(
  cfg: LlmConfig,
  records: AnalysisRecord[],
  target: AdviceTarget,
): string {
  return JSON.stringify([
    cfg.baseUrl,
    cfg.apiKey,
    cfg.modelId,
    getLocale(),
    target.enabled,
    target.min,
    target.max,
    records.map((r) => `${r.id}:${r.note ?? ''}`),
  ]);
}
