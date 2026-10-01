/**
 * 训练建议（实验性，本地规则引擎）
 * 纯本地规则从一条记录的统计里生成至多三条可执行的建议；
 * 不联网、不调任何 API。规则阈值取常见的参考范围，未经临床验证，
 * 因此仅在 实验性功能 开启后显示，并以免责声明提示仅供参考。
 */

import { computeSustainedMetrics } from '@/lib/audio/sustained';
import type { DictKey } from '@/i18n';
import type { AnalysisRecord } from '@/types';

/** 一条建议：词典键 + 占位参数（渲染时用 t() 取文案） */
export interface AdviceItem {
  key: DictKey;
  params?: Record<string, string | number>;
}

/** 训练靶标配置（来自设置，便于纯函数测试） */
export interface AdviceTarget {
  enabled: boolean;
  min: number;
  max: number;
}

/** MPT 参考下限（健康成人多为 15–25 秒，低于 12 秒提示偏短） */
const MPT_MIN_SEC = 12;
/** Jitter(local) 参考上限（%） */
const JITTER_MAX_PCT = 1.04;
/** 基频变异系数参考上限（标准差 / 中位基频） */
const F0_CV_MAX = 0.22;
/** 有效发声占比下限（%），过低说明录音中停顿多 */
const VOICED_MIN_PCT = 35;

/**
 * 由记录统计生成建议（最多 3 条，按重要性排序）；全部通过时返回「保持」一条
 */
export function buildAdvice(record: AnalysisRecord, target: AdviceTarget): AdviceItem[] {
  const tips: AdviceItem[] = [];
  const s = record.stats;

  // 1. 靶标偏离：平均基频整体落在目标区间外时给出调整方向
  if (target.enabled && s.avgF0 > 0) {
    if (s.avgF0 < target.min) {
      tips.push({ key: 'analysis.adviceTargetBelow', params: { n: Math.round(target.min - s.avgF0) } });
    } else if (s.avgF0 > target.max) {
      tips.push({ key: 'analysis.adviceTargetAbove', params: { n: Math.round(s.avgF0 - target.max) } });
    }
  }

  // 2. MPT 偏短（仅长音模式记录：朗读/滑音的持续段不构成 MPT 测量）
  if (record.mode === 'sustained') {
    const { mptSec } = computeSustainedMetrics(record);
    if (mptSec > 0 && mptSec < MPT_MIN_SEC) {
      tips.push({ key: 'analysis.adviceMpt', params: { n: mptSec.toFixed(1) } });
    }
  }

  // 3. Jitter 偏高：声音可能偏紧，提示用声休息
  if (s.jitterPct != null && s.jitterPct > JITTER_MAX_PCT) {
    tips.push({ key: 'analysis.adviceJitter', params: { n: s.jitterPct.toFixed(2) } });
  }

  // 4. 基频波动偏大：相对值（CV）比绝对 Hz 更跨人可比
  const f0Ref = s.medianF0 || s.avgF0;
  if (f0Ref > 0 && s.stdF0 / f0Ref > F0_CV_MAX) {
    tips.push({ key: 'analysis.adviceStd', params: { n: s.stdF0.toFixed(0) } });
  }

  // 5. 有效发声占比过低：录音中停顿多，数据代表性差
  const voicedPct = s.totalSamples > 0 ? (s.voicedSamples / s.totalSamples) * 100 : 100;
  if (s.totalSamples > 30 && voicedPct < VOICED_MIN_PCT) {
    tips.push({ key: 'analysis.adviceVoiced', params: { n: Math.round(voicedPct) } });
  }

  if (tips.length === 0) {
    tips.push({ key: 'analysis.adviceGood' });
  }
  return tips.slice(0, 3);
}
