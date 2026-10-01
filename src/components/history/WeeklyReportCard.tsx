/**
 * AI 周报卡（历史页 · 趋势视图底部）
 * 聚合最近 7 天记录（按模式分组）发给大模型，生成一段周总结：
 * 练习一致性 → 音高 vs 目标 → 共鸣 → 嗓音健康 → 下周建议。
 * 依赖 设置 → 实验性功能 → 大模型配置；同一周内会话级缓存。
 */

import { useEffect, useRef, useState } from 'react';
import { CalendarRange, Loader2, RefreshCw } from 'lucide-react';
import { useStore } from '@/store/useStore';
import {
  cachedWeeklyReport, fetchWeeklyReport, resolveLlmConfig, weekRecords, weeklyReportKey,
  type LlmAdviceResult, type LlmPromptOptions,
} from '@/lib/llm';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AnalysisRecord } from '@/types';
import { LlmResultView } from '@/components/analysis/LlmResultView';

interface ReportState {
  doneKey: string | null;
  result: LlmAdviceResult | null;
  error: string | null;
}

export function WeeklyReportCard({ records }: { records: AnalysisRecord[] }) {
  useI18n();
  const adviceMode = useStore((s) => s.settings.adviceMode);
  const baseUrl = useStore((s) => s.settings.llmBaseUrl);
  const apiKey = useStore((s) => s.settings.llmApiKey);
  const modelId = useStore((s) => s.settings.llmModelId);
  const extraRules = useStore((s) => s.settings.llmExtraRules);
  const promptOverride = useStore((s) => s.settings.llmPromptOverride);
  const cfg = resolveLlmConfig({ llmBaseUrl: baseUrl, llmApiKey: apiKey, llmModelId: modelId });
  const prompt: LlmPromptOptions = { extraRules, promptOverride };

  const [nonce, setNonce] = useState(0);
  // 点过「生成」之后才拉取（周报调接口花钱，不自动发起）；重新生成 = nonce + 1
  const [requested, setRequested] = useState(false);
  const [state, setState] = useState<ReportState>({ doneKey: null, result: null, error: null });
  // effect 按缓存键（值稳定）触发，输入经 ref 传递
  const latest = useRef({ records, cfg, prompt });
  useEffect(() => {
    latest.current = { records, cfg, prompt };
  });
  const key = cfg ? weeklyReportKey(cfg, records, prompt) : null;
  const requestKey = key ? `${key}#${nonce}` : null;
  const hasWeek = weekRecords(records).length > 0;

  useEffect(() => {
    if (!requested || !key || !requestKey) return;
    const { cfg: curCfg, records: curRecords, prompt: curPrompt } = latest.current;
    if (!curCfg) return;
    let alive = true;
    cachedWeeklyReport(key, () => fetchWeeklyReport(curRecords, curCfg, { prompt: curPrompt }))
      .then((result) => {
        if (alive) setState({ doneKey: requestKey, result, error: null });
      })
      .catch((err: unknown) => {
        if (alive) {
          setState({ doneKey: requestKey, result: null, error: err instanceof Error ? err.message : String(err) });
        }
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
        <p className="flex items-center gap-2 px-0.5 text-xs text-ink-2">
          <Loader2 size={13} className="animate-spin text-accent" />
          {t('history.reportLoading')}
        </p>
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
