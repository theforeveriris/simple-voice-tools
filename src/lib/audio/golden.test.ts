/**
 * 黄金样本回归集（DSP 回归锚点）
 *
 * 思路：用「源-滤波」模型合成物理上真实的元音——脉冲谐波源（-6 dB/八度）
 * 经 Klatt 式二极点共振器级联滤波——基频与共振峰的真值由构造给出，任何
 * 算法回归（YIN 追踪、LPC 求根、统计聚合）都会让断言立刻失败。
 * 全部确定性（无随机数）：频率调制用正弦颤音代替抖动，保证逐样本可复现。
 *
 * 与「真实语音 + Praat 交叉验证」的关系：本文件是真值锚点层；若日后引入
 * 真实 CC0 语音 fixture（配 Praat 实测期望值），按同样断言口径加 fixture 即可，
 * 与本文件互不干扰（合成信号验「对不对」，真实语音验「像不像」）。
 */

import { describe, it, expect } from 'vitest';
import { analyzePcmFrames } from './analysisPipeline';
import { computeStats, toRecordSeries } from './recorder';
import { PIPELINE_HZ } from './analysisPipeline';
import type { AnalysisRecord } from '@/types';

/* ------------------------------ 源滤波合成 ------------------------------ */

/** Klatt 式二极点共振器：中心频率 f、带宽 bw，逐样本滤波（级联用） */
function resonate(x: Float32Array, f: number, bw: number): Float32Array {
  const r = Math.exp((-Math.PI * bw) / PIPELINE_HZ);
  const b = 2 * r * Math.cos((2 * Math.PI * f) / PIPELINE_HZ);
  const c = -r * r;
  const a = 1 - b - c;
  const out = new Float32Array(x.length);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = a * x[i] + b * y1 + c * y2;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

export interface SynthVowelOptions {
  /** 基频轨迹（Hz，t 秒） */
  f0At: (t: number) => number;
  /** 共振峰 [频率, 带宽] 列表（按 F1, F2, F3 … 顺序级联） */
  formants: [number, number][];
  durSec: number;
  /** 谐波数（-6dB/八度：幅值 1/k） */
  harmonics?: number;
  /** 颤音深度（相对 F0 的比例，5 Hz 调制） */
  vibratoPct?: number;
  /** 输出峰值（防削波） */
  amp?: number;
}

/** 合成一个元音段：谐波脉冲源 → 共振器级联 → 归一化到目标峰值 */
function synthVowel(opts: SynthVowelOptions): Float32Array {
  const { f0At, formants, durSec, harmonics = 40, vibratoPct = 0, amp = 0.5 } = opts;
  const n = Math.round(durSec * PIPELINE_HZ);
  // 源：相位积分的谐波和（时变 F0 下相位连续，无边界咔哒）
  const src = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / PIPELINE_HZ;
    const vib = vibratoPct * Math.sin(2 * Math.PI * 5 * t);
    phase += (2 * Math.PI * f0At(t) * (1 + vib)) / PIPELINE_HZ;
    let s = 0;
    for (let k = 1; k <= harmonics; k++) {
      const hz = (f0At(t) * (1 + vib) * k);
      if (hz > PIPELINE_HZ / 2) break;
      s += Math.sin(k * phase) / k;
    }
    src[i] = s;
  }
  // 滤波：共振器级联
  let out = src;
  for (const [f, bw] of formants) out = resonate(out, f, bw);
  // 归一化峰值
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? amp / peak : 1;
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

/* ------------------------------ 断言辅助 ------------------------------ */

function median(xs: number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length === 0 ? NaN : v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function makeRecord(series: ReturnType<typeof toRecordSeries>, sampleHz: number): AnalysisRecord {
  return {
    id: 'golden',
    createdAt: 0,
    durationSec: series.t.length > 0 ? series.t[series.t.length - 1] : 0,
    sampleHz,
    series,
    stats: computeStats(series, sampleHz),
  };
}

/* ------------------------------ Fixture A：稳态元音 ------------------------------ */

// /a/ 型共振峰（男声偏低区）：F1 750 / F2 1200，且全部对齐 f0=150 的谐波网格
// （750=5×150、1200=8×150、2550=17×150）——LPC 极点会被最强谐波吸附，
// 共振峰必须落在谐波上，真值才是可恢复的
const VOWEL_A: [number, number][] = [
  [750, 90],
  [1200, 110],
  [2550, 170],
];

describe('golden fixture A — 稳态 /a/（F0 150 Hz，颤音 0.5%）', () => {
  const pcm = synthVowel({
    f0At: () => 150,
    formants: VOWEL_A,
    durSec: 2,
    vibratoPct: 0.005,
  });

  it('YIN 稳定追踪 150 Hz：中位误差 ≤ 1 Hz，有声率 ≥ 90%', async () => {
    const { t, f0, db } = await analyzePcmFrames(pcm);
    const voiced = f0.filter((v) => v != null && isFinite(v) && v > 0) as number[];
    expect(voiced.length / f0.length).toBeGreaterThanOrEqual(0.9);
    const errs = voiced.map((v) => Math.abs(v - 150));
    expect(median(errs)).toBeLessThanOrEqual(1);
    // 电平在合理区间（-30 ± 12 dB，未削波也未哑火）
    const dbVoiced = db.filter((v) => isFinite(v));
    expect(median(dbVoiced)).toBeGreaterThan(-42);
    expect(median(dbVoiced)).toBeLessThan(-12);
    expect(t.length).toBeGreaterThan(50);
  });

  it('统计聚合与音域：P10–P90 收敛在 150 ± 8 Hz', async () => {
    const { t, f0, db, f1, f2 } = await analyzePcmFrames(pcm);
    const sampleHz = t.length > 1 ? 1 / (t[1] - t[0]) : 30;
    const rec = makeRecord(toRecordSeries(t, f0, db, f1, f2, 1), sampleHz);
    expect(rec.stats.avgF0).toBeGreaterThan(142);
    expect(rec.stats.avgF0).toBeLessThan(158);
    expect(rec.stats.p10F0).toBeGreaterThan(140);
    expect(rec.stats.p90F0).toBeLessThan(160);
  });

  it('LPC 共振峰落在构造真值邻域：F1 750±35，F2 1200±120', async () => {
    const { f1, f2 } = await analyzePcmFrames(pcm);
    const f1s = (f1.filter((v) => v != null) as number[]);
    const f2s = (f2.filter((v) => v != null) as number[]);
    expect(f1s.length).toBeGreaterThan(10);
    expect(f2s.length).toBeGreaterThan(10);
    expect(median(f1s)).toBeGreaterThan(715);
    expect(median(f1s)).toBeLessThan(785);
    expect(median(f2s)).toBeGreaterThan(1080);
    expect(median(f2s)).toBeLessThan(1320);
  });
});

/* ------------------------------ Fixture B：滑音 F0 ------------------------------ */

describe('golden fixture B — 指数滑音 110 → 220 Hz', () => {
  const DUR = 2;
  const pcm = synthVowel({
    // 2 秒内从 110 指数滑到 220（每秒一个八度的一半）
    f0At: (t) => 110 * Math.pow(2, t / DUR),
    formants: VOWEL_A,
    durSec: DUR,
  });

  it('YIN 全程追踪滑音：≥ 90% 有声帧误差 ≤ 6 Hz，中位误差 ≤ 3 Hz', async () => {
    const { t, f0 } = await analyzePcmFrames(pcm);
    let compared = 0;
    let within6 = 0;
    const errs: number[] = [];
    for (let i = 0; i < t.length; i++) {
      const est = f0[i];
      if (est == null || !isFinite(est) || est <= 0) continue;
      // 跳过首尾各 3 帧（帧窗跨界处的边缘效应）
      if (t[i] < 0.1 || t[i] > DUR - 0.1) continue;
      const truth = 110 * Math.pow(2, t[i] / DUR);
      const err = Math.abs(est - truth);
      errs.push(err);
      compared++;
      if (err <= 6) within6++;
    }
    expect(compared).toBeGreaterThan(30);
    expect(within6 / compared).toBeGreaterThanOrEqual(0.9);
    expect(median(errs)).toBeLessThanOrEqual(3);
  });

  it('无倍频/半频灾难：检出值不系统性偏到 2× 或 0.5×', async () => {
    const { t, f0 } = await analyzePcmFrames(pcm);
    let oct2 = 0;
    let octHalf = 0;
    let total = 0;
    for (let i = 0; i < t.length; i++) {
      const est = f0[i];
      if (est == null || !isFinite(est) || est <= 0) continue;
      if (t[i] < 0.1 || t[i] > DUR - 0.1) continue;
      const truth = 110 * Math.pow(2, t[i] / DUR);
      total++;
      if (est > truth * 1.7 && est < truth * 2.3) oct2++;
      if (est > truth * 0.4 && est < truth * 0.6) octHalf++;
    }
    expect(total).toBeGreaterThan(30);
    expect(oct2 / total).toBeLessThan(0.02);
    expect(octHalf / total).toBeLessThan(0.02);
  });
});
