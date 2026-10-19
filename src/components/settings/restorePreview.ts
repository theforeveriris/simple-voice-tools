/**
 * 恢复预览的计算（纯函数，与弹窗组件分开：便于单测、也让组件文件只导出组件）
 * importRecords 是只新增不覆盖的合并语义，预览如实告知，
 * 防止用户误以为旧备份会「还原并覆盖」当前数据。
 */

import type { AnalysisRecord } from '@/types';

export interface RestorePreview {
  /** 解析出的全部记录（已过滤非法行） */
  incoming: AnalysisRecord[];
  /** 本机已存在的同 id 记录数（合并时将跳过） */
  duplicates: number;
  /** 将新增的条数 */
  added: number;
  /** 最早 → 最晚（epoch ms）；没有可用时间戳时为 null */
  range: [number, number] | null;
}

/** 由待导入记录与本机已有 id 集合计算预览 */
export function buildRestorePreview(incoming: AnalysisRecord[], existingIds: Set<string>): RestorePreview {
  const valid = incoming.filter((r) => r && typeof r === 'object' && r.id && r.series && r.stats);
  let duplicates = 0;
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const r of valid) {
    if (existingIds.has(r.id)) duplicates++;
    if (typeof r.createdAt === 'number' && isFinite(r.createdAt)) {
      if (r.createdAt < minTs) minTs = r.createdAt;
      if (r.createdAt > maxTs) maxTs = r.createdAt;
    }
  }
  return {
    incoming: valid,
    duplicates,
    added: valid.length - duplicates,
    // 全部记录都缺合法 createdAt 时 minTs/maxTs 仍是 ±Infinity：
    // 用 Infinity 渲染日期会得到 NaN/NaN/NaN，这里直接判为「无时间范围」
    range: minTs <= maxTs ? [minTs, maxTs] : null,
  };
}
