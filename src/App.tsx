/**
 * 应用主组件
 * 页面切换（带过渡动画）+ 底部悬浮导航栏
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { BottomBar } from '@/components/layout/BottomBar';
import { PageErrorBoundary } from '@/components/layout/ErrorBoundary';
import { TestPage } from '@/components/pages/TestPage';
import { AnalysisPage } from '@/components/pages/AnalysisPage';
import { HistoryPage } from '@/components/pages/HistoryPage';
import { SettingsPage } from '@/components/pages/SettingsPage';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { applyTheme } from '@/lib/theme/monet';
import { createDemoRecord } from '@/lib/audio/demo';
import { analyzeAudioFile, takeSharedFile, importErrorKey } from '@/lib/audio/importAudio';
import { maybeAutoBackup } from '@/lib/backup/local';
import { useI18n } from '@/i18n/hook';
import { t } from '@/i18n';
import type { ViewType } from '@/types';

const TABS: ViewType[] = ['test', 'analysis', 'history', 'settings'];

/** 由 location.hash 解析页签（#/history 形式），未知或缺失时回退测试页 */
function tabFromHash(): ViewType {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (TABS as string[]).includes(h) ? (h as ViewType) : 'test';
}

// 首帧前同步一次：深链接（#/history 等）直接落到对应页签，不闪测试页
{
  const initial = tabFromHash();
  if (useStore.getState().currentTab !== initial) {
    useStore.setState({ currentTab: initial });
  }
}

function App() {
  const currentTab = useStore((s) => s.currentTab);
  const hue = useStore((s) => s.settings.hue);
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

  const isDark = theme === 'dark'
    || (theme === 'system'
      && typeof window !== 'undefined'
      && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // 应用莫奈主题色（含深浅模式；system 下监听系统切换）
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyTheme(hue, theme === 'dark' || (theme === 'system' && mq.matches));
    apply();
    if (theme === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [hue, theme]);

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
    </div>
  );
}

export default App;
