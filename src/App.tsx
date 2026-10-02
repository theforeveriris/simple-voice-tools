/**
 * 应用主组件
 * 页面切换（带过渡动画）+ 底部悬浮导航栏
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { BottomBar } from '@/components/layout/BottomBar';
import { PageErrorBoundary } from '@/components/layout/ErrorBoundary';
import { ShortcutsHelpSheet } from '@/components/layout/ShortcutsHelpSheet';
import { TestPage } from '@/components/pages/TestPage';
import { AnalysisPage } from '@/components/pages/AnalysisPage';
import { HistoryPage } from '@/components/pages/HistoryPage';
import { SettingsPage } from '@/components/pages/SettingsPage';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { applyTheme, presetSpec } from '@/lib/theme/monet';
import { createDemoRecord } from '@/lib/audio/demo';
import { analyzeAudioFile, takeSharedFile, importErrorKey } from '@/lib/audio/importAudio';
import { maybeAutoBackup } from '@/lib/backup/local';
import { useI18n } from '@/i18n/hook';
import { t } from '@/i18n';
import { checkPracticeReminder } from '@/lib/reminder';
import type { ViewType } from '@/types';

const TABS: ViewType[] = ['test', 'analysis', 'history', 'settings'];

/** 由 location.hash 解析页签（#/history 形式），未知或缺失时回退测试页 */
function tabFromHash(): ViewType {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (TABS as string[]).includes(h) ? (h as ViewType) : 'test';
}

// 首帧前同步一次：深链接（#/history 等）直接落到对应页签，不闪测试页；
// 无 hash 时按设置里的启动默认页签落位
{
  const initial = tabFromHash();
  if (window.location.hash) {
    if (useStore.getState().currentTab !== initial) {
      useStore.setState({ currentTab: initial });
    }
  } else {
    const start = useStore.getState().settings.startTab;
    if (start && useStore.getState().currentTab !== start) {
      useStore.setState({ currentTab: start });
    }
  }
}

function App() {
  const currentTab = useStore((s) => s.currentTab);
  const hue = useStore((s) => s.settings.hue);
  const huePreset = useStore((s) => s.settings.huePreset);
  const theme = useStore((s) => s.settings.theme);
  const addRecord = useHistoryStore((s) => s.addRecord);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const setTab = useStore((s) => s.setTab);

  // 语言切换（同步 <html lang> 与词典）
  useI18n();

  // 浏览器返回/前进键在页签间导航（页签切换的写入方向在 useStore.setTab 里同步 hash）
  useEffect(() => {
    const onHashChange = () => {
      const tab = tabFromHash();
      if (useStore.getState().currentTab !== tab) {
        useStore.getState().setTab(tab);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // 全局快捷键：1–4 切换页签；? 呼出/关闭快捷键帮助。
  // 输入控件聚焦时不接管；Space / M / Esc 等页面级按键由对应页面组件处理
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target
        && (target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT'
          || target.isContentEditable)
      ) return;
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (shortcutsOpen) {
        // 帮助面板打开时只允许 Esc（面板自身处理）与 ?（上方已切换），屏蔽页签跳转
        if (/^[1-4]$/.test(e.key)) e.preventDefault();
        return;
      }
      if (/^[1-4]$/.test(e.key)) {
        e.preventDefault();
        useStore.getState().setTab(TABS[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcutsOpen]);

  const isDark = theme === 'dark'
    || (theme === 'system'
      && typeof window !== 'undefined'
      && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // 应用莫奈主题色（含深浅模式；system 下监听系统切换；预设配色改写色相来源）
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const preset = presetSpec(huePreset, hue);
      applyTheme(preset.hue, theme === 'dark' || (theme === 'system' && mq.matches), preset.accentHue, preset.spec);
    };
    apply();
    if (theme === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [hue, huePreset, theme]);

  // 每日练习提醒：每分钟 + 回到前台时检查（到点且当天无录音 → 本地通知）
  const reminderEnabled = useStore((s) => s.settings.practiceReminderEnabled);
  const reminderTime = useStore((s) => s.settings.practiceReminderTime);
  useEffect(() => {
    if (!reminderEnabled) return;
    checkPracticeReminder(true, reminderTime);
    const timer = setInterval(() => checkPracticeReminder(true, reminderTime), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkPracticeReminder(true, reminderTime);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reminderEnabled, reminderTime]);

  // 开发辅助：?demo=1 生成一条示例记录，便于无麦克风环境体验
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') !== '1') return;
    if (useHistoryStore.getState().records.length > 0) return;
    const demo = createDemoRecord();
    addRecord(demo);
    setCurrentAnalysis(demo);
    setTab('analysis');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 实验性：本地自动备份的每周兜底（距上次 ≥7 天才写，未配置文件夹时为空操作）
  useEffect(() => {
    void maybeAutoBackup('launch');
  }, []);

  // PWA Share Target：系统「分享到 Simple Voice Tool」的音频文件
  // 由 Service Worker 暂存并 303 重定向回来，这里取走并走离线分析管线
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('share-target')) return;
    // 立即清掉查询参数，刷新/回退不会重复处理
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    void (async () => {
      const file = await takeSharedFile();
      if (!file) return;
      const loading = toast.loading(t('importAudio.processing'));
      try {
        const { record, audio, truncated } = await analyzeAudioFile(file);
        toast.dismiss(loading);
        useHistoryStore.getState().addRecord(record, audio ?? undefined);
        setCurrentAnalysis(record);
        setTab('analysis');
        void maybeAutoBackup('record');
        toast.success(truncated ? t('toast.importAudioTruncated') : t('toast.importAudioDone'));
      } catch (err) {
        toast.dismiss(loading);
        toast.error(t(importErrorKey(err)));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <Toaster
        position="top-center"
        richColors
        theme={isDark ? 'dark' : 'light'}
        toastOptions={{ style: { borderRadius: '8px' } }}
      />

      <main className="mx-auto w-full max-w-5xl px-5 pt-7 pb-36">
        {/*
          页面切换策略：旧页即时卸载（不做退场动画）+ 新页做入场动画。
          退场动画会让测试页的三张 Canvas 图表在底栏弹簧动画期间持续重绘，
          抢占主线程导致底栏动效掉帧；即时卸载让图表 rAF 立即停止，
          底栏动画与入场淡入独占动画帧。
        */}
        <motion.div
          key={currentTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
        >
          <PageErrorBoundary pageKey={currentTab}>
            {currentTab === 'test' && <TestPage />}
            {currentTab === 'analysis' && <AnalysisPage />}
            {currentTab === 'history' && <HistoryPage />}
            {currentTab === 'settings' && <SettingsPage />}
          </PageErrorBoundary>
        </motion.div>
      </main>

      <BottomBar />

      {/* 快捷键帮助（? 呼出）。面板自身渲染到 body portal，因此不用 AnimatePresence 包裹：
          关闭时直接卸载（入场动画保留），不依赖 portal 内退出动画的上报 */}
      {shortcutsOpen && <ShortcutsHelpSheet onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

export default App;
