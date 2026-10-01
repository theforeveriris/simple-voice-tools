/**
 * 训练建议卡（实验性）
 * 本地规则引擎生成的训练建议（设置 → 实验性功能 中可关闭）
 */

import { Lightbulb } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { buildAdvice } from '@/lib/advice';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';

/** 本地规则引擎生成的训练建议（设置 → 实验性功能 中可关闭） */
export function AdviceCard({ record }: { record: AnalysisRecord }) {
  const adviceEnabled = useStore((s) => s.settings.adviceEnabled);
  const targetEnabled = useStore((s) => s.settings.targetEnabled);
  const targetMin = useStore((s) => s.settings.targetF0Min);
  const targetMax = useStore((s) => s.settings.targetF0Max);
  if (!adviceEnabled) return null;
  const tips = buildAdvice(record, { enabled: targetEnabled, min: targetMin, max: targetMax });
  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Lightbulb size={13} className="text-accent" />
          {t('analysis.adviceTitle')}
        </span>
        <span className="text-[10px] text-ink-2">{t('settings.labs')}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {tips.map((tip) => (
          <li key={tip.key} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
            <span>{t(tip.key, tip.params)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-0.5 text-[10px] leading-relaxed text-ink-2">{t('analysis.adviceHint')}</p>
    </div>
  );
}
