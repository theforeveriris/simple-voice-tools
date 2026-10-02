/**
 * 历史页面
 * 顶部「列表 / 趋势」切换：
 *   列表 — 记录卡片（可搜索、长按进入多选，多选下支持批量删除与两两对比；
 *          删除可在 5 秒内撤销）
 *   趋势 — 跨记录趋势图（平均基频 + P10–P90 音域随日期变化），
 *          支持按测试模式过滤（不同模式的基频不可直接比较）
 * 点击任意记录进入对应分析页。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Trash2, ChevronRight, History,
  Search, ListFilter, TrendingUp, GitCompareArrows, X, StickyNote, CalendarDays, ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';
import { useHistoryStore } from '@/store/useHistoryStore';
import { useStore } from '@/store/useStore';
import { createDemoRecord } from '@/lib/audio/demo';
import { MiniSpark } from '@/components/charts/MiniSpark';
import { TrendChart } from '@/components/charts/TrendChart';
import { hasTrendMetricData, type TrendMetric } from '@/lib/trendMetric';
import { WeeklyReportCard } from '@/components/history/WeeklyReportCard';
import { DiaryHeatmap } from '@/components/charts/DiaryHeatmap';
import type { DiaryMetric } from '@/components/charts/DiaryHeatmap';
import { CompareSheet } from './CompareSheet';
import { freqToNote, bandOf, BAND_COLORS, MAX_HISTORY } from '@/constants';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { localeTag } from '@/i18n';
import type { AnalysisRecord, TestMode } from '@/types';
import { cn } from '@/lib/utils';
import { EmptyHero, EMPTY_PRIMARY, EMPTY_SECONDARY } from '@/components/layout/EmptyHero';
import { useDeferredMount } from '@/hooks/useDeferredMount';
import { registerBackClose } from '@/lib/backNav';

const LONG_PRESS_MS = 480;

function formatDate(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** 长按进入多选的手势处理（移动距离超阈值视为滚动，取消长按） */
function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const origin = useRef({ x: 0, y: 0 });

  const onPointerDown = (e: ReactPointerEvent) => {
    fired.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    timer.current = window.setTimeout(() => {
      fired.current = true;
      onLongPress();
      navigator.vibrate?.(12);
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (timer.current === null) return;
    if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 12) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    /** 长按后抬起时的 click 不应触发点击行为 */
    consumeClick: () => {
      const was = fired.current;
      fired.current = false;
      return was;
    },
  };
}

