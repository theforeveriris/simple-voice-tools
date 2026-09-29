/**
 * 应用主状态管理
 * 页面导航、录音状态、当前分析数据、应用设置（持久化）
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import type { AnalysisRecord, AppSettings, ViewType } from '@/types';
import { DEFAULT_SETTINGS } from '@/constants';
import { recorder } from '@/lib/audio/recorder';
import { useHistoryStore } from './useHistoryStore';

interface AppState {
  /** 当前页面 */
  currentTab: ViewType;
  setTab: (tab: ViewType) => void;

  /** 是否正在录音 */
  isRecording: boolean;
  /** 当前展示的分析记录（录音完成后或从历史打开） */
  currentAnalysis: AnalysisRecord | null;
  setCurrentAnalysis: (record: AnalysisRecord | null) => void;

  /** 应用设置（持久化） */
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;

  /** 开始录音（失败时抛出异常由调用方提示） */
  startRecording: () => Promise<void>;
  /** 停止录音并完成落库 / 跳转 */
  stopRecording: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentTab: 'test',
      setTab: (tab) => set({ currentTab: tab }),

      isRecording: false,

      currentAnalysis: null,
      setCurrentAnalysis: (record) => set({ currentAnalysis: record }),

      settings: DEFAULT_SETTINGS,
      updateSettings: (settings) =>
        set((state) => ({ settings: { ...state.settings, ...settings } })),

      startRecording: async () => {
        if (get().isRecording) return;
        const { settings } = get();
        try {
          await recorder.start({
            deviceId: settings.micDeviceId || undefined,
            maxDurationSec: settings.maxDurationSec || undefined,
            onAutoStop: () => get().stopRecording(),
          });
        } catch (error) {
          console.error('录音启动失败:', error);
          throw error;
        }
        set({ isRecording: true });
      },

      stopRecording: () => {
        if (!get().isRecording) return;
        const record = recorder.stop();
        set({ isRecording: false });
        if (!record) {
          toast.error('录音时间太短（至少 1 秒），未保存');
          return;
        }
        useHistoryStore.getState().addRecord(record);
        set({ currentAnalysis: record });
        if (get().settings.autoEnterAnalysis) {
          set({ currentTab: 'analysis' });
        }
        toast.success('测试完成，已生成分析报告');
      },
    }),
    {
      name: 'svt:settings:v1',
      partialize: (state) => ({ settings: state.settings }),
      merge: (persisted, current) => {
        const p = (persisted as { settings?: Partial<AppSettings> } | undefined)?.settings ?? {};
        return { ...current, settings: { ...DEFAULT_SETTINGS, ...p } };
      },
    },
  ),
);
