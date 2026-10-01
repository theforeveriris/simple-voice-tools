/**
 * 大模型训练建议（实验性）
 * 调用用户在 设置 → 实验性功能 → 大模型配置 中自填的 OpenAI 兼容接口
 * （POST {baseUrl}/chat/completions），仅上传录音统计指标生成建议，
 * 不上传任何音频数据；API Key 仅保存在本地 localStorage。
 *
 * 分析标准与数据口径对齐 documentation/PARAMETERS-GUIDE.md：
 * 有效性门槛 → 音高 / 语调与稳定 / 共鸣 / 嗓音质量 / 长音 / 基线趋势
 * 逐维度评估，再给可执行建议。
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

/** 单维度评估结论 */
export interface AdviceAssessment {
  aspect: string;
  status: 'good' | 'fair' | 'attention';
  comment: string;
}

/** 大模型建议的结构化结果（模型输出异常时可能只有 advice 兜底行） */
export interface LlmAdviceResult {
  summary: string | null;
  assessments: AdviceAssessment[];
  advice: string[];
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

/* ------------------------------ 分析标准（提示词） ------------------------------ */

const SYSTEM_PROMPT = [
  'You are the training advisor inside "Simple Voice Tool", a voice-tracking app.',
  'It measures pitch (YIN), formants (LPC), loudness (dBFS, uncalibrated), voice quality',
  '(Jitter / Shimmer / HNR estimate / CPPS) and sustained phonation (MPT / pitch CV / decay).',
  'The user message contains the statistics of one recording — or two recordings (A, B) to',
  'compare — plus, when the user pinned a baseline, its deltas. Analyze strictly by the',
  'standard below, then give advice.',
  '',
  '## Analysis standard (apply in this order)',
  '1. Data validity gate. If framesTotal < 30, or voicedPct < 35%, or avgDb < -35 dB or',
  '   > -10 dB, or peakDb > -3 dB (clipping), point it out and treat other numbers with',
  '   caution. Expected voicedPct: reading > 60%, sustained > 95%.',
  '2. Pitch. avgF0 vs medianF0: median below avg means a few high frames lift the mean while',
  '   typical pitch sits lower — prioritize the median. P10-P90 is the working range: its',
  '   position matters more than avgF0; bandwidth < 30 Hz sounds monotone, natural reading is',
  '   >= 50 Hz. Band percentages show where voicing time is spent (boundaries are',
  '   user-configurable). If a target range is given, judge inTargetPct: < 20% the target is',
  '   too ambitious (suggest lowering it), > 90% suggest raising it.',
  '3. Intonation vs stability. Reading: stdF0 around 15-35 Hz is natural intonation; < 10 Hz',
  '   is pressed flat, > 45 Hz is uncontrolled. Sustained: cvPct should be near 0% and',
  '   decayDbPerSec near 0; interpret MPT together with decay (long MPT + large decay =',
  '   endurance problem, not capacity).',
  '4. Resonance (formants). F1 tracks jaw opening (vowel "a": male 700-800 Hz, female',
  '   850-1100 Hz); F2 tracks tongue frontness (vowel "i": male 1900-2300 Hz, female',
  '   2600-2900 Hz). f1Range span 200-500 Hz and f2Range span 500-1500 Hz are normal for',
  '   reading; clearly narrower = monotonous articulation.',
  '5. Voice quality is a health monitor, not a training goal; single-session spikes are',
  '   meaningless — judge by baseline trend. Jitter < 1% (capped 5%); Shimmer < 4-5%',
  '   (capped 15%); HNR > 20 dB (estimate); CPPS roughly 10-20 dB with no absolute threshold.',
  '   Combos: only Jitter up = strained pitch (ease the target 5-10 Hz); Shimmer up + HNR',
  '   down = leaky/breathy closure (breath support); all four worse = overuse (rest, and if',
  '   Jitter stays > 2-3% after rest suggest an ENT check).',
  '6. Sustained phonation. MPT 15-25 s is healthy; < 12 s short; < 10 s practice breath',
  '   support before anything else.',
  '7. Baseline deltas (when given) are current minus baseline: comment on the direction of',
  '   change, never compare across different test modes.',
  '8. Comparing A/B: describe what changed and what it likely means, then advise what to',
  '   keep and what to adjust next.',
  '',
  '## Principles',
  '- Use only the numbers given; never invent measurements. null means not measured — skip',
  '  it silently. Loudness is uncalibrated dBFS, so only self-comparison is meaningful.',
  '- Advice: 2-4 items, concrete and actionable, each one sentence, tied to the numbers.',
  '  If everything is within range, say so and encourage.',
  '- These are self-tracking reference ranges, not medical advice; do not diagnose.',
  '',
  '## Output',
  `Respond ONLY with JSON, written in ${languageName()}:`,
  '{"summary": "1-2 sentence overall assessment",',
  ' "assessments": [{"aspect": "dimension name", "status": "good|fair|attention",',
  '                 "comment": "one sentence citing the numbers"}],',
  ' "advice": ["...", "..."]}',
  'Give 4-6 assessments covering the dimensions that matter for this recording; skip',
  'dimensions whose data is missing.',
].join('\n');

/* ------------------------------ 数据载荷 ------------------------------ */

/** 单条记录的全部统计指标（键值行；口径与文档一致，含派生量） */
function recordPayload(rec: AnalysisRecord, target: AdviceTarget): string {
  const s = rec.stats;
  const voicedPct = s.totalSamples > 0 ? (s.voicedSamples / s.totalSamples) * 100 : 0;
  const cvPct = s.medianF0 > 0 ? (s.stdF0 / s.medianF0) * 100 : null;
  const lines: (string | null)[] = [
    `date: ${new Date(rec.createdAt).toISOString().slice(0, 16).replace('T', ' ')}`,
    `mode: ${rec.mode ?? 'unknown'}`,
    rec.note ? `note: ${rec.note}` : null,
    `durationSec: ${s.durationSec.toFixed(1)}`,
    `sampleHz: ${s.sampleHz.toFixed(0)}`,
    `framesTotal: ${s.totalSamples}`,
    `framesVoiced: ${s.voicedSamples} (${voicedPct.toFixed(0)}%)`,
    `avgF0: ${s.avgF0.toFixed(1)} Hz`,
    `medianF0: ${s.medianF0.toFixed(1)} Hz`,
    `minF0: ${s.minF0.toFixed(0)} Hz`,
    `maxF0: ${s.maxF0.toFixed(0)} Hz`,
    `p10F0: ${s.p10F0.toFixed(0)} Hz`,
    `p90F0: ${s.p90F0.toFixed(0)} Hz`,
    `p10P90bandwidth: ${(s.p90F0 - s.p10F0).toFixed(0)} Hz`,
    `stdF0: ${s.stdF0.toFixed(1)} Hz${cvPct != null ? ` (cv ${cvPct.toFixed(1)}%)` : ''}`,
    `bandPct male/female/transition: ${s.malePct.toFixed(0)}/${s.femalePct.toFixed(0)}/${s.transitionPct.toFixed(0)}%`,
    s.avgF1 != null ? `avgF1: ${s.avgF1.toFixed(0)} Hz` : null,
    s.avgF2 != null ? `avgF2: ${s.avgF2.toFixed(0)} Hz` : null,
    s.avgF1 != null && s.avgF2 != null && s.avgF2 > 0
      ? `f1F2ratio: ${(s.avgF1 / s.avgF2).toFixed(2)}`
      : null,
    s.f1Range ? `f1Range: ${s.f1Range[0].toFixed(0)}-${s.f1Range[1].toFixed(0)} Hz (span ${(s.f1Range[1] - s.f1Range[0]).toFixed(0)})` : null,
    s.f2Range ? `f2Range: ${s.f2Range[0].toFixed(0)}-${s.f2Range[1].toFixed(0)} Hz (span ${(s.f2Range[1] - s.f2Range[0]).toFixed(0)})` : null,
    `avgDb: ${s.avgDb.toFixed(1)} dB`,
    `peakDb: ${s.peakDb.toFixed(1)} dB`,
    s.jitterPct != null ? `jitterPct: ${s.jitterPct.toFixed(2)}%` : null,
    s.shimmerPct != null ? `shimmerPct: ${s.shimmerPct.toFixed(2)}%` : null,
    s.hnrDb != null ? `hnrDb: ${s.hnrDb.toFixed(1)} dB` : null,
    s.cppsDb != null ? `cppsDb: ${s.cppsDb.toFixed(1)} dB` : null,
    target.enabled ? `targetF0Range: ${target.min}-${target.max} Hz` : null,
    s.inTargetPct != null ? `inTargetPct: ${s.inTargetPct.toFixed(0)}%` : null,
  ];
  if (rec.mode === 'sustained') {
    const { mptSec, cvPct: sCv, decayDbPerSec } = computeSustainedMetrics(rec);
    lines.push(`mptSec: ${mptSec.toFixed(1)}`);
    if (sCv != null) lines.push(`sustainedCvPct: ${sCv.toFixed(1)}%`);
    if (decayDbPerSec != null) lines.push(`decayDbPerSec: ${decayDbPerSec.toFixed(2)}`);
  }
  return lines.filter((l): l is string => l != null).join('\n');
}

/** 基线 Δ（当前 − 基线；仅在用户钉选基线且与当前记录不同时提供） */
function baselinePayload(rec: AnalysisRecord, baseline: AnalysisRecord): string {
  const s = rec.stats;
  const b = baseline.stats;
  const d = (a: number | null | undefined, c: number | null | undefined, dg = 1) =>
    a != null && c != null ? `${a - c > 0 ? '+' : ''}${(a - c).toFixed(dg)}` : null;
  const lines: (string | null)[] = [
    `baselineDate: ${new Date(baseline.createdAt).toISOString().slice(0, 16).replace('T', ' ')}`,
    `baselineMode: ${baseline.mode ?? 'unknown'}`,
    `baselineAvgF0: ${b.avgF0.toFixed(1)} Hz`,
    baseline.note ? `baselineNote: ${baseline.note}` : null,
    `deltaAvgF0: ${d(s.avgF0, b.avgF0)} Hz`,
    `deltaMedianF0: ${d(s.medianF0, b.medianF0)} Hz`,
    `deltaP10F0: ${d(s.p10F0, b.p10F0, 0)} Hz`,
    `deltaP90F0: ${d(s.p90F0, b.p90F0, 0)} Hz`,
    `deltaStdF0: ${d(s.stdF0, b.stdF0)} Hz`,
    s.avgF1 != null && b.avgF1 != null ? `deltaAvgF1: ${d(s.avgF1, b.avgF1, 0)} Hz` : null,
    s.avgF2 != null && b.avgF2 != null ? `deltaAvgF2: ${d(s.avgF2, b.avgF2, 0)} Hz` : null,
    `deltaAvgDb: ${d(s.avgDb, b.avgDb)} dB`,
    s.jitterPct != null && b.jitterPct != null ? `deltaJitterPct: ${d(s.jitterPct, b.jitterPct, 2)}%` : null,
    s.shimmerPct != null && b.shimmerPct != null ? `deltaShimmerPct: ${d(s.shimmerPct, b.shimmerPct, 2)}%` : null,
    s.hnrDb != null && b.hnrDb != null ? `deltaHnrDb: ${d(s.hnrDb, b.hnrDb)} dB` : null,
    s.cppsDb != null && b.cppsDb != null ? `deltaCppsDb: ${d(s.cppsDb, b.cppsDb)} dB` : null,
  ];
  return lines.filter((l): l is string => l != null).join('\n');
}

/** 组装用户消息：单条记录 / 两条记录（A/B 对比）/ 可选基线 Δ */
function buildUserPrompt(
  records: AnalysisRecord[],
  target: AdviceTarget,
  baseline: AnalysisRecord | null,
): string {
  const parts: string[] = [];
  if (records.length >= 2) {
    parts.push(
      'Two recordings from the same user are compared below (A and B; dates show which is '
      + 'earlier). Analyze the change between them, then advise:',
    );
    records.forEach((rec, i) => {
      parts.push(`--- Recording ${i === 0 ? 'A' : 'B'} ---`);
      parts.push(recordPayload(rec, target));
    });
  } else {
    parts.push('One voice recording from the user:');
    parts.push(recordPayload(records[0], target));
    if (baseline && baseline.id !== records[0].id) {
      parts.push('Pinned baseline (earlier recording; deltas = current − baseline; ignore if its mode differs):');
      parts.push(baselinePayload(records[0], baseline));
    }
  }
  parts.push(`Answer language: ${languageName()}`);
  return parts.join('\n');
}

/* ------------------------------ 请求与解析 ------------------------------ */

/**
 * 调用接口生成结构化建议；失败抛出含可读原因的 Error，由调用方展示
 */
export async function fetchLlmAdvice(
  records: AnalysisRecord[],
  target: AdviceTarget,
  cfg: LlmConfig,
  baseline: AnalysisRecord | null = null,
): Promise<LlmAdviceResult> {
  const res = await fetch(chatEndpoint(cfg.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.modelId,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(records, target, baseline) },
      ],
    }),
  });
  if (!res.ok) throw new Error(await describeHttpError(res));
  const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Empty response');
  return parseLlmAdviceResult(content);
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

