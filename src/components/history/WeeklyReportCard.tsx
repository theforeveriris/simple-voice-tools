/**
 * AI 周报卡（历史页 · 趋势视图底部）
 * 聚合最近 7 天记录（按模式分组）发给大模型，生成一段周总结：
 * 练习一致性 → 音高 vs 目标 → 共鸣 → 嗓音健康 → 下周建议。
 * 依赖 设置 → 大模型 中使用中档案的接口；同一周内会话级缓存。
 */

import { useEffect, useRef, useState } from 'react';
import { CalendarRange, Loader2, RefreshCw } from 'lucide-react';
import { useStore } from '@/store/useStore';
import {
  cachedWeeklyReport, fetchWeeklyReport, isAbortError, weekRecords, weeklyReportKey,
  type LlmAdviceResult, type LlmPromptOptions,
} from '@/lib/llm';
import { useActiveLlmConfig } from '@/lib/llmProfiles';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AnalysisRecord } from '@/types';
import { LlmResultView, StreamPreview } from '@/components/analysis/LlmResultView';

interface ReportState {
  doneKey: string | null;
  result: LlmAdviceResult | null;
  error: string | null;
  /** 本轮请求被用户取消（区别于失败） */
  cancelled: boolean;
}

export function WeeklyReportCard({ records }: { records: AnalysisRecord[] }) {
  useI18n();
  const adviceMode = useStore((s) => s.settings.adviceMode);
  const activeProfileId = useStore((s) => s.settings.llmActiveProfileId);
  const cfg = useActiveLlmConfig(activeProfileId);
  const extraRules = useStore((s) => s.settings.llmExtraRules);
  const promptOverride = useStore((s) => s.settings.llmPromptOverride);
  const prompt: LlmPromptOptions = { extraRules, promptOverride };

  const [nonce, setNonce] = useState(0);
  // 点过「生成」之后才拉取（周报调接口花钱，不自动发起）；重新生成 = nonce + 1
  const [requested, setRequested] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [state, setState] = useState<ReportState>({ doneKey: null, result: null, error: null, cancelled: false });
  // effect 按缓存键（值稳定）触发，输入经 ref 传递
  const latest = useRef({ records, cfg, prompt });
  useEffect(() => {
    latest.current = { records, cfg, prompt };
  });
  const abortRef = useRef<AbortController | null>(null);
  const key = cfg ? weeklyReportKey(cfg, records, prompt) : null;
  const requestKey = key ? `${key}#${nonce}` : null;
  const hasWeek = weekRecords(records).length > 0;

  useEffect(() => {
    if (!requested || !key || !requestKey) return;
    const { cfg: curCfg, records: curRecords, prompt: curPrompt } = latest.current;
    if (!curCfg) return;
    const controller = new AbortController();
    abortRef.current = controller;
    let alive = true;
    setStreamText(null);
    cachedWeeklyReport(key, () => fetchWeeklyReport(curRecords, curCfg, {
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
  }, [requested, key, requestKey]);

  const loading = requested && state.doneKey !== requestKey;

  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <CalendarRange size={13} className="text-accent" />
          {t('history.reportTitle')}
        </span>
        <span className="text-[10px] text-ink-2">{t('settings.labs')}</span>
      </div>

      {adviceMode !== 'llm' || !cfg ? (
        <p className="px-0.5 text-xs leading-relaxed text-ink-2">{t('history.reportNeedLlm')}</p>
      ) : !hasWeek ? (
        <p className="px-0.5 text-xs leading-relaxed text-ink-2">{t('history.reportEmpty')}</p>
      ) : loading ? (
        <div className="flex flex-col px-0.5">
          <div className="flex items-center gap-2 text-xs text-ink-2">
            <Loader2 size={13} className="animate-spin text-accent" />
            {t('history.reportLoading')}
            <button
              onClick={() => abortRef.current?.abort()}
              className="ml-auto text-[11px] font-medium text-ink-2 transition-opacity hover:opacity-70"
            >
              {t('common.cancel')}
            </button>
          </div>
          {streamText != null && <StreamPreview text={streamText} />}
        </div>
      ) : state.error != null ? (
        <div className="flex flex-col gap-1.5 px-0.5">
          <p className="text-xs leading-relaxed text-ink">
            <span className="font-medium">{t('history.reportFail')}</span>
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
      ) : state.cancelled ? (
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
      ) : state.result ? (
        <>
          <LlmResultView result={state.result} />
          <button
            onClick={() => setNonce((n) => n + 1)}
            className="mt-2 flex items-center gap-1.5 px-0.5 text-[11px] font-medium text-ink-2 transition-opacity hover:opacity-70"
          >
            <RefreshCw size={11} />
            {t('history.reportRegenerate')}
          </button>
        </>
      ) : (
        <button
          onClick={() => setRequested(true)}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-on-accent transition-opacity hover:opacity-90"
        >
          {t('history.reportGenerate')}
        </button>
      )}
    </div>
  );
}
