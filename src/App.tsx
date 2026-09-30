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

function App() {
  const currentTab = useStore((s) => s.currentTab);
  const hue = useStore((s) => s.settings.hue);
  const addRecord = useHistoryStore((s) => s.addRecord);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const setTab = useStore((s) => s.setTab);

  // 应用莫奈主题色
  useEffect(() => {
    applyTheme(hue);
  }, [hue]);

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

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <Toaster position="top-center" richColors toastOptions={{ style: { borderRadius: '8px' } }} />

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
