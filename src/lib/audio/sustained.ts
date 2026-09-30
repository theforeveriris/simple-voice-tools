/**
 * 长音测试（sustained）专用分析指标
 * 由记录序列直接推导，不落库（旧记录同样可算）：
 *   MPT          最长声时：首/末发声帧跨度（秒）
 *   音高稳定度   stdF0 / medianF0 × 100%（变异系数，越小越稳）
 *   响度衰减     发声帧 rmsDb 对时间的线性回归斜率（dB/s，越接近 0 越平稳）
 */

import type { AnalysisRecord } from '@/types';

export interface SustainedMetrics {
  mptSec: number;
  cvPct: number | null;
  decayDbPerSec: number | null;
}

/** 发声帧能量门限（与 recorder/voiceQuality 口径一致） */
const ACTIVE_DB = -50;

export function computeSustainedMetrics(record: AnalysisRecord): SustainedMetrics {
  const { series, stats } = record;

  // 发声帧索引：长音任务中即持续发声段（以音高检出为准）
  const voicedIdx: number[] = [];
  for (let i = 0; i < series.t.length; i++) {
    const f = series.f0[i];
    if (f != null && f > 0) voicedIdx.push(i);
  }

  let mptSec = 0;
  let decayDbPerSec: number | null = null;
  if (voicedIdx.length >= 2) {
    const i0 = voicedIdx[0];
    const i1 = voicedIdx[voicedIdx.length - 1];
    mptSec = Math.max(0, series.t[i1] - series.t[i0]);

    // 响度衰减斜率：区间内的发声能量帧（含无声带振动但有能量的帧）
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = i0; i <= i1; i++) {
      if (series.rmsDb[i] < ACTIVE_DB) continue;
      xs.push(series.t[i]);
      ys.push(series.rmsDb[i]);
    }
    if (xs.length >= 3) {
      const n = xs.length;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let k = 0; k < n; k++) {
        sx += xs[k]; sy += ys[k];
        sxx += xs[k] * xs[k]; sxy += xs[k] * ys[k];
      }
      const denom = n * sxx - sx * sx;
      if (Math.abs(denom) > 1e-9) {
        decayDbPerSec = (n * sxy - sx * sy) / denom;
      }
    }
  }

  const cvPct = stats.medianF0 > 0 ? (stats.stdF0 / stats.medianF0) * 100 : null;

  return { mptSec, cvPct, decayDbPerSec };
}
