/**
 * 训练建议卡（实验性）
 * adviceMode = rules：本地规则引擎生成（lib/advice.ts）；
 * adviceMode = llm：调用 设置 → 大模型 中使用中档案的接口（lib/llm.ts）。
 * 传入两条记录时（对比页）按 A / B 分组给规则建议，
 * 大模型则合并两份统计生成对比性建议。
 */

import { useEffect, useRef } from 'react';
import { Lightbulb, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { buildAdvice, type AdviceTarget } from '@/lib/advice';
import {
  cachedLlmAdvice, fetchLlmAdvice, hasCachedLlmAdvice, llmAdviceKey,
  type LlmConfig,
} from '@/lib/llm';
import { useActiveLlmConfig } from '@/lib/llmProfiles';
import { useLlmStream } from '@/hooks/useLlmStream';
import { fmtShortDateTime } from '@/lib/utils';
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
              <span className="text-[10px] text-ink-2">{fmtShortDateTime(rec.createdAt)}</span>
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

/** 大模型判断：点击触发后异步生成（会话内缓存，失败可重试）。
 *  付费调用仅由用户显式发起（不上传音频，仅统计指标；卸载不中断，跑完照常进缓存）；
 *  键变化（重算/改备注）后的免费重取与手动重取门控见 useLlmStream。 */
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
  const key = cfg ? llmAdviceKey(cfg, records, target, { baseline, prompt }) : null;
  // effect 按缓存键（值稳定）触发，输入经 ref 传递：键值不变则不重复请求
  const latest = useRef({ records, target, cfg, baseline, prompt });
  useEffect(() => {
    latest.current = { records, target, cfg, baseline, prompt };
  });
  const llm = useLlmStream({
    key,
    run: (signal, onDelta) => {
      const cur = latest.current;
      const curKey = llmAdviceKey(cur.cfg!, cur.records, cur.target, { baseline: cur.baseline, prompt: cur.prompt });
      return cachedLlmAdvice(curKey, () => fetchLlmAdvice(cur.records, cur.target, cur.cfg!, {
        baseline: cur.baseline,
        prompt: cur.prompt,
        signal,
        onDelta,
      }));
    },
    checkCached: hasCachedLlmAdvice,
  });
  const { state, requestKey, stream, stale } = llm;

  if (!cfg) {
    return <p className="px-0.5 text-xs leading-relaxed text-ink-2">{t('analysis.adviceLlmNoConfig')}</p>;
  }
  if (!llm.enabled) {
    return (
      <button
        onClick={llm.start}
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70"
      >
        <Sparkles size={13} />
        {t('analysis.adviceLlmRun')}
      </button>
    );
  }
  if (llm.loading) {
    return (
      <div className="flex flex-col px-0.5">
        <div className="flex items-center gap-2 text-xs text-ink-2">
          <Loader2 size={13} className="animate-spin text-accent" />
          {t('analysis.adviceLlmLoading')}
          <button
            onClick={llm.abort}
            className="ml-auto text-[11px] font-medium text-ink-2 transition-opacity hover:opacity-70"
          >
            {t('common.cancel')}
          </button>
        </div>
        {stream?.key === requestKey && <StreamPreview text={stream.text} />}
      </div>
    );
  }
  if (stale) {
    // 键变化后未自动重取（缓存未命中）：展示旧结果并给手动重取入口，不自动消耗付费额度
    return (
      <div className="flex flex-col gap-1.5 px-0.5">
        {state.result && <LlmResultView result={state.result} />}
        <button
          onClick={llm.retry}
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          <RefreshCw size={12} />
          {t('analysis.adviceLlmRetry')}
        </button>
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
          onClick={llm.retry}
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
          onClick={llm.retry}
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
