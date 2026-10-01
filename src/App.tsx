/**
 * 应用主组件
 * 页面切换（带过渡动画）+ 底部悬浮导航栏
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Toaster } from 'sonner';
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
import { maybeAutoBackup } from '@/lib/backup/local';
import { useI18n } from '@/i18n/hook';

function App() {
  const currentTab = useStore((s) => s.currentTab);
  const hue = useStore((s) => s.settings.hue);
  const theme = useStore((s) => s.settings.theme);
  const addRecord = useHistoryStore((s) => s.addRecord);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const setTab = useStore((s) => s.setTab);

  // 语言切换（同步 <html lang> 与词典）
  useI18n();

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