const STATUS_VALUES = new Set(['good', 'fair', 'attention']);

/**
 * 解析模型回复：
 * 1) 取首个 {...} 作结构化结果（summary + assessments + advice，字段逐个校验，
 *    status 非法值归为 fair）；
 * 2) 仅含 advice 数组的旧格式同样接受；
 * 3) JSON 解析失败时按非空行兜底（去掉行首序号/项目符号）；
 * 4) 什么都取不到则抛错。
 */
export function parseLlmAdviceResult(content: string): LlmAdviceResult {
  const m = content.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]) as Record<string, unknown>;
      const result = structuredResult(obj);
      if (result) return result;
    } catch {
      /* 落到行拆分兜底 */
    }
  }
  const lines = fallbackLines(content);
  if (lines.length > 0) return { summary: null, assessments: [], advice: lines };
  throw new Error('No advice in response');
}

/** 从已解析的 JSON 对象提取结构化结果；完全无有效字段时返回 null */
function structuredResult(obj: Record<string, unknown>): LlmAdviceResult | null {
  const advice = strArr(obj.advice).slice(0, 4);
  const summary = typeof obj.summary === 'string' && obj.summary.trim() ? obj.summary.trim() : null;
  const assessments: AdviceAssessment[] = [];
  if (Array.isArray(obj.assessments)) {
    for (const raw of obj.assessments) {
      if (typeof raw !== 'object' || raw == null) continue;
      const o = raw as Record<string, unknown>;
      const aspect = typeof o.aspect === 'string' ? o.aspect.trim() : '';
      const comment = typeof o.comment === 'string' ? o.comment.trim() : '';
      if (!aspect || !comment) continue;
      const status = typeof o.status === 'string' && STATUS_VALUES.has(o.status)
        ? (o.status as AdviceAssessment['status'])
        : 'fair';
      assessments.push({ aspect, status, comment });
    }
  }
  if (!summary && assessments.length === 0 && advice.length === 0) return null;
  return { summary, assessments: assessments.slice(0, 6), advice };
}

