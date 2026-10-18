/**
 * 花园视图（历史页第三视图）
 * 全部记录各开一朵声之花，按时间排花坛（最新在前），可按模式过滤。
 * 点花弹详情：大花 + 映射依据标注（哪瓣是什么）+ 跳转分析页。
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flower2, X, BarChart3 } from 'lucide-react';
import { flowerOf, hueJitter, type Flower } from '@/lib/flower';
import { FlowerSvg } from '@/components/flowers/FlowerSvg';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AnalysisRecord, TestMode } from '@/types';
import { cn } from '@/lib/utils';

/** 花坛过滤（与趋势视图同款模式集） */
const GARDEN_FILTERS: { id: 'all' | TestMode; labelKey: 'common.all' | 'mode.reading' | 'mode.sustained' | 'mode.glide' }[] = [
  { id: 'all', labelKey: 'common.all' },
  { id: 'reading', labelKey: 'mode.reading' },
  { id: 'sustained', labelKey: 'mode.sustained' },
  { id: 'glide', labelKey: 'mode.glide' },
];

/** 花朵详情弹窗 */
function FlowerDetail({
  record,
  flower,
  onClose,
  onOpenAnalysis,
}: {
  record: AnalysisRecord;
  flower: Flower;
  onClose: () => void;
  onOpenAnalysis: () => void;
}) {
  useI18n();
  const d = new Date(record.createdAt);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/30 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="card-surface flex w-full max-w-sm flex-col items-center p-5"
      >
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-hi"
        >
          <X size={15} />
        </button>
        <FlowerSvg flower={flower} hueJitter={hueJitter(record.id)} className="h-44 w-36" />
        <p className="mt-1 text-sm font-semibold text-ink">
          {d.getFullYear()}/{d.getMonth() + 1}/{d.getDate()} {t(`mode.${record.mode ?? 'reading'}`)}
        </p>
        {/* 映射依据：哪瓣是什么 */}
        <ul className="mt-3 w-full space-y-1">
          {flower.basis.facts.map((fact) => (
            <li key={fact} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-2">
              <span className="mt-[6px] size-1 shrink-0 rounded-full bg-accent/70" />
              {fact}
            </li>
          ))}
        </ul>
        <button
          onClick={onOpenAnalysis}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-accent py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
        >
          <BarChart3 size={14} />
          {t('garden.openAnalysis')}
        </button>
      </motion.div>
    </motion.div>
  );
}

export function GardenView({
  records,
  onOpenAnalysis,
}: {
  records: AnalysisRecord[];
  onOpenAnalysis: (record: AnalysisRecord) => void;
}) {
  useI18n();
  const [filter, setFilter] = useState<'all' | TestMode>('all');
  const [detail, setDetail] = useState<{ record: AnalysisRecord; flower: Flower } | null>(null);

  const filtered = useMemo(
    () => (filter === 'all' ? records : records.filter((r) => r.mode === filter)),
    [records, filter],
  );

  return (
    <div>
      {/* 模式过滤（与趋势视图同款分段控件） */}
      <div className="mb-3 flex items-center justify-center">
        <div className="flex items-center rounded-full bg-surface-hi p-0.5" role="group" aria-label={t('garden.filterLabel')}>
          {GARDEN_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                filter === f.id ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
              )}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-2">{t('garden.empty')}</p>
      ) : (
        /* 花坛：时间横向流动，每朵花按日期排；窄屏两列、宽屏四列 */
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <AnimatePresence initial={false}>
            {filtered.map((r) => {
              const flower = flowerOf(r);
              return (
                <motion.button
                  key={r.id}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setDetail({ record: r, flower })}
                  className="group flex flex-col items-center rounded-2xl bg-card/60 px-2 pb-2 pt-1 transition-colors hover:bg-card"
                  aria-label={`${t('garden.openDetail')}: ${r.stats.avgF0.toFixed(1)} Hz`}
                >
                  <FlowerSvg flower={flower} hueJitter={hueJitter(r.id)} className="h-24 w-20 transition-transform group-active:scale-95" />
                  <span className="text-[10px] tabular-nums text-ink-2">
                    {new Date(r.createdAt).getMonth() + 1}/{new Date(r.createdAt).getDate()}
                    {' · '}
                    {r.stats.avgF0.toFixed(0)}Hz
                  </span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {detail && (
          <FlowerDetail
            record={detail.record}
            flower={detail.flower}
            onClose={() => setDetail(null)}
            onOpenAnalysis={() => {
              const target = detail.record;
              setDetail(null);
              onOpenAnalysis(target);
            }}
          />
        )}
      </AnimatePresence>

      {/* 底部说明：花与参数的映射（花园自身的小图例） */}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] leading-relaxed text-ink-2">
        <Flower2 size={10} className="shrink-0" />
        {t('garden.legend')}
      </p>
    </div>
  );
}
