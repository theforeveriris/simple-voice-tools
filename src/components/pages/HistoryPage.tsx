/**
 * 历史页面
 * localStorage 中全部测试分析记录，按时间倒序排列；
 * 点击任意记录进入对应分析页。
 */

import { motion } from 'framer-motion';
import { History, Trash2, ChevronRight, SquareTerminal, FileQuestion } from 'lucide-react';
import { useHistoryStore } from '@/store/useHistoryStore';
import { useStore } from '@/store/useStore';
import { createDemoRecord } from '@/lib/audio/demo';
import { MiniSpark } from '@/components/charts/MiniSpark';
import { freqToNote, bandOf, BAND_COLORS, BAND_LABELS } from '@/constants';
import { toast } from 'sonner';
import type { AnalysisRecord } from '@/types';

function formatDate(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function RecordCard({ record, onOpen, onDelete }: {
  record: AnalysisRecord;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { date, time } = formatDate(record.createdAt);
  const band = bandOf(record.stats.avgF0);
  const note = freqToNote(record.stats.avgF0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onClick={onOpen}
      className="group flex cursor-pointer items-center gap-4 rounded-[20px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-shadow hover:shadow-[0_6px_24px_rgba(28,25,45,0.09),0_2px_6px_rgba(28,25,45,0.05)]"
    >
      {/* 日期 */}
      <div className="w-16 shrink-0 text-center">
        <p className="text-xs font-semibold tabular-nums text-ink">{date}</p>
        <p className="text-lg font-semibold tabular-nums leading-tight text-ink">{time}</p>
        <p className="text-[10px] tabular-nums text-ink-2">{record.stats.durationSec.toFixed(0)} 秒</p>
      </div>

      <div className="h-10 w-px shrink-0 bg-black/[0.05]" />

      {/* 波形与概要 */}
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <MiniSpark series={record.series} className="hidden shrink-0 sm:block" />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold tabular-nums text-ink">
              {record.stats.avgF0.toFixed(1)}
            </span>
            <span className="text-[11px] text-ink-2">Hz</span>
            <span className="text-[11px] font-semibold text-accent">{note.name}</span>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-ink-2">
              <span className="size-1.5 rounded-full" style={{ background: BAND_COLORS[band] }} />
              {BAND_LABELS[band]}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-ink-2">
            男声区 {record.stats.malePct}% · 女声区 {record.stats.femalePct}% · 响度 {record.stats.avgDb.toFixed(0)} dB
          </p>
        </div>
      </div>

      {/* 操作 */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="grid size-8 place-items-center text-ink-2 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
          aria-label="删除该记录"
        >
          <Trash2 size={15} />
        </button>
        <ChevronRight size={17} className="text-ink-2" />
      </div>
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
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <FileQuestion size={30} strokeWidth={1.6} className="text-accent" />
        <p className="text-sm text-ink-2">还没有测试记录，去做一次测试吧</p>
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={() => setTab('test')}
            className="flex items-center gap-1.5 px-1 py-2 text-sm font-medium text-accent transition-opacity hover:opacity-70"
          >
            <SquareTerminal size={15} />
            去测试
          </button>
          <button
            onClick={loadDemo}
            className="px-1 py-2 text-sm font-medium text-ink-2 transition-opacity hover:opacity-70"
          >
            载入示例数据
          </button>
        </div>
      </div>
    </div>
  );
}

export function HistoryPage() {
  const records = useHistoryStore((s) => s.records);
  const removeRecord = useHistoryStore((s) => s.removeRecord);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const setTab = useStore((s) => s.setTab);

  const open = (record: AnalysisRecord) => {
    setCurrentAnalysis(record);
    setTab('analysis');
  };

  const remove = (record: AnalysisRecord) => {
    removeRecord(record.id);
    toast.success('已删除该记录');
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-end justify-between pt-1">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
            <History size={19} className="text-accent" />
            历史记录
          </h1>
          <p className="mt-0.5 text-xs text-ink-2">
            共 {records.length} 条记录 · 按时间倒序 · 点击进入分析
          </p>
        </div>
      </div>

      {records.length === 0 ? (
        <EmptyHistory />
      ) : (
        <div className="flex flex-col gap-2.5">
          {records.map((record) => (
            <RecordCard
              key={record.id}
              record={record}
              onOpen={() => open(record)}
              onDelete={() => remove(record)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
