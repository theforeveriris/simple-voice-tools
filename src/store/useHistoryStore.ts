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
  toast.warning('浏览器本地存储不可用，本次数据仅保存在内存中');
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
}

function dedupeSorted(records: AnalysisRecord[]): AnalysisRecord[] {
  const map = new Map(records.map((r) => [r.id, r]));
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_HISTORY);
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  records: [],
  ready: false,

  hydrate: async () => {
    let loaded: AnalysisRecord[] = [];
    try {
      loaded = await idbGetAllRecords<AnalysisRecord>();
    } catch (err) {
      console.error('IndexedDB 读取失败:', err);
      set({ ready: true });
      return;
    }

    // 旧版 localStorage 迁移：一次性导入并移除旧键
    if (loaded.length === 0 && !localStorage.getItem(MIGRATED_KEY)) {
      try {
        const raw = localStorage.getItem(LEGACY_KEY);
        const legacy = raw ? (JSON.parse(raw) as { state?: { records?: AnalysisRecord[] } }) : null;
        const legacyRecords = legacy?.state?.records;
        if (Array.isArray(legacyRecords) && legacyRecords.length > 0) {
          loaded = legacyRecords;
          await idbPutRecords(legacyRecords);
        }
      } catch (err) {
        console.error('旧数据迁移失败:', err);
      }
      localStorage.setItem(MIGRATED_KEY, '1');
      localStorage.removeItem(LEGACY_KEY);
    }

    // 与内存中已有记录合并（水合前可能有新写入，如 ?demo=1 的示例数据）
    set((state) => ({ records: dedupeSorted([...loaded, ...state.records]), ready: true }));
  },

  addRecord: (record, audioBlob) => {
    set((state) => ({ records: dedupeSorted([record, ...state.records]) }));
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
    set({ records: [] });
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
      set({ records: merged });
      persist(() => idbPutRecords(added));
    }
    return added.length;
  },

  getAudio: (id) =>
    idbGetAudio(id).catch((err) => {
      console.error('音频读取失败:', err);
      return null;
    }),
}));
