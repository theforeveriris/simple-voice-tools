/**
 * 分析页空态
 * 未经过录音直接进入时显示，提供去测试 / 载入示例两个入口。
 * 视觉构成见 EmptyHero（柔光圆底图标 + 两级文案 + 胶囊按钮）。
 */

import { ChartNoAxesColumn } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { createDemoRecord } from '@/lib/audio/demo';
import { t } from '@/i18n';
import { EmptyHero, EMPTY_PRIMARY, EMPTY_SECONDARY } from '@/components/layout/EmptyHero';

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
    <EmptyHero
      icon={<ChartNoAxesColumn size={26} strokeWidth={1.5} />}
      title={t('analysis.emptyTitle')}
      desc={t('analysis.emptyHint')}
      primary={
        <button onClick={() => setTab('test')} className={EMPTY_PRIMARY}>
          {t('common.goTest')}
        </button>
      }
      secondary={
        <button onClick={loadDemo} className={EMPTY_SECONDARY}>
          {t('common.loadDemo')}
        </button>
      }
    />
  );
}