function RecordCard({
  record,
  selected,
  selectionMode,
  onOpen,
  onToggleSelect,
  onEnterSelection,
  onDelete,
}: {
  record: AnalysisRecord;
  selected: boolean;
  selectionMode: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onEnterSelection: () => void;
  onDelete: () => void;
}) {
  const { date, time } = formatDate(record.createdAt);
  const band = bandOf(record.stats.avgF0);
  const note = freqToNote(record.stats.avgF0);
  const press = useLongPress(onEnterSelection);
  // 移动端整行迷你曲线开关（设置 → 外观；桌面端内联曲线不受影响）
  const mobileSpark = useStore((s) => s.settings.mobileSpark);

  const handleClick = () => {
    if (press.consumeClick()) return;
    if (selectionMode) onToggleSelect();
    else onOpen();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onClick={handleClick}
      onKeyDown={(e) => {
        // 键盘等价操作：Enter/Space 打开（多选模式下切换选中）
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      role="button"
      tabIndex={0}
      className={cn(
        'group flex cursor-pointer select-none flex-col gap-1.5 rounded-[20px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-shadow hover:shadow-[0_6px_24px_rgba(28,25,45,0.09),0_2px_6px_rgba(28,25,45,0.05)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70 sm:flex-row sm:items-center sm:gap-4',
        selectionMode && selected && 'ring-2 ring-accent',
      )}
      {...(selectionMode ? {} : press)}
    >
      {/* 日期栏（桌面端左侧；移动端并入下方信息行） */}
      <div className="hidden w-16 shrink-0 text-center sm:block">
        <p className="text-xs font-semibold tabular-nums text-ink">{date}</p>
        <p className="text-lg font-semibold tabular-nums leading-tight text-ink">{time}</p>
        <p className="text-[10px] tabular-nums text-ink-2">{record.stats.durationSec.toFixed(0)} s</p>
      </div>

      <div className="hidden h-10 w-px shrink-0 bg-black/[0.05] sm:block" />

      {/* 波形与概要 + 操作（移动端同一行，操作靠右） */}
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <MiniSpark series={record.series} className="hidden shrink-0 sm:block" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-x-2 gap-y-0.5 flex-wrap">
            <span className="text-base font-semibold tabular-nums text-ink">
              {record.stats.avgF0.toFixed(1)}
            </span>
            <span className="text-[11px] text-ink-2">Hz</span>
            <span className="text-[11px] font-semibold text-accent">{note.name}</span>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-ink-2">
              <span className="size-1.5 rounded-full" style={{ background: BAND_COLORS[band] }} />
              {t(`band.${band}`)}
            </span>
            {record.mode && (
              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-on-accent-soft">
                {t(`mode.${record.mode}`)}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-ink-2">
            {/* 移动端显示日期与时长（日期栏已隐藏），桌面端显示区间统计 */}
            <span className="sm:hidden">
              {date} {time} · {record.stats.durationSec.toFixed(0)} s · {record.stats.avgDb.toFixed(0)} dB
            </span>
            <span className="hidden sm:inline">
              {t('band.male')} {record.stats.malePct}% · {t('band.female')} {record.stats.femalePct}% · {record.stats.avgDb.toFixed(0)} dB
            </span>
          </p>
          {record.note && (
            <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-accent">
              <StickyNote size={11} className="shrink-0" />
              {record.note}
            </p>
          )}
        </div>

        {/* 操作 */}
        <div className="flex shrink-0 items-center gap-1">
          {selectionMode ? (
            <span
              className={cn(
                'grid size-6 place-items-center rounded-full border-2 transition-colors',
                selected ? 'border-accent bg-accent text-on-accent' : 'border-black/20',
              )}
              aria-hidden
            >
              {selected && <span className="text-[11px] font-bold leading-none">✓</span>}
            </span>
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="grid size-8 place-items-center text-ink-2 opacity-100 transition hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={t('history.deleteAria')}
              >
                <Trash2 size={15} />
              </button>
              <ChevronRight size={17} className="text-ink-2" />
            </>
          )}
        </div>
      </div>

      {/* 基频曲线（移动端：信息行下方整行铺满，可在设置 → 外观关闭；桌面端内联在信息行左侧） */}
      {mobileSpark && <MiniSpark full series={record.series} className="sm:hidden" />}
    </motion.div>
  );
}

function EmptyHistory() {
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
      /* -mt 抵消上方「列表/趋势」切换胶囊 + 间距，使图标与分析页落在屏幕同一位置 */
      className="-mt-[50px]"
      icon={<History size={26} strokeWidth={1.5} />}
      title={t('history.emptyTitle')}
      desc={t('history.emptyDesc')}
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

/** 删除并支持 5 秒内撤销：预取音频 Blob 留在内存，撤销时原样恢复 */
async function removeWithUndo(
  list: AnalysisRecord[],
  store: {
    removeRecord: (id: string) => void;
    addRecord: (record: AnalysisRecord, audioBlob?: Blob) => void;
    getAudio: (id: string) => Promise<Blob | null>;
  },
) {
  // 音频预取：数量多时可能占用大量内存，仅少量记录保留音频，多量只恢复记录本身
  const audio = new Map<string, Blob>();
  if (list.length <= 20) {
    for (const r of list) {
      const blob = await store.getAudio(r.id);
      if (blob) audio.set(r.id, blob);
    }
  }
  for (const r of list) store.removeRecord(r.id);
  toast.success(list.length > 1 ? t('toast.deletedMany', { n: list.length }) : t('toast.deletedOne'), {
    duration: 6000,
    action: {
      label: t('common.undo'),
      onClick: () => {
        for (const r of list) store.addRecord(r, audio.get(r.id));
        toast.success(t('toast.undoDone'));
      },
    },
  });
}

/** 趋势图的测试模式过滤：不同模式（朗读/长音/滑音）的基频统计不可直接比较 */
const TREND_FILTERS: { id: 'all' | TestMode; labelKey: 'common.all' | 'mode.reading' | 'mode.sustained' | 'mode.glide' }[] = [
  { id: 'all', labelKey: 'common.all' },
  { id: 'reading', labelKey: 'mode.reading' },
  { id: 'sustained', labelKey: 'mode.sustained' },
  { id: 'glide', labelKey: 'mode.glide' },
];

/** 用声日记的指标切换 */
const DIARY_METRICS: { id: DiaryMetric; labelKey: 'history.diaryMetricCount' | 'history.diaryMetricDuration' | 'history.diaryMetricF0' }[] = [
  { id: 'count', labelKey: 'history.diaryMetricCount' },
  { id: 'duration', labelKey: 'history.diaryMetricDuration' },
  { id: 'avgF0', labelKey: 'history.diaryMetricF0' },
];

/** 趋势图纵轴指标切换：平均基频 / 最长声时 MPT（长音）/ CPPS（需录音音频） */
const TREND_METRICS: { id: TrendMetric; labelKey: 'history.trendMetricF0' | 'history.trendMetricMpt' | 'history.trendMetricCpps' }[] = [
  { id: 'f0', labelKey: 'history.trendMetricF0' },
  { id: 'mpt', labelKey: 'history.trendMetricMpt' },
  { id: 'cpps', labelKey: 'history.trendMetricCpps' },
];

export function HistoryPage() {
  useI18n();
  const records = useHistoryStore((s) => s.records);
  const totalCount = useHistoryStore((s) => s.totalCount);
  const removeRecord = useHistoryStore((s) => s.removeRecord);
  const addRecord = useHistoryStore((s) => s.addRecord);
  const getAudio = useHistoryStore((s) => s.getAudio);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const setTab = useStore((s) => s.setTab);

  const [view, setView] = useState<'list' | 'trend'>('list');
  const [query, setQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [comparePair, setComparePair] = useState<[AnalysisRecord, AnalysisRecord] | null>(null);
  const [trendFilter, setTrendFilter] = useState<'all' | TestMode>('all');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('f0');
  const [diaryMetric, setDiaryMetric] = useState<DiaryMetric>('count');
  const contentReady = useDeferredMount();

  // 对比浮层的返回手势：系统返回 / 侧滑关闭对比，浮层内返回按钮走 history.back()
  useEffect(() => {
    if (!comparePair) return;
    return registerBackClose(() => setComparePair(null));
  }, [comparePair]);
  const searchRef = useRef<HTMLInputElement>(null);

  const open = (record: AnalysisRecord) => {
    setCurrentAnalysis(record);
    setTab('analysis');
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      const hay = [
        r.note ?? '',
        r.mode ? t(`mode.${r.mode}`) : '',
        new Date(r.createdAt).toLocaleString(localeTag()),
        r.stats.avgF0.toFixed(0),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, query]);

  const trendRecords = useMemo(
    () => (trendFilter === 'all' ? records : records.filter((r) => r.mode === trendFilter)),
    [records, trendFilter],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enterSelection = (id?: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set(id ? [id] : []));
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const remove = (record: AnalysisRecord) => {
    void removeWithUndo([record], { removeRecord, addRecord, getAudio });
  };

  const batchRemove = () => {
    const picked = records.filter((r) => selectedIds.has(r.id));
    exitSelection();
    void removeWithUndo(picked, { removeRecord, addRecord, getAudio });
  };

  const tryCompare = () => {
    const picked = records.filter((r) => selectedIds.has(r.id));
    if (picked.length !== 2) return;
    const [a, b] = [...picked].sort((x, y) => x.createdAt - y.createdAt);
    setComparePair([a, b]);
  };

  // 键盘操作（长按手势的等价操作 + 效率快捷键）：
  // / 聚焦搜索；多选模式下 Esc 退出、Ctrl/⌘+A 全选、Delete 批量删除（可撤销）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target
        && (target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT'
          || target.isContentEditable);
      if (e.key === '/' && !typing && view === 'list' && !selectionMode) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!selectionMode || typing) return;
      if (e.key === 'Escape') {
        exitSelection();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setSelectedIds(new Set(filtered.map((r) => r.id)));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        batchRemove();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectionMode, filtered]);

  return (
    <div className="flex flex-col gap-3.5">
      {/* 列表 / 趋势 切换（列表视图右侧附可见的「多选」入口，桌面端长按手势的等价操作） */}
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex w-fit items-center gap-0.5 rounded-full bg-card p-1 shadow-[0_2px_14px_rgba(28,25,45,0.05)]">
        {(
          [
            { id: 'list', label: t('history.viewList'), icon: ListFilter },
            { id: 'trend', label: t('history.viewTrend'), icon: TrendingUp },
          ] as const
        ).map((tab) => {
          const active = view === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setView(tab.id);
                exitSelection();
              }}
              className="relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium"
              aria-label={t('history.viewAria', { name: tab.label })}
            >
              {active && (
                <motion.span layoutId="history-view-pill" className="absolute inset-0 rounded-full bg-accent-soft" />
              )}
              <Icon size={13} className={cn('relative z-10', active ? 'text-accent' : 'text-ink-2')} />
              <span className={cn('relative z-10', active ? 'text-accent' : 'text-ink-2')}>{tab.label}</span>
            </button>
          );
        })}
        </div>
        {view === 'list' && !selectionMode && records.length > 0 && (
          <button
            onClick={() => enterSelection()}
            aria-label={t('history.selectAria')}
            className="grid size-9 place-items-center rounded-full bg-card text-ink-2 shadow-[0_2px_14px_rgba(28,25,45,0.05)] transition-colors hover:text-ink"
          >
            <ListChecks size={16} />
          </button>
        )}
      </div>

      {/* 重内容延迟两帧挂载：页面壳（列表/趋势切换）先随入场动画绘制，
          记录卡 / 热力图 / 趋势图的挂载开销不再把入场动画阻塞成闪动 */}
      {!contentReady ? (
        <div className="min-h-[55vh]" aria-hidden />
      ) : view === 'trend' ? (
        records.length === 0 ? (
          <EmptyHistory />
        ) : (
          <>
          <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
            {/* 模式过滤：长音/滑音的基频与朗读不可比；右侧纵轴指标切换 */}
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {TREND_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setTrendFilter(f.id)}
                    className={cn(
                      'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                      trendFilter === f.id
                        ? 'bg-accent text-on-accent'
                        : 'bg-surface-hi text-ink-2 hover:text-ink',
                    )}
                  >
                    {t(f.labelKey)}
                  </button>
                ))}
              </div>
              <div className="flex items-center rounded-full bg-surface-hi p-0.5">
                {TREND_METRICS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setTrendMetric(m.id)}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors',
                      trendMetric === m.id ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
                    )}
                  >
                    {t(m.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            {trendRecords.length === 0 ? (
              <p className="py-16 text-center text-sm text-ink-2">{t('history.trendEmpty')}</p>
            ) : !hasTrendMetricData(trendRecords, trendMetric) ? (
              <p className="py-16 text-center text-sm text-ink-2">{t('history.trendMetricEmpty')}</p>
            ) : (
              <>
                {/* 用声日记：日历热力图（打卡概览，跟随当前模式过滤） */}
                <div className="mb-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <CalendarDays size={13} className="text-accent" />
                      {t('history.diary')}
                    </span>
                    <div className="flex items-center rounded-full bg-surface-hi p-0.5">
                      {DIARY_METRICS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setDiaryMetric(m.id)}
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors',
                            diaryMetric === m.id ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
                          )}
                        >
                          {t(m.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <DiaryHeatmap records={trendRecords} metric={diaryMetric} />
                </div>
                <div className="mb-3 border-t border-black/[0.04]" />
                <TrendChart records={trendRecords} connectLine={trendFilter !== 'all'} metric={trendMetric} onOpen={open} />
                <p className="mt-1 text-center text-[10px] text-ink-2">
                  {t(trendMetric === 'f0' ? 'history.trendHint' : 'history.trendHintMetric')}
                </p>
              </>
            )}
          </div>
          {/* AI 周报（实验性 · 大模型）：聚合近 7 天出总结 */}
          <WeeklyReportCard records={records} />
          </>
        )
      ) : records.length === 0 ? (
        <EmptyHistory />
      ) : (
        <>
          {/* 搜索框 */}
          <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2.5 shadow-[0_2px_14px_rgba(28,25,45,0.05)]">
            <Search size={14} className="shrink-0 text-ink-2" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('history.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-2/70 sm:text-sm"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-ink-2 hover:text-ink" aria-label={t('common.reset')}>
                <X size={14} />
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-2">{t('history.noMatch', { q: query })}</p>
          ) : (
            <div className="flex flex-col gap-2.5 pb-2">
              <AnimatePresence initial={false}>
                {filtered.map((record) => (
                  <RecordCard
                    key={record.id}
                    record={record}
                    selected={selectedIds.has(record.id)}
                    selectionMode={selectionMode}
                    onOpen={() => open(record)}
                    onToggleSelect={() => toggleSelect(record.id)}
                    onEnterSelection={() => enterSelection(record.id)}
                    onDelete={() => remove(record)}
                  />
                ))}
              </AnimatePresence>
              {/* 界面只渲染最近 MAX_HISTORY 条；完整数据在 IDB 中，导出/备份包含全部 */}
              {totalCount > records.length && (
                <p className="pt-1 text-center text-[10px] text-ink-2">
                  {t('history.truncated', { limit: MAX_HISTORY, total: totalCount })}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* 多选操作条 */}
      <AnimatePresence>
        {selectionMode && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-5"
          >
            <div className="flex items-center gap-1.5 rounded-full bg-ink py-1.5 pl-5 pr-1.5 text-card shadow-xl">
              <span className="text-xs font-medium tabular-nums">{t('history.selectedCount', { n: selectedIds.size })}</span>
              <button
                onClick={tryCompare}
                disabled={selectedIds.size !== 2}
                className={cn(
                  'ml-1 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity',
                  selectedIds.size === 2 ? 'bg-accent text-on-accent' : 'cursor-default opacity-40',
                )}
              >
                <GitCompareArrows size={13} />
                {t('history.compare')}
              </button>
              <button
                onClick={batchRemove}
                disabled={selectedIds.size === 0}
                className={cn(
                  'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity',
                  selectedIds.size > 0 ? 'bg-red-500 text-white' : 'cursor-default opacity-40',
                )}
              >
                <Trash2 size={13} />
                {t('common.delete')}
              </button>
              <button
                onClick={exitSelection}
                className="grid size-8 place-items-center rounded-full text-card/80 hover:text-card"
                aria-label={t('history.exitSelectionAria')}
              >
                <X size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 对比浮层 */}
      <AnimatePresence>
        {comparePair && <CompareSheet pair={comparePair} onClose={() => window.history.back()} />}
      </AnimatePresence>
    </div>
  );
}
