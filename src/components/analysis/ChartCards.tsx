/**
 * 分析页图表卡片
 * - AnalysisChart：通用时序卡（音高 / 能量），SeriesChart + 底部时间轴区间选择
 * - FormantCard：共振峰卡片，时域曲线 / 元音空间散点双视图切换
 * - SpecCard：语谱图卡片（F1 / F2 轨迹叠加）
 * - VrpCard：声域图（VRP），仅滑音模式记录显示
 *
 * 时间轴区间状态由页面层持有（共享 / 独立两种模式），经 props 传入。
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { SeriesChart } from '@/components/charts/SeriesChart';
import { SpecChart } from '@/components/charts/SpecChart';
import { TimeRangeSelector } from '@/components/charts/TimeRangeSelector';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';
import { cn } from '@/lib/utils';

/** 各卡片共用的区间受控属性（区间状态由页面层持有） */
interface RangedCardProps {
  record: AnalysisRecord;
  range: [number, number];
  onRangeChange: (r: [number, number]) => void;
  playhead?: number | null;
}

/* ------------------------------ 通用时序卡片 ------------------------------ */

export function AnalysisChart({
  kind,
  title,
  right,
  record,
  heightClass,
  range,
  onRangeChange,
  playhead,
}: {
  kind: 'pitch' | 'energy' | 'formant';
  title: string;
  right?: ReactNode;
  record: AnalysisRecord;
  heightClass: string;
  range: [number, number];
  onRangeChange: (r: [number, number]) => void;
  playhead?: number | null;
}) {
  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-xs font-medium tracking-wide text-ink-2">{title}</span>
        {right}
      </div>
      <div className={cn('relative', heightClass)}>
        <SeriesChart kind={kind} series={record.series} range={range} playhead={playhead} />
      </div>
      <TimeRangeSelector
        series={record.series}
        total={record.durationSec}
        value={range}
        onChange={onRangeChange}
        className="mt-2.5"
      />
    </div>
  );
}

/* --------------------------- 共振峰卡片（双视图） --------------------------- */

export function FormantCard({ record, range, onRangeChange, playhead }: RangedCardProps) {
  // 共振峰卡片视图：时域曲线 / 元音空间散点
  const [formantView, setFormantView] = useState<'curve' | 'scatter'>('curve');
  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <span className="text-xs font-medium tracking-wide text-ink-2">{t('analysis.titleFormant')}</span>
        <div className="flex shrink-0 items-center gap-2.5">
          {formantView === 'curve' ? (
            <div className="flex items-center gap-3 text-[11px] text-ink-2">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />F1</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent2" />F2</span>
            </div>
          ) : (
            <span className="hidden text-[10px] text-ink-2 sm:inline">{t('analysis.scatterRefHint')}</span>
          )}
          <div className="flex items-center rounded-full bg-surface-hi p-0.5 text-[11px]">
            <button
              onClick={() => setFormantView('curve')}
              className={cn(
                'rounded-full px-2.5 py-0.5 transition-colors',
                formantView === 'curve' ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
              )}
            >
              {t('analysis.viewCurve')}
            </button>
            <button
              onClick={() => setFormantView('scatter')}
              className={cn(
                'rounded-full px-2.5 py-0.5 transition-colors',
                formantView === 'scatter' ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
              )}
            >
              {t('analysis.viewScatter')}
            </button>
          </div>
        </div>
      </div>
      <div className={cn('relative', formantView === 'scatter' ? 'h-[210px] sm:h-[280px]' : 'h-[150px] sm:h-[200px]')}>
        <SeriesChart
          kind={formantView === 'scatter' ? 'vowelSpace' : 'formant'}
          series={record.series}
          range={range}
          playhead={playhead}
        />
      </div>
      <TimeRangeSelector
        series={record.series}
        total={record.durationSec}
        value={range}
        onChange={onRangeChange}
        className="mt-2.5"
      />
      {formantView === 'scatter' && (
        <p className="mt-1.5 text-center text-[10px] text-ink-2">
          {t('analysis.scatterExplain')}
        </p>
      )}
    </div>
  );
}

/* -------------------------------- 语谱图卡片 -------------------------------- */

export function SpecCard({ record, range, onRangeChange, playhead }: RangedCardProps) {
  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-xs font-medium tracking-wide text-ink-2">{t('analysis.titleSpec')}</span>
        <div className="flex items-center gap-3 text-[11px] text-ink-2">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />{t('analysis.specF1Legend')}</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent2" />{t('analysis.specF2Legend')}</span>
        </div>
      </div>
      <div className="relative h-[190px] sm:h-[260px]">
        <SpecChart record={record} range={range} playhead={playhead} />
      </div>
      <TimeRangeSelector
        series={record.series}
        total={record.durationSec}
        value={range}
        onChange={onRangeChange}
        className="mt-2.5"
      />
    </div>
  );
}

/* -------------------------------- 声域图卡片 -------------------------------- */

export function VrpCard({ record, range, onRangeChange, playhead }: RangedCardProps) {
  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-xs font-medium tracking-wide text-ink-2">{t('analysis.titleVrp')}</span>
        <span className="text-[10px] text-ink-2">{t('analysis.vrpDepthHint')}</span>
      </div>
      <div className="relative h-[260px] sm:h-[340px]">
        <SeriesChart
          kind="vrp"
          series={record.series}
          range={range}
          playhead={playhead}
        />
      </div>
      <TimeRangeSelector
        series={record.series}
        total={record.durationSec}
        value={range}
        onChange={onRangeChange}
        className="mt-2.5"
      />
      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-2">
        {t('analysis.vrpExplain')}
      </p>
    </div>
  );
}
