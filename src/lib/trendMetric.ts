/**
 * 趋势图纵轴指标的取值规则（独立于组件，供图表与页面共用）
 * f0：平均基频；mpt：最长声时（仅长音模式记录可算）；cpps：需已保存录音音频的记录。
 */

import { computeSustainedMetrics } from '@/lib/audio/sustained';
import type { AnalysisRecord } from '@/types';

/** 趋势指标：平均基频 / 最长声时（MPT）/ CPPS */
export type TrendMetric = 'f0' | 'mpt' | 'cpps';

/** 记录在当前指标下的数值（无数据返回 null：MPT 仅长音、CPPS 需音频） */
export function trendMetricValue(r: AnalysisRecord, metric: TrendMetric): number | null {
  if (metric === 'f0') return r.stats.avgF0 > 0 ? r.stats.avgF0 : null;
  if (metric === 'mpt') {
    if (r.mode !== 'sustained') return null;
    const mpt = computeSustainedMetrics(r).mptSec;
    return mpt > 0 ? mpt : null;
  }
  return r.stats.cppsDb ?? null;
}

/** 当前指标下是否存在可绘制的数据（供页面决定显示图表还是空态提示） */
export function hasTrendMetricData(records: AnalysisRecord[], metric: TrendMetric): boolean {
  return records.some((r) => trendMetricValue(r, metric) != null);
}
