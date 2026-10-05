/**
 * 训练建议卡（实验性）
 * adviceMode = rules：本地规则引擎生成（lib/advice.ts）；
 * adviceMode = llm：调用 设置 → 大模型 中使用中档案的接口（lib/llm.ts）。
 * 传入两条记录时（对比页）按 A / B 分组给规则建议，
 * 大模型则合并两份统计生成对比性建议。
 */

import { useEffect, useRef, useState } from 'react';
import { Lightbulb, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { buildAdvice, type AdviceTarget } from '@/lib/advice';
import {
  cachedLlmAdvice, fetchLlmAdvice, isAbortError, llmAdviceKey,
  type LlmAdviceResult, type LlmConfig,
} from '@/lib/llm';
import { useActiveLlmConfig } from '@/lib/llmProfiles';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';
import { LlmResultView, StreamPreview } from '@/components/analysis/LlmResultView';

/** 建议卡通用骨架：标题行 + 内容 + 底部提示 */
export function AdviceCard({ records }: { records: AnalysisRecord[] }) {
  const adviceMode = useStore((s) => s.settings.adviceMode);
  const targetEnabled = useStore((s) => s.settings.targetEnabled);
  const targetMin = useStore((s) => s.settings.targetF0Min);
  const targetMax = useStore((s) => s.settings.targetF0Max);
  const activeProfileId = useStore((s) => s.settings.llmActiveProfileId);
  const cfg = useActiveLlmConfig(activeProfileId);
  const extraRules = useStore((s) => s.settings.llmExtraRules);
  const promptOverride = useStore((s) => s.settings.llmPromptOverride);
  const baselineId = useStore((s) => s.settings.baselineRecordId);
  const baselineRecord = useHistoryStore((s) =>
    baselineId ? s.records.find((r) => r.id === baselineId) ?? null : null,
  );
  if (adviceMode === 'none') return null;
  const target: AdviceTarget = { enabled: targetEnabled, min: targetMin, max: targetMax };
  // 基线 Δ 只在单记录（分析页）且非自身时附带
  const baseline =
    records.length === 1 && baselineRecord && baselineRecord.id !== records[0].id
      ? baselineRecord
      : null;
  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Lightbulb size={13} className="text-accent" />
          {t('analysis.adviceTitle')}
        </span>
        <span className="text-[10px] text-ink-2">{t('settings.labs')}</span>
      </div>
      {adviceMode === 'llm'
        ? (
          <LlmAdvice
            records={records}
            target={target}
            cfg={cfg}
            baseline={baseline}
            prompt={{ extraRules, promptOverride }}
          />
        )
        : <RuleAdvice records={records} target={target} />}
      <p className="mt-2 px-0.5 text-[10px] leading-relaxed text-ink-2">
        {t(adviceMode === 'llm' ? 'analysis.adviceHintLlm' : 'analysis.adviceHint')}
      </p>
    </div>
  );
}

