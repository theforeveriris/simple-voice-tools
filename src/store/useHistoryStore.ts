/**
 * 历史记录状态管理
 * 分析记录与录音音频持久化在 IndexedDB（绕开 localStorage 容量限制），
 * 音频以 Blob 单独存放、与分析记录同 id 关联。
 * 首次运行时自动迁移旧版 localStorage（svt:history:v1）中的记录。
 */

import { create } from 'zustand';
import { toast } from 'sonner';
import type { AnalysisRecord } from '@/types';
import { MAX_HISTORY } from '@/constants';
import { t } from '@/i18n';
import {
  idbGetAllRecords, idbPutRecord, idbPutRecords, idbDeleteRecord, idbClearRecords,
  idbGetAudio, idbPutAudio, idbDeleteAudio, idbClearAudio,
} from '@/lib/storage/idb';

/** 旧版 localStorage 键（v0.2 存储，首次运行迁移后移除） */
const LEGACY_KEY = 'svt:history:v1';
const MIGRATED_KEY = 'svt:idb-migrated';

let storageWarned = false;
function warnStorage() {
  if (storageWarned) return;
  storageWarned = true;
  toast.warning(t('toast.storageUnavailable'));
}

/** 将内存记录写库（尽力而为，失败不阻断 UI） */
function persist(fn: () => Promise<void>) {
  fn().catch((err) => {
    console.error('历史记录写入失败:', err);
    warnStorage();
  });
}

interface HistoryState {
  records: AnalysisRecord[];
  /** 全量记录条数（含未进入内存视图的部分），用于列表截断提示 */
  totalCount: number;
  /** IDB 数据是否已加载完成 */
  ready: boolean;
  /** 应用启动时调用：加载数据 + 旧版迁移 */
  hydrate: () => Promise<void>;
  /** 新增一条记录（最新在数组头部），可附带音频 Blob */
  addRecord: (record: AnalysisRecord, audioBlob?: Blob) => void;
  /** 删除一条记录（音频一并删除） */
  removeRecord: (id: string) => void;
  /** 清空全部（含音频） */
  clearAll: () => void;
  /** 更新一条记录（备注编辑等） */
  updateRecord: (record: AnalysisRecord) => void;
  /** 批量导入（按 id 去重合并），返回实际导入条数 */
  importRecords: (incoming: AnalysisRecord[]) => number;
  /** 读取某条记录的音频（无音频返回 null） */
  getAudio: (id: string) => Promise<Blob | null>;
  /**
   * 全量记录（导出/备份专用）。
   * 界面视图有 MAX_HISTORY 截断，IDB 中保留全部记录；
   * 备份必须走本方法，否则超出截断窗口的记录会被静默漏掉。
   * IDB 不可用时降级为内存记录。
   */
  getAllRecords: () => Promise<AnalysisRecord[]>;
}

function dedupeSorted(records: AnalysisRecord[]): AnalysisRecord[] {
  const map = new Map(records.map((r) => [r.id, r]));
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_HISTORY);
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  records: [],
  totalCount: 0,
  ready: false,

  hydrate: async () => {
    let loaded: AnalysisRecord[] = [];
    try {
      loaded = await idbGetAllRecords<AnalysisRecord>();
    } catch (err) {
      console.error('IndexedDB 读取失败:', err);
      set({ ready: true, totalCount: get().records.length });
      return;
    }

    // 旧版 localStorage 迁移：一次性导入并移除旧键
    // （localStorage 在部分隐私模式下会抛异常，需整体兜底，不能让迁移失败阻断加载）
    try {
      if (loaded.length === 0 && !localStorage.getItem(MIGRATED_KEY)) {
        const raw = localStorage.getItem(LEGACY_KEY);
        const legacy = raw ? (JSON.parse(raw) as { state?: { records?: AnalysisRecord[] } }) : null;
        const legacyRecords = legacy?.state?.records;
        if (Array.isArray(legacyRecords) && legacyRecords.length > 0) {
          loaded = legacyRecords;
          await idbPutRecords(legacyRecords);
        }
      }
      localStorage.setItem(MIGRATED_KEY, '1');
      localStorage.removeItem(LEGACY_KEY);
    } catch (err) {
      console.error('旧数据迁移失败:', err);
    }

    // 与内存中已有记录合并（水合前可能有新写入，如 ?demo=1 的示例数据）
    set((state) => {
      const all = [...new Map([...loaded, ...state.records].map((r) => [r.id, r])).values()]
        .sort((a, b) => b.createdAt - a.createdAt);
      return { records: all.slice(0, MAX_HISTORY), totalCount: all.length, ready: true };
    });
  },

  addRecord: (record, audioBlob) => {
    set((state) => ({
      records: dedupeSorted([record, ...state.records]),
      totalCount: state.totalCount + 1,
    }));
    persist(async () => {
      await idbPutRecord(record);
      if (audioBlob) await idbPutAudio(record.id, audioBlob);
    });
  },

  removeRecord: (id) => {
    set((state) => ({ records: state.records.filter((r) => r.id !== id) }));
    persist(async () => {
      await idbDeleteRecord(id);
      await idbDeleteAudio(id);
    });
  },

  clearAll: () => {
    // totalCount 同步归零，否则列表清空后仍显示「已截断，共 N 条」提示
    set({ records: [], totalCount: 0 });
    persist(async () => {
      await idbClearRecords();
      await idbClearAudio();
    });
  },

  updateRecord: (record) => {
    set((state) => ({
      records: state.records.map((r) => (r.id === record.id ? record : r)),
    }));
    persist(() => idbPutRecord(record));
  },

  importRecords: (incoming) => {
    const existing = new Map(get().records.map((r) => [r.id, r]));
    const added: AnalysisRecord[] = [];
    for (const rec of incoming) {
      if (!rec || typeof rec !== 'object' || !rec.id || !rec.series || !rec.stats) continue;
      if (!existing.has(rec.id)) {
        existing.set(rec.id, rec);
        added.push(rec);
      }
    }
    if (added.length > 0) {
      const merged = dedupeSorted([...existing.values()]);
      set((state) => ({ records: merged, totalCount: state.totalCount + added.length }));
      persist(() => idbPutRecords(added));
    }
    return added.length;
  },

  getAudio: (id) =>
    idbGetAudio(id).catch((err) => {
      console.error('音频读取失败:', err);
      return null;
    }),

  getAllRecords: async () => {
    try {
      const loaded = await idbGetAllRecords<AnalysisRecord>();
      // 合并内存中尚未落库（或刚落库）的记录，按 id 去重
      const map = new Map(loaded.map((r) => [r.id, r]));
      for (const r of get().records) map.set(r.id, r);
      return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      // IDB 不可用：至少导出内存中的记录
      return get().records;
    }
  },
}));