/** 兜底：按非空行拆分为建议列表（跳过疑似 JSON 的行） */
function fallbackLines(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length > 0 && l.length <= 200 && !l.startsWith('{'))
    .slice(0, 4);
}

function strArr(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
    : [];
}

/* ------------------------------ 会话内缓存 ------------------------------ */

const adviceCache = new Map<string, Promise<LlmAdviceResult>>();

/**
 * 同一配置 + 同一记录在会话内只请求一次；
 * 失败不缓存（下次取同 key 会重新请求，实现重试）
 */
export function cachedLlmAdvice(key: string, run: () => Promise<LlmAdviceResult>): Promise<LlmAdviceResult> {
  const hit = adviceCache.get(key);
  if (hit) return hit;
  const p = run().catch((err: unknown) => {
    adviceCache.delete(key);
    throw err;
  });
  adviceCache.set(key, p);
  return p;
}

/** 缓存键：接口配置 / 模型 / 语言 / 靶标 / 基线 / 记录（id+备注）任一变化即失效 */
export function llmAdviceKey(
  cfg: LlmConfig,
  records: AnalysisRecord[],
  target: AdviceTarget,
  baseline: AnalysisRecord | null = null,
): string {
  return JSON.stringify([
    cfg.baseUrl,
    cfg.apiKey,
    cfg.modelId,
    getLocale(),
    target.enabled,
    target.min,
    target.max,
    baseline?.id ?? null,
    records.map((r) => `${r.id}:${r.note ?? ''}`),
  ]);
}
