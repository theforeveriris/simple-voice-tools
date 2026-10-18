/**
 * 音高检测算法基准（本地基准套件，不进 CI）
 *
 * 用法：npx vitest run src/lib/audio/pitchBenchmark.test.ts
 *
 * 以 golden.test.ts 同款的源滤波合成语料（谐波声门源 + Klatt 共振器级联，
 * 覆盖音区与噪声/抖动梯度）对 YIN / pYIN / MPM 三算法测
 * raw pitch accuracy（RPA：误差 ≤ 50 cents 的帧占比）与中位绝对误差。
 * 结果打印为 console 表格，供 documentation/ALGORITHM-*.md 引用；
 * 断言仅作回归底线（干净语料 RPA ≥ 95%），防止算法改动引入大幅退化。
 * 公开语料（PTDB-TUG 等）因许可与体积不进仓库——需要更深对标时在本地
 * 下载后扩展 CASES 即可。
 */

import { describe, it, expect } from 'vitest';
import { detectPitchYin } from './pitch';
import { detectPitch } from './pitchAlt';
import { makeWhiteNoise } from './testHelpers';
import { PIPELINE_HZ } from './analysisPipeline';

/* ---------------- 语料合成（与 golden.test.ts 同款源滤波） ---------------- */

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

/** 谐波声门源：相位积分的谐波和（-6dB/八度），时变 F0 下相位连续 */
function glottalSource(f0: number, durSec: number, vibratoPct: number): Float32Array {
  const n = Math.round(durSec * PIPELINE_HZ);
  const src = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / PIPELINE_HZ;
    const vib = vibratoPct * Math.sin(2 * Math.PI * 5 * t);
    phase += (2 * Math.PI * f0 * (1 + vib)) / PIPELINE_HZ;
    let s = 0;
    for (let k = 1; k <= 40; k++) {
      if (f0 * k > PIPELINE_HZ / 2) break;
      s += Math.sin(k * phase) / k;
    }
    src[i] = s;
  }
  return src;
}

