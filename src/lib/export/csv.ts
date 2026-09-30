/**
 * CSV 导出
 * - 帧级 CSV：单条记录的完整数据序列，便于 Excel / Python 深度分析
 * - 汇总 CSV：全部记录每条一行的统计摘要
 * 均带 UTF-8 BOM，Excel 直接打开不乱码。
 */

import type { AnalysisRecord } from '@/types';

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 下载文本文件 */
export function downloadText(filename: string, text: string, mime = 'text/csv'): void {
  const blob = new Blob(['\uFEFF', text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const cell = (v: number | null | undefined, digits = 1): string =>
  v == null || !isFinite(v) ? '' : String(Math.round(v * 10 ** digits) / 10 ** digits);

/** 单条记录的帧级数据（t, f0, rmsDb, f1, f2） */
export function recordToFrameCsv(record: AnalysisRecord): string {
  const { series } = record;
  const lines: string[] = ['t_s,f0_hz,rms_db,f1_hz,f2_hz'];
  for (let i = 0; i < series.t.length; i++) {
    lines.push([
      cell(series.t[i], 3),
      cell(series.f0[i], 1),
      cell(series.rmsDb[i], 1),
      cell(series.f1[i], 0),
      cell(series.f2[i], 0),
    ].join(','));
  }
  return lines.join('\n');
}

/** 全部记录的统计摘要（每条一行） */
export function recordsToSummaryCsv(records: AnalysisRecord[]): string {
  const header = [
    'id', 'created_at', 'mode', 'note', 'duration_sec',
    'avg_f0_hz', 'median_f0_hz', 'min_f0_hz', 'max_f0_hz', 'p10_f0_hz', 'p90_f0_hz', 'std_f0_hz',
    'male_pct', 'female_pct', 'transition_pct',
    'avg_f1_hz', 'avg_f2_hz', 'avg_db', 'peak_db',
    'jitter_pct', 'shimmer_pct', 'hnr_db',
  ].join(',');
  const lines = records.map((r) => {
    const s = r.stats;
    return [
      r.id,
      new Date(r.createdAt).toISOString(),
      r.mode ?? '',
      csvEscape(r.note ?? ''),
      cell(s.durationSec, 1),
      cell(s.avgF0, 1), cell(s.medianF0, 1), cell(s.minF0, 0), cell(s.maxF0, 0),
      cell(s.p10F0, 0), cell(s.p90F0, 0), cell(s.stdF0, 1),
      s.malePct, s.femalePct, s.transitionPct,
      cell(s.avgF1, 0), cell(s.avgF2, 0), cell(s.avgDb, 1), cell(s.peakDb, 1),
      cell(s.jitterPct ?? null, 3), cell(s.shimmerPct ?? null, 2), cell(s.hnrDb ?? null, 1),
    ].join(',');
  });
  return [header, ...lines].join('\n');
}
