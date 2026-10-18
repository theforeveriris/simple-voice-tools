/**
 * 声之花（Voice Flower）：把一条记录的统计映射为一朵花的绘制参数
 *
 * 映射（设计定稿）：
 *   花瓣数   ← 谐波能量分布熵（语谱频带分布越丰富花瓣越多；无语谱时按音区多样性近似）
 *   花瓣形状 ← F1/F2（F1 低 & F2 高 = 瓣长而窄前倾；反之短圆）
 *   色相     ← 音区占比（男/女声区占比决定花色在冷暖间定位）
 *   茎高     ← MPT（长音记录；其他模式取固定高）
 *   花心光晕 ← CPPS 稳定度（越稳光晕越亮）
 *
 * 优雅退化：无音频（茎/花心）与无共振峰（花瓣圆形化）都有降级路径，
 * 花永不失败——任何一条记录都能开出一朵。
 * 本模块只产出纯参数对象（可单测）；绘制见 FlowerSvg 组件。
 */

import type { AnalysisRecord } from '@/types';
import { computeSustainedMetrics } from '@/lib/audio/sustained';

/** 一朵花的完整绘制参数（全部归一化或量纲明确，绘制端不再做业务计算） */
export interface Flower {
  /** 花瓣数 5–13 */
  petals: number;
  /** 花瓣长度系数 0.55–1（1 = 最舒展） */
  petalLength: number;
  /** 花瓣宽度系数 0.5–1（1 = 最圆润） */
  petalWidth: number;
  /** 花瓣前倾角 -12°–12°（F2 高 = 前倾为负，视觉上更「挺拔」） */
  petalTiltDeg: number;
  /** 花色相 0–360（音区占比映射：女声区高 → 暖粉区，男声区高 → 冷蓝区） */
  hue: number;
  /** 花色饱和度 0.45–0.85（音区越「坚定」越饱和） */
  saturation: number;
  /** 茎高系数 0.3–1（MPT 15s+ = 1；无音频/非长音 = 0.55 固定） */
  stem: number;
  /** 花心光晕强度 0–1（CPPS 越高越亮；无音频 = 0.3） */
  glow: number;
  /** 花心半径系数 0.7–1.15（能量均值映射） */
  core: number;
  /** 生成依据（详情页展示「哪瓣是什么」用） */
  basis: {
    petalsFrom: 'spec' | 'bands';
    stemFrom: 'mpt' | 'fixed';
    glowFrom: 'cpps' | 'fixed';
    /** 参与映射的关键数字（详情页标注用，已格式化） */
    facts: string[];
  };
}

