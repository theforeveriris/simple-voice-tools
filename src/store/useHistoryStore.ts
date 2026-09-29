/**
 * 历史记录状态管理
 * 所有测试分析记录持久化在 localStorage，按时间倒序展示。
 * 写入时做容量保护：超出配额时自动丢弃最旧的记录。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AnalysisRecord } from '@/types';
import { MAX_HISTORY } from '@/constants';

/** localStorage 软上限（约 3.5MB，留出安全余量） */
const QUOTA_SOFT_LIMIT = 3_500_000;

/** 容量保护：超限时从最旧开始丢弃 */
function trimToQuota(records: AnalysisRecord[]): AnalysisRecord[] {
  let arr = records;
  while (arr.length > 1 && JSON.stringify(arr).length > QUOTA_SOFT_LIMIT) {
    arr = arr.slice(1);
  }
  return arr.slice(0, MAX_HISTORY);
}

interface HistoryState {
  records: AnalysisRecord[];
  /** 新增一条记录（最新在数组头部） */
  addRecord: (record: AnalysisRecord) => void;
  /** 删除一条记录 */
  removeRecord: (id: string) => void;
  /** 清空全部 */
  clearAll: () => void;
  /** 批量导入（按 id 去重合并），返回实际导入条数 */
  importRecords: (incoming: AnalysisRecord[]) => number;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      records: [],

      addRecord: (record) =>
        set((state) => ({
          records: trimToQuota([record, ...state.records.filter((r) => r.id !== record.id)]),
        })),

      removeRecord: (id) =>
        set((state) => ({ records: state.records.filter((r) => r.id !== id) })),

      clearAll: () => set({ records: [] }),

      importRecords: (incoming) => {
        const existing = new Map(get().records.map((r) => [r.id, r]));
        let added = 0;
        for (const rec of incoming) {
          if (!rec || typeof rec !== 'object' || !rec.id || !rec.series || !rec.stats) continue;
          if (!existing.has(rec.id)) {
            existing.set(rec.id, rec);
            added++;
          }
        }
        const merged = [...existing.values()].sort((a, b) => b.createdAt - a.createdAt);
        set({ records: trimToQuota(merged) });
        return added;
      },
    }),
    {
      name: 'svt:history:v1',
    },
  ),
);
