/**
 * 声之花（Voice Flower）v2：俯视频谱指纹花
 *
 * 构图（设计定稿）：正上方俯视、花瓣从圆心放射、无茎。
 *   每片花瓣 = 一个语谱频带：瓣长 = 该频带能量（归一化），
 *   角度 = 低频在正上方、顺时针从低到高频排一圈（极坐标频谱）。
 *   瓣数 = 频带数（分辨率决定，不再用熵定瓣数）；
 *   谐波熵改由「瓣长差异」体现——频谱越平坦瓣越齐，越尖峰瓣越参差。
 *   花心半径 = F1（开口度）；瓣长基线随 F2 外推（共鸣前移 = 花整体更舒展）；
 *   瓣尖尖锐度 = F2（共鸣靠前 = 瓣尖锐利，靠后 = 圆钝）。
 *   色彩：莫奈主题色系（同花同色系，明度区分频带，瓣尖更深）。
 *   MPT 不入花（俯视无茎），在花园卡片小字与详情中展示。
 *
 * 优雅退化：无语谱数据的记录用「模版韵律瓣」（固定圆花瓣），
 * F1/F2 环照常——花永不失败。
 * 本模块只产出纯参数对象（可单测）；绘制见 FlowerSvg。
 */

import type { AnalysisRecord } from '@/types';
import { luaTakeFlower } from '@/lib/lua/flower';

/** 单片花瓣的绘制参数（角度制，0° = 正上方，顺时针） */
export interface Petal {
  /** 角度（0 = 正上，顺时针） */
  angleDeg: number;
  /** 瓣长系数 0.15–1（1 = 最大外径） */
  length: number;
  /** 明度位 0–1（低频亮 → 高频深，同色系区分） */
  lightness: number;
  /** 该瓣对应频带的中心频率（详情标注用，Hz；模版瓣为 null） */
  bandHz: number | null;
}

