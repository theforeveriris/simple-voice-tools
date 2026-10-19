/**
 * 环境元数据洞察（自动标注的消费端）
 * 扫描历史记录的 env 字段，做三组自动切片对比：
 *   - 安静 vs 吵闹（noiseFloorDb 中位数二分）
 *   - 晨间 vs 晚间（hourOfDay：< 12 晨 / ≥ 12 晚——简化二分，避免多桶样本稀释）
 *   - 麦克风切换（micLabel 变化检测）
 * 输出有统计显著性差（简单阈值：两侧各 ≥3 条且均值差超最小可感量）的提示文案 key，
 * 无数据/无差异时返回空——不打扰。纯函数，不落库不联网。
 */

import type { AnalysisRecord, RecordEnv } from '@/types';

export interface EnvInsight {
  /** 提示 i18n key（envInsight.*） */
  key: 'envInsight.quieterBetter' | 'envInsight.noisierBetter' | 'envInsight.morningHigher'
    | 'envInsight.eveningHigher' | 'envInsight.micChanged';
  /** 插值参数（百分差、麦克风名等） */
  params: Record<string, string | number>;
}

/** 两桶各至少 3 条才比较 */
const MIN_BUCKET = 3;
/** F0 均值差超过该 Hz 才值得提示 */
const F0_DELTA_MIN = 4;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function envOf(r: AnalysisRecord): RecordEnv | undefined {
  return r.env;
}

/**
 * 扫描记录生成环境洞察（最多返回 2 条最显著的，避免刷屏）。
 * 只看最近 60 条——太老的环境数据意义有限。
 */
export function envInsights(records: AnalysisRecord[]): EnvInsight[] {
  const recent = records
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 60)
    .filter((r) => r.env != null);
  if (recent.length < MIN_BUCKET * 2) return [];

  const out: EnvInsight[] = [];

  // ---- 底噪二分：安静组 vs 吵闹组 ----
  const floors = recent.map((r) => envOf(r)?.noiseFloorDb).filter((x): x is number => x != null);
  if (floors.length >= MIN_BUCKET * 2) {
    const mid = median(floors);
    // 只比较确实记录了底噪的记录：缺字段的旧记录不能默认算进「安静」组，
    // 否则会把两组都掺进无数据记录，结论失去意义
    const withFloor = recent.filter((r) => envOf(r)?.noiseFloorDb != null);
    const quiet = withFloor.filter((r) => (envOf(r)!.noiseFloorDb as number) <= mid);
    const noisy = withFloor.filter((r) => (envOf(r)!.noiseFloorDb as number) > mid);
    const quietF0 = quiet.map((r) => r.stats.avgF0);
    const noisyF0 = noisy.map((r) => r.stats.avgF0);
    if (quietF0.length >= MIN_BUCKET && noisyF0.length >= MIN_BUCKET) {
      const q = quietF0.reduce((a, b) => a + b, 0) / quietF0.length;
      const n = noisyF0.reduce((a, b) => a + b, 0) / noisyF0.length;
      const delta = Math.round(q - n);
      if (Math.abs(delta) >= F0_DELTA_MIN) {
        out.push(delta > 0
          ? { key: 'envInsight.quieterBetter', params: { delta: Math.abs(delta) } }
          : { key: 'envInsight.noisierBetter', params: { delta: Math.abs(delta) } });
      }
    }
  }

  // ---- 晨昏二分 ----
  const withHour = recent.filter((r) => envOf(r)?.hourOfDay != null);
  const morning = withHour.filter((r) => envOf(r)!.hourOfDay! < 12);
  const evening = withHour.filter((r) => envOf(r)!.hourOfDay! >= 12);
  if (morning.length >= MIN_BUCKET && evening.length >= MIN_BUCKET) {
    const m = morning.map((r) => r.stats.avgF0);
    const e = evening.map((r) => r.stats.avgF0);
    const mAvg = m.reduce((a, b) => a + b, 0) / m.length;
    const eAvg = e.reduce((a, b) => a + b, 0) / e.length;
    const delta = Math.round(mAvg - eAvg);
    if (Math.abs(delta) >= F0_DELTA_MIN) {
      out.push(delta > 0
        ? { key: 'envInsight.morningHigher', params: { delta } }
        : { key: 'envInsight.eveningHigher', params: { delta: Math.abs(delta) } });
    }
  }

  // ---- 麦克风变化（最近 60 条记录内出现过 ≥2 个不同标签；窗口见函数头部）----
  const labels = new Set(recent.map((r) => envOf(r)?.micLabel).filter((x): x is string => !!x));
  if (labels.size >= 2) {
    out.push({ key: 'envInsight.micChanged', params: { n: labels.size } });
  }

  return out.slice(0, 2);
}
