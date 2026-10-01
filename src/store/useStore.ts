/**
 * 应用主状态管理
 * 页面导航、录音状态、当前分析数据、应用设置（持久化）
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import type { AnalysisRecord, AppSettings, ViewType } from '@/types';
import { DEFAULT_SETTINGS, MODE_META, setBandBounds } from '@/constants';
import { recorder } from '@/lib/audio/recorder';
import { maybeAutoBackup } from '@/lib/backup/local';
import { t } from '@/i18n';
import { useHistoryStore } from './useHistoryStore';

interface AppState {
  /** 当前页面 */
  currentTab: ViewType;
  setTab: (tab: ViewType) => void;

  /** 是否正在录音（含权限等待期间） */
  isRecording: boolean;
  /** 当前展示的分析记录（录音完成后或从历史打开） */
  currentAnalysis: AnalysisRecord | null;
  setCurrentAnalysis: (record: AnalysisRecord | null) => void;

  /** 应用设置（持久化） */
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;

  /** 开始录音（失败时抛出异常由调用方提示） */
  startRecording: () => Promise<void>;
  /** 停止录音并完成落库 / 跳转（含音频解码与嗓音质量计算） */
  stopRecording: () => Promise<void>;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentTab: 'test',
      setTab: (tab) => {
        set({ currentTab: tab });
        // 同步 hash（pushState 不触发 hashchange，App 内的 hashchange 监听
        // 只负责浏览器返回/前进键）：页签可深链接，返回键在页签间回退而非退出应用
        const want = `#/${tab}`;
        if (typeof window !== 'undefined' && window.location.hash !== want) {
          window.history.pushState(null, '', want);
        }
      },

      isRecording: false,

      currentAnalysis: null,
      setCurrentAnalysis: (record) => set({ currentAnalysis: record }),

      settings: DEFAULT_SETTINGS,
      updateSettings: (settings) =>
        set((state) => ({ settings: { ...state.settings, ...settings } })),

      startRecording: async () => {
        if (get().isRecording) return;
        const { settings } = get();
        const meta = MODE_META[settings.testMode];
        // 提前置位（权限弹窗等待期间也保持录音态）：
        // 自动停止回调触发 stopRecording 时依赖该状态，为 false 会直接 return 漏停；
        // 圆球仅在测试页渲染，离开后录音在后台继续，回来时据此恢复「录音中」状态
        set({ isRecording: true });
        try {
          await recorder.start({
            deviceId: settings.micDeviceId || undefined,
            maxDurationSec: meta.autoStopSec || settings.maxDurationSec || undefined,
            silenceStopSec: meta.silenceStopSec,
            targetRange: settings.targetEnabled
              ? [settings.targetF0Min, settings.targetF0Max]
              : null,
            mode: settings.testMode,
            saveAudio: settings.audioSave,
            onAutoStop: () => void get().stopRecording(),
          });
        } catch (error) {
          console.error('录音启动失败:', error);
          set({ isRecording: false });
          throw error;
        }
      },

      stopRecording: async () => {
        if (!get().isRecording) return;
        set({ isRecording: false });

        // 权限等待期间取消：中止启动流程即可，无记录也不提示
        if (recorder.isStarting()) {
          recorder.cancelStart();
          return;
        }

        const raw = recorder.stop();
        if (!raw) {
          toast.error(t('toast.tooShort'));
          return;
        }
        // 音频解码 + 嗓音质量计算（失败时自动降级为无音频记录）
        const { record, audio } = await recorder.finishRecord(raw);
        useHistoryStore.getState().addRecord(record, audio ?? undefined);
        // 实验性：本地自动备份（选择了文件夹时按天写入，内部自行节流）
        void maybeAutoBackup('record');
        set({ currentAnalysis: record });
        if (get().settings.autoEnterAnalysis) {
          get().setTab('analysis');
        }
        toast.success(t('toast.recordDone'));
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

// 音区边界：设置 → 模块级单例同步（bandOf / 曲线着色 / 音区色带 / 占比统计共用）。
// 初始化一次（persist 从 localStorage 同步恢复后 merge 会触发订阅），
// 之后仅在实际变化时刷新
setBandBounds(useStore.getState().settings.bandBounds);
useStore.subscribe((state, prev) => {
  if (state.settings.bandBounds !== prev.settings.bandBounds) {
    setBandBounds(state.settings.bandBounds);
  }
});
