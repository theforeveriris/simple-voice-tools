/**
 * 分析页空态
 * 未经过录音直接进入时显示，提供去测试 / 载入示例两个入口
 */

import { motion } from 'framer-motion';
import { ChartNoAxesColumn, ChevronRight } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { createDemoRecord } from '@/lib/audio/demo';
import { t } from '@/i18n';

export function EmptyState() {
  const setTab = useStore((s) => s.setTab);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const addRecord = useHistoryStore((s) => s.addRecord);

  const loadDemo = () => {
    const demo = createDemoRecord();
    addRecord(demo);
    setCurrentAnalysis(demo);
  };

  return (
    <div className="grid min-h-[64vh] place-items-center">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-3 text-center"
      >
        <ChartNoAxesColumn size={30} strokeWidth={1.6} className="text-accent" />
        <p className="text-sm text-ink-2">{t('analysis.emptyHint')}</p>
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={() => setTab('test')}
            className="flex items-center gap-1 px-1 py-2 text-sm font-medium text-accent transition-opacity hover:opacity-70"
          >
            {t('common.goTest')}
            <ChevronRight size={15} />
          </button>
          <button
            onClick={loadDemo}
            className="px-1 py-2 text-sm font-medium text-ink-2 transition-opacity hover:opacity-70"
          >
            {t('common.loadDemo')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