/** 均值（跳过 null）；空数组返回 null */
function mean(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null && isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** 线性映射并夹紧 */
function lerpClamp(v: number, inLo: number, inHi: number, outLo: number, outHi: number): number {
  const t = Math.max(0, Math.min(1, (v - inLo) / (inHi - inLo)));
  return outLo + (outHi - outLo) * t;
}

/**
 * 谐波能量分布熵（0–1 归一化）：从记录的语谱频带取各频带能量占比，
 * Shannon 熵除以 log2(bands)。频带能量越「铺开」（谐波丰富）熵越高。
 * 无语谱数据返回 null。
 */
function harmonicEntropy(rec: AnalysisRecord): number | null {
  if (!rec.spec?.data) return null;
  try {
    const raw = atob(rec.spec.data);
    const bands = rec.spec.bands;
    const rows = Math.floor(raw.length / bands);
    if (rows === 0) return null;
    // 每频带总能量（量化值平方和），只统计前 60% 的行（掐掉尾部静音）
    const energy = new Float64Array(bands);
    const useRows = Math.max(1, Math.floor(rows * 0.6));
    for (let r = 0; r < useRows; r++) {
      for (let b = 0; b < bands; b++) {
        const v = raw.charCodeAt(r * bands + b);
        if (v > 0) energy[b] += v * v;
      }
    }
    const total = energy.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let entropy = 0;
    for (let b = 0; b < bands; b++) {
      if (energy[b] <= 0) continue;
      const p = energy[b] / total;
      entropy -= p * Math.log2(p);
    }
    return entropy / Math.log2(bands);
  } catch {
    return null;
  }
}

/** 主入口：记录 → 花 */
export function flowerOf(rec: AnalysisRecord): Flower {
  const s = rec.stats;
  const basis: Flower['basis'] = { petalsFrom: 'bands', stemFrom: 'fixed', glowFrom: 'fixed', facts: [] };

  /* 花瓣数：语谱熵（5–13 瓣）；无语谱退化为音区多样性（三区占比的熵） */
  const entropy = harmonicEntropy(rec);
  let petals: number;
  if (entropy != null) {
    petals = Math.round(lerpClamp(entropy, 0.55, 0.95, 5, 13));
    basis.petalsFrom = 'spec';
    basis.facts.push(`谐波熵 ${(entropy * 100).toFixed(0)}%`);
  } else {
    const shares = [s.malePct, s.transitionPct, s.femalePct].filter((v) => v > 0);
    const total = shares.reduce((a, b) => a + b, 0);
    let h = 0;
    for (const v of shares) {
      const p = v / (total || 1);
      h -= p > 0 ? p * Math.log2(p) : 0;
    }
    petals = Math.round(lerpClamp(h / Math.log2(3), 0.3, 1, 5, 11));
    basis.facts.push(`音区多样性 ${(s.malePct + s.transitionPct + s.femalePct) > 0 ? ((h / Math.log2(3)) * 100).toFixed(0) + '%' : '—'}`);
  }

  /* 花瓣形状：F1（开口）与 F2（舌位）→ 长度 / 宽度 / 前倾 */
  const f1 = s.avgF1;
  const f2 = s.avgF2;
  let petalLength = 0.78;
  let petalWidth = 0.75;
  let petalTiltDeg = 0;
  if (f1 != null && f2 != null) {
    // F1 低（开口收小）→ 瓣窄；F2 高（舌位靠前）→ 瓣长前倾。
    // F1 750 / F2 2200 为「女性化参考位」附近 → 长而窄、前倾
    petalLength = lerpClamp(f2, 1400, 2600, 0.6, 1);
    petalWidth = lerpClamp(f1, 550, 1000, 0.5, 1);
    petalTiltDeg = lerpClamp(f2 - f1, 600, 1800, 12, -12);
    basis.facts.push(`F1 ${Math.round(f1)} · F2 ${Math.round(f2)} Hz`);
  } else {
    basis.facts.push('无共振峰（瓣形取中性）');
  }

  /* 色相：女声区占比 → 暖粉（hue 340），男声区占比 → 冷蓝（hue 215）；
     过渡区越多元饱和度越低（混沌期用灰调表达） */
  const voicedTotal = Math.max(1, s.malePct + s.femalePct + s.transitionPct);
  const femaleW = s.femalePct / voicedTotal;
  const maleW = s.malePct / voicedTotal;
  const hue = lerpClamp(femaleW / Math.max(0.01, femaleW + maleW), 0, 1, 215, 340);
  const saturation = lerpClamp(1 - s.transitionPct / voicedTotal, 0, 1, 0.45, 0.85);
  basis.facts.push(`音区 ${s.malePct}/${s.transitionPct}/${s.femalePct}%`);

  /* 茎：长音记录用 MPT（15s+ = 满高）；其他模式固定 0.55 */
  let stem = 0.55;
  if (rec.mode === 'sustained') {
    const { mptSec } = computeSustainedMetrics(rec);
    if (mptSec > 0) {
      stem = lerpClamp(mptSec, 6, 18, 0.3, 1);
      basis.stemFrom = 'mpt';
      basis.facts.push(`MPT ${mptSec.toFixed(1)}s`);
    }
  }

  /* 花心光晕：CPPS（10–20dB 常见区间映射） */
  const glow = s.cppsDb != null
    ? lerpClamp(s.cppsDb, 8, 20, 0.15, 1)
    : 0.3;
  if (s.cppsDb != null) {
    basis.glowFrom = 'cpps';
    basis.facts.push(`CPPS ${s.cppsDb.toFixed(1)}dB`);
  }

  /* 花心：响度均值（-35dB = 正常说话）→ 半径 */
  const core = lerpClamp(s.avgDb, -45, -18, 0.7, 1.15);

  return { petals, petalLength, petalWidth, petalTiltDeg, hue, saturation, stem, glow, core, basis };
}

/** 批量：多条记录 → 花（保持输入顺序） */
export function flowersOf(records: AnalysisRecord[]): { record: AnalysisRecord; flower: Flower }[] {
  return records.map((record) => ({ record, flower: flowerOf(record) }));
}

/** 花园内单花的稳定色相微调：同音区的花不至于完全同色（记录 id 派生 ±8°） */
export function hueJitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 17) - 8;
}

/** 供详情页显示的映射依据汇总（一行一条） */
export function flowerFacts(rec: AnalysisRecord): string[] {
  return flowerOf(rec).basis.facts;
}

// 供测试使用的导出（与 flowerOf 同口径的中间量）
export const _internal = { harmonicEntropy, mean };
