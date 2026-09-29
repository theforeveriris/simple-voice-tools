/**
 * 示例录音数据生成器
 * 在没有麦克风的环境下（或首次体验时）生成一段合成的人声风格数据，
 * 用于演示分析页与历史页。统计信息走与真实录音完全相同的 computeStats。
 */

import { computeStats } from './recorder';
import type { AnalysisRecord, RecordSeries } from '@/types';

/** 生成一段约 14 秒的示例记录（30Hz 采样） */
export function createDemoRecord(): AnalysisRecord {
  const hz = 30;
  const dur = 14;
  const n = hz * dur;
  const series: RecordSeries = { t: [], f0: [], rmsDb: [], f1: [], f2: [] };

  let voiced = true;
  let segEnd = 1.2;
  let rand = 1;
  const rnd = () => {
    // 确定性伪随机（mulberry32），保证示例稳定
    rand |= 0; rand = (rand + 0x6d2b79f5) | 0;
    let x = Math.imul(rand ^ (rand >>> 15), 1 | rand);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < n; i++) {
    const t = i / hz;
    if (t >= segEnd) {
      voiced = !voiced;
      segEnd = t + (voiced ? 1.5 + rnd() * 2.2 : 0.4 + rnd() * 0.7);
    }

    series.t.push(Math.round(t * 1000) / 1000);

    if (voiced) {
      const base = 128 + 34 * Math.sin(t / 3.1) + 10 * Math.sin(t / 1.3);
      const vibrato = 4.5 * Math.sin(2 * Math.PI * 5.2 * t);
      const drift = 6 * Math.sin(t / 0.9 + 2);
      series.f0.push(Math.round((base + vibrato + drift + rnd() * 3) * 10) / 10);
      series.rmsDb.push(Math.round((-26 + 6 * Math.sin(t / 2.2) + rnd() * 3) * 10) / 10);
      series.f1.push(Math.round(380 + 190 * Math.sin(t / 2.4) + rnd() * 40));
      series.f2.push(Math.round(1250 + 480 * Math.sin(t / 3.3 + 1) + rnd() * 90));
    } else {
      series.f0.push(null);
      series.rmsDb.push(Math.round((-62 + rnd() * 6) * 10) / 10);
      series.f1.push(null);
      series.f2.push(null);
    }
  }

  return {
    id: `demo-${Date.now()}`,
    createdAt: Date.now(),
    durationSec: dur,
    sampleHz: hz,
    series,
    stats: computeStats(series, hz),
  };
}