/** 一朵花的完整绘制参数 */
export interface Flower {
  petals: Petal[];
  /** 花心半径系数 0.5–1.2（F1 开口度：F1 越小花心越小 = 更女性化的开口） */
  coreF1: number;
  /** 瓣长基线系数 0.6–1（F2 外推：F2 越高基线越长 = 共鸣更靠前） */
  baselineF2: number;
  /** 瓣尖尖锐度 0–1（F2 映射：共鸣靠前 = 瓣尖锐利；靠后 = 圆钝） */
  tipSharpness: number;
  /** 生成依据（详情页展示用，已格式化） */
  basis: {
    petalsFrom: 'spec' | 'template';
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

/** 语谱频带解码 → 每频带能量数组（null = 无数据） */
function bandEnergies(rec: AnalysisRecord): { hz: number[]; energy: number[] } | null {
  if (!rec.spec?.data) return null;
  try {
    const raw = atob(rec.spec.data);
    const bands = rec.spec.bands;
    const rows = Math.floor(raw.length / bands);
    if (rows < 4) return null;
    const energy = new Float64Array(bands);
    const useRows = Math.max(1, Math.floor(rows * 0.6)); // 掐掉尾部静音
    for (let r = 0; r < useRows; r++) {
      for (let b = 0; b < bands; b++) {
        const v = raw.charCodeAt(r * bands + b);
        if (v > 0) energy[b] += v * v;
      }
    }
    // 频带中心频率：语谱为对数频带，等分 80–8000 Hz（与分析管线语谱范围同数量级）
    const F_LO = 80;
    const F_HI = 8000;
    const hz: number[] = [];
    for (let b = 0; b < bands; b++) {
      const t = (b + 0.5) / bands;
      hz[b] = F_LO * Math.pow(F_HI / F_LO, t);
    }
    const arr = Array.from(energy);
    if (arr.every((v) => v === 0)) return null;
    return { hz, energy: arr };
  } catch {
    return null;
  }
}

/** 模版瓣（无语谱退化）：固定韵律（正弦调制瓣长），圆花感 */
const TEMPLATE_PETALS = 8;

/** 主入口：记录 → 俯视频谱指纹花。
 *  Lua 花朵脚本（脚本中心）启用时优先用其产出（applyLuaFlowers 预注入槽位），
 *  槽位为空时走内置算法 —— 花永不失败。 */
export function flowerOf(rec: AnalysisRecord): Flower {
  const lua = luaTakeFlower(rec.id);
  if (lua) return lua;

  const s = rec.stats;
  const basis: Flower['basis'] = { petalsFrom: 'template', facts: [] };
  const petals: Petal[] = [];

  /* 花瓣：语谱频带（真·频谱指纹）或模版韵律 */
  const bands = bandEnergies(rec);
  if (bands) {
    const maxE = Math.max(...bands.energy, 1);
    basis.petalsFrom = 'spec';
    for (let b = 0; b < bands.energy.length; b++) {
      petals.push({
        angleDeg: (360 / bands.energy.length) * b,
        length: lerpClamp(bands.energy[b] / maxE, 0, 1, 0.18, 1),
        lightness: b / Math.max(1, bands.energy.length - 1),
        bandHz: Math.round(bands.hz[b]),
      });
    }
    basis.facts.push(`频谱指纹 · ${bands.energy.length} 频带`);
    // 熵改为瓣长差异的说明：瓣参差度（1 - 最短/最长）
    const minE = Math.min(...bands.energy.filter((v) => v > 0));
    const maxE2 = Math.max(...bands.energy);
    if (maxE2 > 0 && minE > 0) {
      basis.facts.push(`瓣参差 ${(100 * (1 - minE / maxE2)).toFixed(0)}%（越大谐波越集中）`);
    }
  } else {
    for (let b = 0; b < TEMPLATE_PETALS; b++) {
      // 模板韵律：正弦调制瓣长（0.55–0.8），圆花感
      petals.push({
        angleDeg: (360 / TEMPLATE_PETALS) * b,
        length: 0.55 + 0.25 * (0.5 + 0.5 * Math.sin((b / TEMPLATE_PETALS) * Math.PI * 2)),
        lightness: b / (TEMPLATE_PETALS - 1),
        bandHz: null,
      });
    }
    basis.facts.push('模版瓣（无语谱数据）');
  }

  /* 花心 = F1（开口度）：F1 越小花心越小；瓣长基线 = F2 外推；瓣尖尖锐度 = F2 */
  const f1 = s.avgF1;
  const f2 = s.avgF2;
  const coreF1 = f1 != null ? lerpClamp(f1, 500, 1000, 0.5, 1.2) : 0.8;
  const baselineF2 = f2 != null ? lerpClamp(f2, 1400, 2600, 0.6, 1) : 0.8;
  const tipSharpness = f2 != null ? lerpClamp(f2, 1400, 2600, 0, 1) : 0.5;
  if (f1 != null && f2 != null) {
    basis.facts.push(`花心 = F1 ${Math.round(f1)} Hz · 瓣尖 = F2 ${Math.round(f2)} Hz`);
  } else {
    basis.facts.push('无共振峰（花心/瓣尖取中性）');
  }

  return { petals, coreF1, baselineF2, tipSharpness, basis };
}

/** 花园内单花的稳定微调：记录 id 派生的整体旋转角（±10°），同音区花不完全同姿态 */
export function rotationJitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 21) - 10;
}

/** 供详情页显示的映射依据汇总（一行一条） */
export function flowerFacts(rec: AnalysisRecord): string[] {
  return flowerOf(rec).basis.facts;
}

/** MPT 等「不入花」的数字（花园卡片小字 / 详情展示用） */
export function flowerSideStats(rec: AnalysisRecord): string[] {
  const out: string[] = [`${rec.stats.avgF0.toFixed(0)} Hz`];
  if (rec.mode === 'sustained') {
    const { mptSec } = computeMpt(rec);
    if (mptSec > 0) out.push(`MPT ${mptSec.toFixed(1)}s`);
  }
  const db = mean(rec.series.rmsDb);
  if (db != null) out.push(`${db.toFixed(0)} dB`);
  return out;
}

function computeMpt(rec: AnalysisRecord): { mptSec: number } {
  // 轻量内联（与 sustained.ts 同口径的单段 MPT），避免引入依赖环
  const s = rec.series;
  let i0 = -1;
  let i1 = -1;
  for (let i = 0; i < s.t.length; i++) {
    if (s.f0[i] != null) { if (i0 < 0) i0 = i; i1 = i; }
  }
  return { mptSec: i0 >= 0 ? Math.max(0, s.t[i1] - s.t[i0]) : 0 };
}

export const _internal = { bandEnergies, mean };
