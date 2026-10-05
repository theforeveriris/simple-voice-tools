/**
 * 图表数据表（数据表视图）的取数与序列化，独立于组件便于测试。
 * - 时序图（音高 / 能量 / 共振峰）：取选中区间内的帧，超长时等距抽样；
 *   复制（TSV）输出区间内全量帧，不受抽样影响。
 * - 趋势图：每条记录一行（时间 / 模式 / 指标值 / 音域）。
 */

import { trendMetricValue } from '@/lib/trendMetric';
import type { TrendMetric } from '@/lib/trendMetric';
import type { AnalysisRecord, RecordSeries } from '@/types';

/** 表格最多渲染的行数（超出则等距抽样展示；复制仍取全量） */
export const TABLE_MAX_ROWS = 400;

/** 记录的测试模式（去 undefined；与 AnalysisRecord['mode'] 对齐） */
type RecMode = NonNullable<AnalysisRecord['mode']>;

export type SeriesTableKind = 'pitch' | 'energy' | 'formant';

export interface TableData {
  headers: string[];
  /** 每行与 headers 对齐；数值已格式化为展示/导出字符串 */
  rows: string[][];
  /** 区间内总帧数（复制即全量输出此数） */
  total: number;
  /** 实际渲染的行数（≤ TABLE_MAX_ROWS） */
  shown: number;
}

/* ------------------------------ 时序图 ------------------------------ */

/** 选中区间内的行（未格式化）：t + 该 kind 关心的数值列，null → '' */
function framesInRange(
  kind: SeriesTableKind,
  series: RecordSeries,
  range: [number, number],
): (number | null)[][] {
  const cols: ('f0' | 'rmsDb' | 'f1' | 'f2')[] =
    kind === 'pitch' ? ['f0'] : kind === 'energy' ? ['rmsDb'] : ['f1', 'f2'];
  const rows: (number | null)[][] = [];
  for (let i = 0; i < series.t.length; i++) {
    const t = series.t[i];
    if (t < range[0] || t > range[1]) continue;
    rows.push([t, ...cols.map((c) => series[c][i] ?? null)]);
  }
  return rows;
}

/** 等距抽样到 ≤ maxRows 行（保留首末行，天然覆盖区间两端） */
export function sampleRows<T>(rows: T[], maxRows = TABLE_MAX_ROWS): T[] {
  if (rows.length <= maxRows) return rows;
  if (maxRows <= 1) return [rows[0]];
  const stride = (rows.length - 1) / (maxRows - 1);
  const out: T[] = [];
  for (let i = 0; i < maxRows; i++) out.push(rows[Math.round(i * stride)]);
  return out;
}

/** 数值 → 单元格字符串（null/NaN → 空串；时间 2 位小数，其余按列取整） */
function cell(v: number | null, kind: 'time' | 'hz' | 'db'): string {
  if (v == null || !isFinite(v)) return '';
  if (kind === 'time') return v.toFixed(2);
  if (kind === 'db') return v.toFixed(1);
  return String(Math.round(v));
}

/** 时序图的数据表（headers 为 i18n 后的表头文案，由调用方传入） */
export function seriesTable(
  kind: SeriesTableKind,
  series: RecordSeries,
  range: [number, number],
  headers: { time: string; f0: string; db: string; f1: string; f2: string },
): TableData {
  const all = framesInRange(kind, series, range);
  const shownRows = sampleRows(all);
  const colKind: ('time' | 'hz' | 'db')[] =
    kind === 'pitch' ? ['time', 'hz'] : kind === 'energy' ? ['time', 'db'] : ['time', 'hz', 'hz'];
  const head = kind === 'pitch' ? [headers.time, headers.f0] : kind === 'energy' ? [headers.time, headers.db] : [headers.time, headers.f1, headers.f2];
  return {
    headers: head,
    rows: shownRows.map((r) => r.map((v, ci) => cell(v, colKind[ci]))),
    total: all.length,
    shown: shownRows.length,
  };
}

/* ------------------------------ 趋势图 ------------------------------ */

/** 记录时间 → 展示文案（M/D HH:mm） */
function recordTime(ts: number): string {
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/**
 * 趋势图的数据表：每条记录一行；当前指标无值的记录也保留（空单元格），
 * 以便复制后与图表（含空档）对照。
 */
export function trendTable(
  records: AnalysisRecord[],
  metric: TrendMetric,
  labels: { date: string; mode: string; valueF0: string; valueMpt: string; valueCpps: string; p10p90: string; modeOf: (m: RecMode) => string },
): TableData {
  const sorted = [...records].sort((a, b) => a.createdAt - b.createdAt);
  const headers = metric === 'f0'
    ? [labels.date, labels.mode, labels.valueF0, labels.p10p90]
    : [labels.date, labels.mode, metric === 'mpt' ? labels.valueMpt : labels.valueCpps];
  const rows = sorted.map((r) => {
    const v = trendMetricValue(r, metric);
    const base = [recordTime(r.createdAt), r.mode ? labels.modeOf(r.mode) : ''];
    if (metric === 'f0') {
      return [
        ...base,
        v != null ? v.toFixed(1) : '',
        `${Math.round(r.stats.p10F0)}–${Math.round(r.stats.p90F0)}`,
      ];
    }
    return [...base, v != null ? v.toFixed(1) : ''];
  });
  return { headers, rows, total: rows.length, shown: rows.length };
}

/* ------------------------------ 导出 TSV ------------------------------ */

/** 表格 → TSV 文本（表头 + 全部行；调用方可传抽样前的全量行） */
export function toTsv(data: TableData): string {
  return [data.headers.join('\t'), ...data.rows.map((r) => r.join('\t'))].join('\n');
}
