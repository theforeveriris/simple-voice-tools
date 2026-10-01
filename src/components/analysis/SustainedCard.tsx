/**
 * 长音分析卡
 * 长音模式记录专属指标：MPT / 音高稳定度 / 响度衰减
 */

import { useMemo } from 'react';
import { Activity, Timer, Waves } from 'lucide-react';
import { computeSustainedMetrics } from '@/lib/audio/sustained';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';

/** 长音模式专属指标：MPT / 音高稳定度 / 响度衰减 */
export function SustainedCard({ record }: { record: AnalysisRecord }) {
  const m = useMemo(() => computeSustainedMetrics(record), [record]);
  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-2.5 flex items-center justify-between px-0.5">
        <span className="text-xs font-semibold text-ink">{t('analysis.sustainedTitle')}</span>
        {record.mode && <span className="text-[10px] text-ink-2">{t(`mode.${record.mode}`)}</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl bg-surface-hi/60 px-4 py-3">
          <Timer size={18} className="shrink-0 text-accent" />
          <div>
            <p className="text-[11px] text-ink-2">{t('analysis.sustainedMpt')}</p>
            <p className="text-lg font-semibold tabular-nums text-ink">
              {t('analysis.mptValue', { n: m.mptSec.toFixed(1) })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-surface-hi/60 px-4 py-3">
          <Activity size={18} className="shrink-0 text-accent" />
          <div>
            <p className="text-[11px] text-ink-2">{t('analysis.sustainedCv')}</p>
            <p className="text-lg font-semibold tabular-nums text-ink">
              {m.cvPct != null ? t('analysis.cvValue', { n: m.cvPct.toFixed(1) }) : '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-surface-hi/60 px-4 py-3">
          <Waves size={18} className="shrink-0 text-accent" />
          <div>
            <p className="text-[11px] text-ink-2">{t('analysis.sustainedDecay')}</p>
            <p className="text-lg font-semibold tabular-nums text-ink">
              {m.decayDbPerSec != null
                ? t('analysis.decayValue', { n: `${m.decayDbPerSec > 0 ? '+' : ''}${m.decayDbPerSec.toFixed(2)}` })
                : '—'}
            </p>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-ink-2">{t('analysis.sustainedExplain')}</p>
    </div>
  );
}
