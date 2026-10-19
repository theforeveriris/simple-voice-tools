import { describe, it, expect } from 'vitest';
import { buildAdvice, type AdviceTarget } from './advice';
import type { AnalysisRecord } from '@/types';

/** 靶标关闭，保证只有被考察的规则可能命中 */
const target: AdviceTarget = { enabled: false, min: 120, max: 220 };

/** 各项指标都在参考范围内的「健康」记录，除覆盖字段外不触发别的建议 */
function rec(stats: Record<string, unknown>): AnalysisRecord {
  return {
    id: 'r1',
    createdAt: 0,
    durationSec: 10,
    sampleHz: 30,
    series: { t: [], f0: [], rmsDb: [], f1: [], f2: [] },
    stats: {
      durationSec: 10, sampleHz: 30, totalSamples: 300, voicedSamples: 280,
      avgF0: 180, medianF0: 178, minF0: 150, maxF0: 210, p10F0: 160, p90F0: 200,
      stdF0: 18, malePct: 0, femalePct: 100, transitionPct: 0,
      avgDb: -25, peakDb: -8,
      ...stats,
    },
  } as unknown as AnalysisRecord;
}

const keys = (tips: { key: string }[]) => tips.map((x) => x.key);

describe('buildAdvice 共鸣间距规则（F2−F1）', () => {
  it('MtF 方向且间距偏窄时给出「收前共鸣」建议', () => {
    expect(keys(buildAdvice(rec({ f2f1GapHz: 800 }), target, 'mtf')))
      .toContain('analysis.adviceResonance');
  });

  it('FtM / 未设方向时不给 MtF 方向的共鸣建议（方向相反或不明）', () => {
    expect(keys(buildAdvice(rec({ f2f1GapHz: 800 }), target, 'ftm')))
      .not.toContain('analysis.adviceResonance');
    expect(keys(buildAdvice(rec({ f2f1GapHz: 800 }), target, 'other')))
      .not.toContain('analysis.adviceResonance');
    // 缺省参数等价于 other
    expect(keys(buildAdvice(rec({ f2f1GapHz: 800 }), target)))
      .not.toContain('analysis.adviceResonance');
  });

  it('间距正常时 MtF 也不给共鸣建议', () => {
    expect(keys(buildAdvice(rec({ f2f1GapHz: 1400 }), target, 'mtf')))
      .not.toContain('analysis.adviceResonance');
  });

  it('f2f1GapHz 缺失（旧记录）不报错也不误报', () => {
    const tips = buildAdvice(rec({ f2f1GapHz: null }), target, 'mtf');
    expect(keys(tips)).not.toContain('analysis.adviceResonance');
    expect(tips.length).toBeGreaterThan(0);
  });
});

describe('buildAdvice 其它规则仍然生效', () => {
  it('靶标偏离：平均基频低于下限时给出上调建议', () => {
    const tips = buildAdvice(rec({ avgF0: 90 }), { enabled: true, min: 120, max: 220 });
    expect(keys(tips)).toContain('analysis.adviceTargetBelow');
  });

  it('全部达标时返回「保持」一条', () => {
    expect(keys(buildAdvice(rec({}), target))).toEqual(['analysis.adviceGood']);
  });
});
