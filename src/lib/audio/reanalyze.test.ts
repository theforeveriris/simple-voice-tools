import { describe, it, expect } from 'vitest';
import { reanalyzePcm, algoParamsFingerprint } from './reanalyze';
import { makeSine } from './testHelpers';
import { setAlgoParams, getAlgoParams, ALGO_PARAM_DEFAULTS } from './algoParams';
import { PIPELINE_HZ } from './analysisPipeline';
import type { AnalysisRecord } from '@/types';


function makeOriginal(): AnalysisRecord {
  return {
    id: 'rec-1',
    createdAt: 1700000000000,
    durationSec: 2.2,
    sampleHz: 30,
    mode: 'sustained',
    note: '晨起',
    series: { t: [0], f0: [null], rmsDb: [-99], f1: [null], f2: [null] },
    stats: {
      durationSec: 2.2, sampleHz: 30, totalSamples: 1, voicedSamples: 0,
      avgF0: 0, medianF0: 0, minF0: 0, maxF0: 0, p10F0: 0, p90F0: 0, stdF0: 0,
      malePct: 0, femalePct: 0, transitionPct: 0,
      avgF1: null, avgF2: null, f1Range: null, f2Range: null,
      avgDb: -99, peakDb: -99,
    },
  };
}

/** 2.2s 的 160Hz 脉冲串（含少量谐波失真，LPC 有内容可解） */
function makePcm(): Float32Array {
  const f0 = 160;
  const durSec = 2.2;
  const n = Math.round(durSec * PIPELINE_HZ);
  const out = new Float32Array(n);
  const base = makeSine(f0, PIPELINE_HZ, durSec, 0.3);
  // 叠加二次 / 三次谐波，让频谱有结构（纯正弦也能测，这里更接近语音）
  const h2 = makeSine(f0 * 2, PIPELINE_HZ, durSec, 0.15);
  const h3 = makeSine(f0 * 3, PIPELINE_HZ, durSec, 0.08);
  for (let i = 0; i < n; i++) out[i] = base[i] + h2[i] + h3[i];
  return out;
}

describe('algoParamsFingerprint', () => {
  it('同参数指纹一致；改参数后指纹变化', () => {
    const fp1 = algoParamsFingerprint();
    expect(algoParamsFingerprint()).toBe(fp1);
    const prev = getAlgoParams();
    try {
      setAlgoParams({ ...prev, yinThreshold: 0.2 });
      expect(algoParamsFingerprint()).not.toBe(fp1);
    } finally {
      setAlgoParams(prev);
    }
    expect(algoParamsFingerprint()).toBe(fp1);
    expect(getAlgoParams()).toEqual(ALGO_PARAM_DEFAULTS);
  });
});

describe('reanalyzePcm', () => {
  it('保留元数据（id/createdAt/mode/note），替换分析结果并标记重算', async () => {
    const original = makeOriginal();
    const { record: next, truncated } = await reanalyzePcm(makePcm(), original);

    expect(truncated).toBe(false);
    // 元数据原样保留
    expect(next.id).toBe('rec-1');
    expect(next.createdAt).toBe(1700000000000);
    expect(next.mode).toBe('sustained');
    expect(next.note).toBe('晨起');
    // 分析结果被替换：序列有效、统计有意义
    expect(next.series.t.length).toBeGreaterThan(60);
    expect(next.durationSec).toBeGreaterThan(2);
    expect(next.durationSec).toBeLessThan(2.5);
    expect(Math.abs(next.stats.avgF0 - 160)).toBeLessThan(6);
    expect(next.reanalyzedAt).toBeGreaterThan(0);
    expect(next.paramsFp).toBe(algoParamsFingerprint());
    // 原记录对象不被改动
    expect(original.series.t).toHaveLength(1);
    expect(original.reanalyzedAt).toBeUndefined();
  });

  it('重算出的 sampleHz 与序列帧率一致（约 30fps）', async () => {
    const { record: next } = await reanalyzePcm(makePcm(), makeOriginal());
    expect(Math.abs(next.sampleHz - 30)).toBeLessThan(1);
  });

  it('有效内容不足（过短）抛错且原记录不受影响', async () => {
    const original = makeOriginal();
    await expect(reanalyzePcm(makeSine(160, PIPELINE_HZ, 0.2, 0.3), original)).rejects.toThrow('tooShort');
    expect(original.stats.avgF0).toBe(0);
  });
});
