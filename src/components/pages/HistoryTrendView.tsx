/**
 * 历史页趋势视图
 * 从 HistoryPage 拆出：模式/纵轴筛选、用声日记热力图、趋势图（含数据表切换）。
 * 状态（筛选与指标选择）由本组件自持——与列表视图切换时无需保留，重置为默认即可。
 */

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { TrendChart } from '@/components/charts/TrendChart';
import { ChartTableToggle, TrendDataTable } from '@/components/charts/DataTableView';
import { hasTrendMetricData, type TrendMetric } from '@/lib/trendMetric';
import { DiaryHeatmap } from '@/components/charts/DiaryHeatmap';
import type { DiaryMetric } from '@/components/charts/DiaryHeatmap';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AnalysisRecord, TestMode } from '@/types';
import { cn } from '@/lib/utils';

/** 趋势图的测试模式过滤：不同模式（朗读/长音/滑音）的基频统计不可直接比较 */
const TREND_FILTERS: { id: 'all' | TestMode; labelKey: 'common.all' | 'mode.reading' | 'mode.sustained' | 'mode.glide' }[] = [
  { id: 'all', labelKey: 'common.all' },
  { id: 'reading', labelKey: 'mode.reading' },
  { id: 'sustained', labelKey: 'mode.sustained' },
  { id: 'glide', labelKey: 'mode.glide' },
];

/** 用声日记的指标切换 */
const DIARY_METRICS: { id: DiaryMetric; labelKey: 'history.diaryMetricCount' | 'history.diaryMetricDuration' | 'history.diaryMetricF0' }[] = [
  { id: 'count', labelKey: 'history.diaryMetricCount' },
  { id: 'duration', labelKey: 'history.diaryMetricDuration' },
  { id: 'avgF0', labelKey: 'history.diaryMetricF0' },
];

/** 趋势图纵轴指标切换：平均基频 / 最长声时 MPT（长音）/ CPPS（需录音音频） */
const TREND_METRICS: { id: TrendMetric; labelKey: 'history.trendMetricF0' | 'history.trendMetricMpt' | 'history.trendMetricCpps' }[] = [
  { id: 'f0', labelKey: 'history.trendMetricF0' },
  { id: 'mpt', labelKey: 'history.trendMetricMpt' },
  { id: 'cpps', labelKey: 'history.trendMetricCpps' },
];

export function HistoryTrendView({
  records,
  onOpen,
}: {
  /** 全部记录（本组件内部按模式过滤） */
  records: AnalysisRecord[];
  onOpen: (record: AnalysisRecord) => void;
}) {
  useI18n();
  const [trendFilter, setTrendFilter] = useState<'all' | TestMode>('all');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('f0');
  const [diaryMetric, setDiaryMetric] = useState<DiaryMetric>('count');
  // 趋势图的数据表视图（无障碍 / 复制数据）
  const [trendTableOn, setTrendTableOn] = useState(false);

  const trendRecords = trendFilter === 'all' ? records : records.filter((r) => r.mode === trendFilter);

  return (
    <div className="card-surface p-4">
      {/* 两套筛选地位平等（一个过滤记录、一个切纵轴）：同款分段控件 + 小标签，
          窄屏整组换行而不是组内拆散 */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-ink-2">{t('history.trendModeLabel')}</span>
          <div className="flex items-center rounded-full bg-surface-hi p-0.5" role="group" aria-label={t('history.trendModeLabel')}>
            {TREND_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setTrendFilter(f.id)}
                aria-pressed={trendFilter === f.id}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  trendFilter === f.id ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
                )}
              >
                {t(f.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-ink-2">{t('history.trendMetricLabel')}</span>
          <div className="flex items-center rounded-full bg-surface-hi p-0.5" role="group" aria-label={t('history.trendMetricLabel')}>
            {TREND_METRICS.map((m) => (
              <button
                key={m.id}
                onClick={() => setTrendMetric(m.id)}
                aria-pressed={trendMetric === m.id}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  trendMetric === m.id ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
                )}
              >
                {t(m.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {trendRecords.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-2">{t('history.trendEmpty')}</p>
      ) : !hasTrendMetricData(trendRecords, trendMetric) ? (
        <p className="py-16 text-center text-sm text-ink-2">{t('history.trendMetricEmpty')}</p>
      ) : (
        <>
          {/* 用声日记：日历热力图（打卡概览，跟随当前模式过滤） */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <CalendarDays size={13} className="text-accent" />
                {t('history.diary')}
              </span>
              <div className="flex items-center rounded-full bg-surface-hi p-0.5">
                {DIARY_METRICS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setDiaryMetric(m.id)}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors',
                      diaryMetric === m.id ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
                    )}
                  >
                    {t(m.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <DiaryHeatmap records={trendRecords} metric={diaryMetric} />
          </div>
          <div className="mb-3 border-t border-black/[0.04]" />
          <div className="mb-1 flex items-center justify-end">
            <ChartTableToggle on={trendTableOn} onToggle={() => setTrendTableOn((v) => !v)} />
          </div>
          {trendTableOn ? (
            <TrendDataTable records={trendRecords} metric={trendMetric} />
          ) : (
            <>
              <TrendChart records={trendRecords} connectLine={trendFilter !== 'all'} metric={trendMetric} onOpen={onOpen} />
              <p className="mt-1 text-center text-[10px] text-ink-2">
                {t(trendMetric === 'f0' ? 'history.trendHint' : 'history.trendHintMetric')}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