/** 合成一个元音段：声门源 → 共振器级联 → 归一化峰值 0.5 */
function synthVowel(f0: number, formants: [number, number][], durSec: number, vibratoPct: number): Float32Array {
  let out = glottalSource(f0, durSec, vibratoPct);
  for (const [f, bw] of formants) out = resonate(out, f, bw);
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? 0.5 / peak : 1;
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

/** /a/ 型共振峰（跟随基频对齐谐波网格，同 golden fixture A 的口径） */
function vowelA(f0: number): [number, number][] {
  // 取 f0 的 5 / 8 / 17 倍作为 F1/F2/F3（若超 4kHz 折半带宽放宽容差）
  return [
    [Math.round((f0 * 5) / 25) * 25, 90],
    [Math.round((f0 * 8) / 25) * 25, 110],
    [Math.round((f0 * 17) / 25) * 25, 170],
  ];
}

interface BenchCase {
  name: string;
  f0: number;
  snrDb: number;
  vibratoPct: number;
}

/** 覆盖低音男声 → 女声高音 × 干净/加噪 × 稳定/微抖 的 9 个语料点 */
const CASES: BenchCase[] = [
  { name: 'C3 clean', f0: 131, snrDb: 40, vibratoPct: 0.005 },
  { name: 'C3 noisy', f0: 131, snrDb: 10, vibratoPct: 0.005 },
  { name: 'G3 clean', f0: 196, snrDb: 40, vibratoPct: 0.005 },
  { name: 'G3 noisy', f0: 196, snrDb: 10, vibratoPct: 0.005 },
  { name: 'C4 clean', f0: 262, snrDb: 40, vibratoPct: 0.005 },
  { name: 'C4 noisy', f0: 262, snrDb: 10, vibratoPct: 0.01 },
  { name: 'A4 clean', f0: 440, snrDb: 40, vibratoPct: 0.005 },
  { name: 'A4 noisy', f0: 440, snrDb: 10, vibratoPct: 0.01 },
  { name: 'C5 jitter', f0: 523, snrDb: 20, vibratoPct: 0.02 },
];

function makeCase(c: BenchCase): Float32Array {
  const sig = synthVowel(c.f0, vowelA(c.f0), 1.2, c.vibratoPct);
  if (c.snrDb >= 40) return sig;
  const noiseRms = 0.5 * Math.pow(10, -c.snrDb / 20);
  const noise = makeWhiteNoise(sig.length, 42, noiseRms);
  for (let i = 0; i < sig.length; i++) sig[i] += noise[i];
  return sig;
}

/* ---------------- 评估（帧级，与离线管线同窗同帧率） ---------------- */

interface EvalResult {
  rpa: number;
  median: number;
}

function evaluate(algo: 'yin' | 'pyin' | 'mpm', sig: Float32Array, truthF0: number): EvalResult {
  const win = 2048;
  const hop = Math.round(PIPELINE_HZ / 30);
  const cents: number[] = [];
  for (let start = 0; start + win <= sig.length; start += hop) {
    const frame = sig.subarray(start, start + win);
    const p = algo === 'yin'
      ? detectPitchYin(frame, PIPELINE_HZ, 60, 600)
      : detectPitch(frame, PIPELINE_HZ, 60, 600, algo);
    if (!p) continue;
    cents.push(1200 * Math.log2(p.freq / truthF0));
  }
  if (cents.length === 0) return { rpa: 0, median: 6000 };
  const abs = cents.map(Math.abs).sort((a, b) => a - b);
  const rpa = cents.filter((c) => Math.abs(c) <= 50).length / cents.length;
  return { rpa, median: abs[Math.floor(abs.length / 2)] };
}

function fmt(r: EvalResult): string {
  return `RPA ${(r.rpa * 100).toFixed(1).padStart(5)}%  median ${r.median.toFixed(1).padStart(7)}¢`;
}

describe('音高算法基准（本地，结果打印供文档引用）', () => {
  it('三算法 × 9 语料：RPA / 中位绝对误差', () => {
    const results = CASES.map((c) => {
      const sig = makeCase(c);
      return {
        name: c.name,
        yin: evaluate('yin', sig, c.f0),
        pyin: evaluate('pyin', sig, c.f0),
        mpm: evaluate('mpm', sig, c.f0),
      };
    });

    console.log('\n算法基准（源滤波合成语料，32 kHz，2048 点窗，30 fps）');
    console.log('case'.padEnd(12), 'YIN'.padEnd(28), 'pYIN'.padEnd(28), 'MPM');
    for (const r of results) {
      console.log(
        r.name.padEnd(12),
        fmt(r.yin).padEnd(28),
        fmt(r.pyin).padEnd(28),
        fmt(r.mpm),
      );
    }
    const agg = (key: 'yin' | 'pyin' | 'mpm') => {
      const rpa = results.reduce((a, r) => a + r[key].rpa, 0) / results.length;
      const med = results.reduce((a, r) => a + r[key].median, 0) / results.length;
      return `RPA ${(rpa * 100).toFixed(1)}%  median ${med.toFixed(1)}¢`;
    };
    console.log('MEAN'.padEnd(12), agg('yin').padEnd(28), agg('pyin').padEnd(28), agg('mpm'));

    // 回归底线：干净语料（SNR 40dB、微颤）三算法 RPA ≥ 95%；算法退化时在此失败
    for (const r of results) {
      if (!r.name.includes('noisy') && !r.name.includes('jitter')) {
        expect(r.yin.rpa).toBeGreaterThanOrEqual(0.95);
        expect(r.pyin.rpa).toBeGreaterThanOrEqual(0.95);
        expect(r.mpm.rpa).toBeGreaterThanOrEqual(0.95);
      }
    }
  }, 60_000);
});
