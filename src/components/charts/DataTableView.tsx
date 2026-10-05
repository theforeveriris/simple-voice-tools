/**
 * 图表的数据表视图（Canvas 图表的无障碍 / 复制替代面）
 * - SeriesDataTable：分析页时序图（音高 / 能量 / 共振峰）选中区间内的帧表；
 *   帧数超上限时等距抽样渲染，「复制」仍输出区间内全量数据（TSV）。
 * - TrendDataTable：历史页趋势图的记录表（时间 / 模式 / 指标值 / 音域）。
 * 表格为真实 <table>，读屏用户可整体朗读，也方便选择复制。
 * 取数直接在渲染期进行（毫秒级，与画布重绘同量级），随语言/区间/数据即时刷新。
 */

import { Copy, LineChart, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  seriesTable, trendTable, toTsv, type SeriesTableKind, type TableData,
} from '@/lib/seriesTable';
import type { TrendMetric } from '@/lib/trendMetric';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AnalysisRecord, RecordSeries } from '@/types';
import { cn } from '@/lib/utils';

const tableWrapClass = 'relative flex flex-col overflow-hidden rounded-xl bg-surface-hi/60';

/** 图表 / 数据表切换按钮（卡片标题行右侧的小圆钮） */
export function ChartTableToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const label = t(on ? 'table.hide' : 'table.show');
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className="grid size-6 place-items-center rounded-full text-ink-2 transition-colors hover:bg-black/5 hover:text-ink"
    >
      {on ? <LineChart size={13} /> : <Table2 size={13} />}
    </button>
  );
}

/** 复制整表为 TSV */
function CopyButton({ data }: { data: TableData }) {
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(toTsv(data)).then(() => toast.success(t('toast.copied')));
      }}
      title={t('table.copy')}
      aria-label={t('table.copy')}
      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-accent transition-opacity hover:opacity-70"
    >
      <Copy size={11} />
      {t('table.copy')}
    </button>
  );
}

function TableBody({ data, className }: { data: TableData; className: string }) {
  if (data.rows.length === 0) {
    return <p className="py-6 text-center text-[11px] text-ink-2">{t('table.empty')}</p>;
  }
  return (
    <div className={cn('min-h-0 flex-1 overflow-auto', className)}>
      <table className="w-full border-collapse text-left font-mono text-[10px] tabular-nums">
        <thead className="sticky top-0 bg-card">
          <tr>
            {data.headers.map((h, i) => (
              <th key={i} className="border-b border-black/[0.06] px-2 py-1.5 font-medium text-ink-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri} className="odd:bg-black/[0.015]">
              {row.map((c, ci) => (
                <td key={ci} className="whitespace-nowrap px-2 py-1 text-ink-2">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------ 时序图数据表 ------------------------------ */

export function SeriesDataTable({
  kind, series, range, heightClass = 'h-[150px] sm:h-[200px]',
}: {
  kind: SeriesTableKind;
  series: RecordSeries;
  range: [number, number];
  /** 与所替换的画布区等高，保持卡片布局不跳动 */
  heightClass?: string;
}) {
  useI18n();
  const headers = { time: t('table.time'), f0: t('table.f0'), db: t('table.db'), f1: t('table.f1'), f2: t('table.f2') };
  const data = seriesTable(kind, series, range, headers);
  return (
    <div className={cn(tableWrapClass, heightClass)}>
      <div className="flex items-center justify-between gap-2 px-2 pt-1.5">
        <span className="text-[10px] text-ink-2">
          {data.total > data.shown
            ? t('table.sampled', { shown: data.shown, total: data.total })
            : t('table.frames', { n: data.total })}
        </span>
        <CopyButton data={data} />
      </div>
      <TableBody data={data} className="" />
    </div>
  );
}

/* ------------------------------ 趋势图数据表 ------------------------------ */

export function TrendDataTable({ records, metric = 'f0' }: { records: AnalysisRecord[]; metric?: TrendMetric }) {
  useI18n();
  const data = trendTable(records, metric, {
    date: t('table.date'),
    mode: t('table.mode'),
    valueF0: t('table.valueF0'),
    valueMpt: t('table.valueMpt'),
    valueCpps: t('table.valueCpps'),
    p10p90: t('table.p10p90'),
    modeOf: (m) => t(`mode.${m}`),
  });
  return (
    <div className={cn(tableWrapClass, 'h-[280px] sm:h-[330px]')}>
      <div className="flex items-center justify-end gap-2 px-2 pt-1.5">
        <CopyButton data={data} />
      </div>
      <TableBody data={data} className="" />
    </div>
  );
}
