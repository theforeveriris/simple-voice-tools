/**
 * 基线对比条
 * 与基线记录的快速 Δ 对比（基线在 设置 → 训练 中钉选时显示）
 */

import { GitCompareArrows } from 'lucide-react';
import { localeTag, t } from '@/i18n';
import type { AnalysisRecord } from '@/types';
import { cn } from '@/lib/utils';

/** 与基线记录的快速 Δ 对比（基线在 设置 → 训练 中钉选） */
export function BaselineStrip({ record, baseline }: { record: AnalysisRecord; baseline: AnalysisRecord }) {
  const dAvg = record.stats.avgF0 - baseline.stats.avgF0;
  const dP10 = record.stats.p10F0 - baseline.stats.p10F0;
  const dP90 = record.stats.p90F0 - baseline.stats.p90F0;
  const sign = (v: number, digits = 1) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleString(localeTag(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[18px] bg-card px-4 py-3 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
        <GitCompareArrows size={14} className="text-accent" />
        {t('analysis.baselineTitle')}
      </span>
      <span className="text-[11px] tabular-nums text-ink-2">
        {t('analysis.baselineDesc', { date: fmtDate(baseline.createdAt), f0: baseline.stats.avgF0.toFixed(1) })}
        {baseline.note ? ` · ${baseline.note}` : ''}
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold tabular-nums">
        <span className={cn(dAvg >= 0 ? 'text-accent' : 'text-accent2')}>
          F0 {sign(dAvg)} Hz
        </span>
        <span className="text-ink-2">
          P10 {sign(dP10, 0)} · P90 {sign(dP90, 0)} Hz
        </span>
      </span>
    </div>
  );
}