/** 规则判断：本地逐条生成；两条记录时按 A / B 分组 */
function RuleAdvice({ records, target }: { records: AnalysisRecord[]; target: AdviceTarget }) {
  const paired = records.length > 1;
  return (
    <div className={paired ? 'flex flex-col gap-2.5' : undefined}>
      {records.map((rec, i) => (
        <div key={rec.id}>
          {paired && (
            <div className="mb-1 flex items-center gap-1.5">
              <span
                className={`grid size-5 place-items-center rounded-full text-[10px] font-bold text-white ${i === 0 ? 'bg-accent' : 'bg-accent2'}`}
              >
                {i === 0 ? 'A' : 'B'}
              </span>
              <span className="text-[10px] text-ink-2">{fmtDate(rec.createdAt)}</span>
            </div>
          )}
          <ul className="flex flex-col gap-1.5">
            {buildAdvice(rec, target).map((tip) => (
              <li key={tip.key} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>{t(tip.key, tip.params)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** 评估状态 → 圆点颜色 + 文案词条 */
interface LlmState {
  /** 已收到结果的请求键（key#nonce），与当前请求键不一致即处于加载中 */
  doneKey: string | null;
  result: LlmAdviceResult | null;
  error: string | null;
  /** 本轮请求被用户取消（区别于失败） */
  cancelled: boolean;
}

/** 大模型判断：点击触发后异步生成（会话内缓存，失败可重试）。
 *  不在挂载时自动请求：调用是付费 API 且会上传统计到第三方，由用户显式发起。
 *  流式生成：加载中实时预览模型输出原文，可随时取消（卸载不中断，跑完照常进缓存） */
function LlmAdvice({
  records,
  target,
  cfg,
  baseline,
  prompt,
}: {
  records: AnalysisRecord[];
  target: AdviceTarget;
  cfg: LlmConfig | null;
  baseline: AnalysisRecord | null;
  prompt: { extraRules?: string[]; promptOverride?: string };
}) {
  const [nonce, setNonce] = useState(0);
  const [started, setStarted] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [state, setState] = useState<LlmState>({ doneKey: null, result: null, error: null, cancelled: false });
  // effect 按缓存键（值稳定）触发，输入经 ref 传递：键值不变则不重复请求
  const latest = useRef({ records, target, cfg, baseline, prompt });
  useEffect(() => {
    latest.current = { records, target, cfg, baseline, prompt };
  });
  const abortRef = useRef<AbortController | null>(null);
  const key = cfg ? llmAdviceKey(cfg, records, target, { baseline, prompt }) : null;
  const requestKey = key ? `${key}#${nonce}` : null;

  useEffect(() => {
    if (!started || !key || !requestKey) return;
    const { cfg: curCfg, records: curRecords, target: curTarget, baseline: curBaseline, prompt: curPrompt } = latest.current;
    if (!curCfg) return;
    const controller = new AbortController();
    abortRef.current = controller;
    let alive = true;
    setStreamText(null);
    cachedLlmAdvice(key, () => fetchLlmAdvice(curRecords, curTarget, curCfg, {
      baseline: curBaseline,
      prompt: curPrompt,
      signal: controller.signal,
      onDelta: (acc) => {
        if (alive) setStreamText(acc);
      },
    }))
      .then((result) => {
        if (alive) setState({ doneKey: requestKey, result, error: null, cancelled: false });
      })
      .catch((err: unknown) => {
        if (alive) {
          setState({
            doneKey: requestKey,
            result: null,
            error: isAbortError(err) ? null : err instanceof Error ? err.message : String(err),
            cancelled: isAbortError(err),
          });
        }
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
      });
    return () => {
      alive = false;
    };
  }, [key, requestKey, started]);

  if (!cfg) {
    return <p className="px-0.5 text-xs leading-relaxed text-ink-2">{t('analysis.adviceLlmNoConfig')}</p>;
  }
  if (!started) {
    return (
      <button
        onClick={() => setStarted(true)}
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70"
      >
        <Sparkles size={13} />
        {t('analysis.adviceLlmRun')}
      </button>
    );
  }
  const loading = state.doneKey !== requestKey;
  if (loading) {
    return (
      <div className="flex flex-col px-0.5">
        <div className="flex items-center gap-2 text-xs text-ink-2">
          <Loader2 size={13} className="animate-spin text-accent" />
          {t('analysis.adviceLlmLoading')}
          <button
            onClick={() => abortRef.current?.abort()}
            className="ml-auto text-[11px] font-medium text-ink-2 transition-opacity hover:opacity-70"
          >
            {t('common.cancel')}
          </button>
        </div>
        {streamText != null && <StreamPreview text={streamText} />}
      </div>
    );
  }
  if (state.error != null) {
    return (
      <div className="flex flex-col gap-1.5 px-0.5">
        <p className="text-xs leading-relaxed text-ink">
          <span className="font-medium">{t('analysis.adviceLlmError')}</span>
          <span className="ml-1 break-all text-ink-2">{state.error}</span>
        </p>
        <button
          onClick={() => setNonce((n) => n + 1)}
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          <RefreshCw size={12} />
          {t('analysis.adviceLlmRetry')}
        </button>
      </div>
    );
  }
  if (state.cancelled) {
    return (
      <div className="flex flex-col gap-1.5 px-0.5">
        <p className="text-xs leading-relaxed text-ink-2">{t('analysis.adviceLlmCancelled')}</p>
        <button
          onClick={() => setNonce((n) => n + 1)}
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          <RefreshCw size={12} />
          {t('analysis.adviceLlmRetry')}
        </button>
      </div>
    );
  }
  const result = state.result;
  if (!result) return null;
  return <LlmResultView result={result} />;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
