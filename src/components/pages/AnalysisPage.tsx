/**
 * 分析页面
 * 结构（自上而下）：
 *   1. 页头：日期 / 模式徽标 + 分享图 / CSV / 备注操作
 *   2. 声纹概览卡：平均基频 + 音域标尺（跟随当前查看区间）
 *   3. 基线对比条（设置中钉选基线时显示）
 *   4. 录音回放条（保存过音频时显示）
 *   5. 长音分析卡（长音模式记录专属：MPT / 稳定度 / 衰减）
 *   6. 统计表格：音高 / 共振峰 / 能量 / 嗓音质量四组（跟随区间）
 *   7. 四个图表（音高、共振峰、能量、语谱图），共享同一个
 *      时间轴区间选择（任一图表下方拖动，全部同步 + 统计联动）。
 *
 * 未经过录音直接进入时显示空态提示。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ChartNoAxesColumn, ChevronRight, Sparkles, Play, Pause, Share2,
  FileSpreadsheet, Pencil, Music2, GitCompareArrows, Timer, Activity, Waves, Lightbulb,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { createDemoRecord } from '@/lib/audio/demo';
import { computeStats } from '@/lib/audio/recorder';
import { computeSustainedMetrics } from '@/lib/audio/sustained';
import { buildAdvice } from '@/lib/advice';
import { recordToFrameCsv, downloadText } from '@/lib/export/csv';
import { exportShareImage } from '@/lib/export/shareCard';
import { SeriesChart } from '@/components/charts/SeriesChart';
import { SpecChart } from '@/components/charts/SpecChart';
import { TimeRangeSelector } from '@/components/charts/TimeRangeSelector';
import { freqToNote, bandOf, BAND_COLORS } from '@/constants';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { localeTag } from '@/i18n';
import type { AnalysisRecord, RecordSeries } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';

/* -------------------------------- 数据切片 -------------------------------- */

/** 截取时间区间内的序列（统计随区间重算） */
function sliceSeries(series: RecordSeries, t0: number, t1: number): RecordSeries {
  const out: RecordSeries = { t: [], f0: [], rmsDb: [], f1: [], f2: [] };
  for (let i = 0; i < series.t.length; i++) {
    const t = series.t[i];
    if (t < t0 - 1e-6 || t > t1 + 1e-6) continue;
    out.t.push(t);
    out.f0.push(series.f0[i]);
    out.rmsDb.push(series.rmsDb[i]);
    out.f1.push(series.f1[i]);
    out.f2.push(series.f2[i]);
  }
  return out;
}

/* ------------------------------- 音域标尺 ------------------------------- */

/** 对数刻度：60–520Hz 映射到 0–100% */
const RULER_MIN = 60;
const RULER_MAX = 520;
const posPct = (f: number) => ((Math.log(f / RULER_MIN) / Math.log(RULER_MAX / RULER_MIN)) * 100).toFixed(2);

/**
 * 音域标尺：在男/女声区色带上标出当前区间的
 * P10–P90 音域范围（圆角括条）与平均基频位置（游标）
 */
function RangeRuler({ record }: { record: AnalysisRecord }) {
  const { avgF0, p10F0, p90F0 } = record.stats;
  const band = bandOf(avgF0);
  return (
    <div className="w-full">
      <div className="relative h-3.5 w-full overflow-hidden rounded-full">
        <div className="absolute inset-0 flex">
          <span className="h-full" style={{ width: `${posPct(85)}%`, background: `${BAND_COLORS.low}30` }} />
          <span className="h-full" style={{ width: `${Number(posPct(165)) - Number(posPct(85))}%`, background: `${BAND_COLORS.male}45` }} />
          <span className="h-full" style={{ width: `${Number(posPct(180)) - Number(posPct(165))}%`, background: `${BAND_COLORS.transition}26` }} />
          <span className="h-full" style={{ width: `${Number(posPct(255)) - Number(posPct(180))}%`, background: `${BAND_COLORS.female}45` }} />
          <span className="h-full flex-1" style={{ background: `${BAND_COLORS.high}30` }} />
        </div>
        {/* P10–P90 音域括条（颜色取自主题变量，深浅模式均可见） */}
        <div
          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full border-2 shadow transition-all duration-700"
          style={{
            left: `${posPct(Math.max(RULER_MIN, p10F0))}%`,
            width: `${Number(posPct(Math.min(RULER_MAX, p90F0))) - Number(posPct(Math.max(RULER_MIN, p10F0)))}%`,
            background: 'rgb(var(--c-ink-rgb) / 0.28)',
            borderColor: 'rgb(var(--c-card-rgb) / 0.9)',
          }}
        />
        {/* 平均基频游标 */}
        <div
          className="absolute top-1/2 z-10 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow ring-2 transition-all duration-700"
          style={{ left: `${posPct(Math.min(RULER_MAX, Math.max(RULER_MIN, avgF0)))}%`, ['--tw-ring-color' as string]: 'rgb(var(--c-card-rgb))' }}
        />
      </div>
      {/* 刻度 */}
      <div className="relative mt-1 h-3 text-[9px] tabular-nums text-ink-2">
        {[100, 200, 300, 400, 500].map((f) => (
          <span key={f} className="absolute -translate-x-1/2" style={{ left: `${posPct(f)}%` }}>
            {f}
          </span>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span className="text-ink-2">{t('analysis.rangeP10P90', { a: p10F0.toFixed(0), b: p90F0.toFixed(0) })}</span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
          <span className="size-1.5 rounded-full" style={{ background: BAND_COLORS[band] }} />
          {t(`band.${band}`)}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------- 声纹概览卡 ------------------------------- */

function StatChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-ink-2">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function HeroSummary({
  record,
  range,
  actions,
}: {
  record: AnalysisRecord;
  range: [number, number];
  actions?: ReactNode;
}) {
  const { avgF0 } = record.stats;
  const note = freqToNote(avgF0);
  const isPartial = range[0] > 0.001 || range[1] < record.durationSec - 0.001;
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.round(s - m * 60)).padStart(2, '0')}`;
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="rounded-[22px] bg-card p-5 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]"
    >
      {/* 标签行：平均基频 + 区间/模式徽标，右侧为分享 / CSV / 备注操作 */}
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-ink-2">
          <Sparkles size={12} className="shrink-0 text-accent" />
          {t('analysis.avgF0')}
          <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-on-accent-soft">
            {isPartial ? t('analysis.chipRange', { a: fmt(range[0]), b: fmt(range[1]) }) : t('analysis.chipFull')}
          </span>
          {record.mode && (
            <span className="flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-on-accent-soft">
              <Music2 size={9} />
              {t(`mode.${record.mode}`)}
            </span>
          )}
        </p>
        {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
      </div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-40">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight tabular-nums text-ink">
              {avgF0.toFixed(1)}
            </span>
            <span className="text-sm text-ink-2">Hz</span>
            <span className="text-sm font-semibold text-accent">{note.name}</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-2">
            {t('analysis.pitchDev', { cents: note.cents >= 0 ? `+${note.cents}` : String(note.cents) })}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-ink-2">
            {new Date(record.createdAt).toLocaleString(localeTag(), { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="min-w-[280px] flex-1 lg:max-w-md">
          <RangeRuler record={record} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <StatChip label={t('analysis.statDuration')} value={`${record.stats.durationSec.toFixed(1)} ${t('analysis.unitSec')}`} />
        <StatChip label={t('analysis.statF1')} value={record.stats.avgF1 != null ? `${record.stats.avgF1.toFixed(0)} Hz` : '—'} />
        <StatChip label={t('analysis.statF2')} value={record.stats.avgF2 != null ? `${record.stats.avgF2.toFixed(0)} Hz` : '—'} />
        <StatChip label={t('analysis.statDb')} value={`${record.stats.avgDb.toFixed(1)} dB`} />
      </div>
    </motion.div>
  );
}

/* ------------------------------- 基线对比条 ------------------------------- */

/** 与基线记录的快速 Δ 对比（基线在 设置 → 训练 中钉选） */
function BaselineStrip({ record, baseline }: { record: AnalysisRecord; baseline: AnalysisRecord }) {
  const dAvg = record.stats.avgF0 - baseline.stats.avgF0;
  const dP10 = record.stats.p10F0 - baseline.stats.p10F0;
  const dP90 = record.stats.p90F0 - baseline.stats.p90F0;
  const sign = (v: number, digits = 1) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleString(localeTag(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[18px] bg-card px-4 py-3 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
        <GitCompareArrows size={14} className="text-accent" />
        {t('analysis.baselineTitle')}
      </span>
      <span className="text-[11px] tabular-nums text-ink-2">
        {t('analysis.baselineDesc', { date: fmtDate(baseline.createdAt), f0: baseline.stats.avgF0.toFixed(1) })}
        {baseline.note ? ` · ${baseline.note}` : ''}
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold tabular-nums">
        <span className={cn(dAvg >= 0 ? 'text-accent' : 'text-accent2')}>
          F0 {sign(dAvg)} Hz
        </span>
        <span className="text-ink-2">
          P10 {sign(dP10, 0)} · P90 {sign(dP90, 0)} Hz
        </span>
      </span>
    </div>
  );
}

/* ------------------------------ 长音分析卡 ------------------------------ */

/** 长音模式专属指标：MPT / 音高稳定度 / 响度衰减 */
function SustainedCard({ record }: { record: AnalysisRecord }) {
  const m = useMemo(() => computeSustainedMetrics(record), [record]);
  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-2.5 flex items-center justify-between px-0.5">
        <span className="text-xs font-semibold text-ink">{t('analysis.sustainedTitle')}</span>
        {record.mode && <span className="text-[10px] text-ink-2">{t(`mode.${record.mode}`)}</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl bg-surface-hi/60 px-4 py-3">
          <Timer size={18} className="shrink-0 text-accent" />
          <div>
            <p className="text-[11px] text-ink-2">{t('analysis.sustainedMpt')}</p>
            <p className="text-lg font-semibold tabular-nums text-ink">
              {t('analysis.mptValue', { n: m.mptSec.toFixed(1) })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-surface-hi/60 px-4 py-3">
          <Activity size={18} className="shrink-0 text-accent" />
          <div>
            <p className="text-[11px] text-ink-2">{t('analysis.sustainedCv')}</p>
            <p className="text-lg font-semibold tabular-nums text-ink">
              {m.cvPct != null ? t('analysis.cvValue', { n: m.cvPct.toFixed(1) }) : '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-surface-hi/60 px-4 py-3">
          <Waves size={18} className="shrink-0 text-accent" />
          <div>
            <p className="text-[11px] text-ink-2">{t('analysis.sustainedDecay')}</p>
            <p className="text-lg font-semibold tabular-nums text-ink">
              {m.decayDbPerSec != null
                ? t('analysis.decayValue', { n: `${m.decayDbPerSec > 0 ? '+' : ''}${m.decayDbPerSec.toFixed(2)}` })
                : '—'}
            </p>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-ink-2">{t('analysis.sustainedExplain')}</p>
    </div>
  );
}

/* ------------------------------ 训练建议（实验性） ------------------------------ */

/** 本地规则引擎生成的训练建议（设置 → 实验性功能 中可关闭） */
function AdviceCard({ record }: { record: AnalysisRecord }) {
  const adviceEnabled = useStore((s) => s.settings.adviceEnabled);
  const targetEnabled = useStore((s) => s.settings.targetEnabled);
  const targetMin = useStore((s) => s.settings.targetF0Min);
  const targetMax = useStore((s) => s.settings.targetF0Max);
  if (!adviceEnabled) return null;
  const tips = buildAdvice(record, { enabled: targetEnabled, min: targetMin, max: targetMax });
  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Lightbulb size={13} className="text-accent" />
          {t('analysis.adviceTitle')}
        </span>
        <span className="text-[10px] text-ink-2">{t('settings.labs')}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {tips.map((tip) => (
          <li key={tip.key} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
            <span>{t(tip.key, tip.params)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-0.5 text-[10px] leading-relaxed text-ink-2">{t('analysis.adviceHint')}</p>
    </div>
  );
}

/* -------------------------------- 录音回放 -------------------------------- */

/** 录音回放条（纯展示）：音频元素由页面层持有，播放头位置驱动全部图表 */
function PlaybackCard({
  url,
  playing,
  position,
  duration,
  onToggle,
  onSeek,
}: {
  url: string | null;
  playing: boolean;
  position: number | null;
  duration: number;
  onToggle: () => void;
  onSeek: (frac: number) => void;
}) {
  if (!url) return null;
  const pos = position ?? 0;
  const frac = duration > 0 ? Math.max(0, Math.min(1, pos / duration)) : 0;
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s - m * 60)).padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3.5 rounded-[18px] bg-card px-4 py-3 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]"
    >
      <button
        onClick={onToggle}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-transform active:scale-90"
        aria-label={playing ? t('analysis.pauseAria') : t('analysis.playAria')}
      >
        {playing ? <Pause size={15} fill="currentColor" strokeWidth={0} /> : <Play size={15} fill="currentColor" strokeWidth={0} className="translate-x-[1px]" />}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(frac * 1000)}
          onChange={(e) => onSeek(Number(e.target.value) / 1000)}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-hi accent-accent"
          aria-label={t('analysis.progressAria')}
        />
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-ink-2">
        {fmt(pos)} / {fmt(duration)}
      </span>
    </motion.div>
  );
}

/* -------------------------------- 统计表格 -------------------------------- */

function StatGroup({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-ink">{title}</p>
      <table className="w-full">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t border-black/[0.04] first:border-t-0">
              <td className="py-1.5 pr-2 text-[11px] text-ink-2">{label}</td>
              <td className="py-1.5 text-right text-xs font-medium tabular-nums text-ink">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtHz(v: number | null | undefined, digits = 1): string {
  return v != null ? `${v.toFixed(digits)} Hz` : '—';
}

function StatsTable({ record }: { record: AnalysisRecord }) {
  const s = record.stats;
  const voicedPct = s.totalSamples ? Math.round((s.voicedSamples / s.totalSamples) * 100) : 0;
  return (
    <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatGroup
        title={t('analysis.groupPitch')}
        rows={[
          [t('analysis.rowAvgF0'), `${s.avgF0.toFixed(1)} Hz（${freqToNote(s.avgF0).name}）`],
          [t('analysis.rowMedianF0'), fmtHz(s.medianF0)],
          [t('analysis.rowMinMaxF0'), `${s.minF0.toFixed(0)} / ${s.maxF0.toFixed(0)} Hz`],
          [t('analysis.rowP10P90'), `${s.p10F0.toFixed(0)} / ${s.p90F0.toFixed(0)} Hz`],
          [t('analysis.rowStdF0'), `${s.stdF0.toFixed(1)} Hz`],
          [t('analysis.rowMalePct'), `${s.malePct}%`],
          [t('analysis.rowFemalePct'), `${s.femalePct}%`],
          [t('analysis.rowTransPct'), `${s.transitionPct}%`],
          ...(s.inTargetPct != null
            ? ([[t('analysis.rowTargetPct'), `${s.inTargetPct}%`]] as [string, ReactNode][])
            : []),
        ]}
      />
      <StatGroup
        title={t('analysis.groupFormant')}
        rows={[
          [t('analysis.rowAvgF1'), fmtHz(s.avgF1, 0)],
          [t('analysis.rowF1Range'), s.f1Range ? `${s.f1Range[0].toFixed(0)} – ${s.f1Range[1].toFixed(0)} Hz` : '—'],
          [t('analysis.rowAvgF2'), fmtHz(s.avgF2, 0)],
          [t('analysis.rowF2Range'), s.f2Range ? `${s.f2Range[0].toFixed(0)} – ${s.f2Range[1].toFixed(0)} Hz` : '—'],
          [t('analysis.rowF1F2Ratio'), s.avgF1 && s.avgF2 ? (s.avgF2 / s.avgF1).toFixed(2) : '—'],
        ]}
      />
      <StatGroup
        title={t('analysis.groupEnergy')}
        rows={[
          [t('analysis.rowDuration'), `${s.durationSec.toFixed(1)} ${t('analysis.unitSec')}`],
          [t('analysis.rowVoicedPct'), `${voicedPct}%`],
          [t('analysis.rowAvgDb'), `${s.avgDb.toFixed(1)} dB`],
          [t('analysis.rowPeakDb'), `${s.peakDb.toFixed(1)} dB`],
          [t('analysis.rowFrames'), `${s.totalSamples}（${s.sampleHz.toFixed(0)} Hz）`],
        ]}
      />
      <StatGroup
        title={t('analysis.groupVq')}
        rows={[
          [t('analysis.rowJitter'), s.jitterPct != null ? `${s.jitterPct.toFixed(2)} %` : '—'],
          [t('analysis.rowShimmer'), s.shimmerPct != null ? `${s.shimmerPct.toFixed(2)} %` : '—'],
          [t('analysis.rowHnr'), s.hnrDb != null ? `${s.hnrDb.toFixed(1)} dB` : '—'],
          [t('analysis.rowCpps'), s.cppsDb != null ? `${s.cppsDb.toFixed(1)} dB` : '—'],
          [t('analysis.rowNote'), <span key="hint" className="text-[10px] font-normal text-ink-2">{t('analysis.vqHint')}</span>],
        ]}
      />
    </div>
  );
}

/* ------------------------------ 图表 + 时间轴 ------------------------------ */

function AnalysisChart({
  kind,
  title,
  right,
  record,
  heightClass,
  range,
  onRangeChange,
  playhead,
}: {
  kind: 'pitch' | 'energy' | 'formant';
  title: string;
  right?: ReactNode;
  record: AnalysisRecord;
  heightClass: string;
  range: [number, number];
  onRangeChange: (r: [number, number]) => void;
  playhead?: number | null;
}) {
  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-xs font-medium tracking-wide text-ink-2">{title}</span>
        {right}
      </div>
      <div className={cn('relative', heightClass)}>
        <SeriesChart kind={kind} series={record.series} range={range} playhead={playhead} />
      </div>
      <TimeRangeSelector
        series={record.series}
        total={record.durationSec}
        value={range}
        onChange={onRangeChange}
        className="mt-2.5"
      />
    </div>
  );
}

/* --------------------------------- 备注编辑 --------------------------------- */

function NoteDialog({
  record,
  open,
  onOpenChange,
}: {
  record: AnalysisRecord;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const updateRecord = useHistoryStore((s) => s.updateRecord);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const [text, setText] = useState(record.note ?? '');
  // 渲染期派生：每次打开对话框时同步为当前记录的备注
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setText(record.note ?? '');
  }

  const save = () => {
    const updated: AnalysisRecord = { ...record, note: text.trim() || undefined };
    updateRecord(updated);
    setCurrentAnalysis(updated);
    onOpenChange(false);
    toast.success(text.trim() ? t('toast.noteSaved') : t('toast.noteCleared'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-0 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink">{t('analysis.noteTitle')}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('analysis.notePlaceholder')}
          className="min-h-24 rounded-2xl border-black/10 bg-surface-hi text-sm text-ink"
          maxLength={60}
        />
        <DialogFooter className="gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="px-1 py-2 text-sm font-medium text-ink-2 transition-opacity hover:opacity-70"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={save}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            {t('common.save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- 页面 --------------------------------- */

function EmptyState() {
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

/** 分析页图表种类（含语谱图/声域图），用于独立时间轴模式 */
type RangedKind = 'pitch' | 'formant' | 'energy' | 'spec' | 'vrp';

export function AnalysisPage() {
  useI18n();
  const record = useStore((s) => s.currentAnalysis);
  const syncChartRange = useStore((s) => s.settings.syncChartRange);
  const baselineId = useStore((s) => s.settings.baselineRecordId);
  const showSpectrogram = useStore((s) => s.settings.showSpectrogram);
  const getAudio = useHistoryStore((s) => s.getAudio);
  const baselineRecord = useHistoryStore((s) =>
    baselineId ? s.records.find((r) => r.id === baselineId) ?? null : null,
  );
  const [sharedRange, setSharedRange] = useState<[number, number]>([0, record?.durationSec ?? 0]);
  const [ownRanges, setOwnRanges] = useState<Partial<Record<RangedKind, [number, number]>>>({});
  const [noteOpen, setNoteOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  /** 共振峰卡片视图：时域曲线 / 元音空间散点 */
  const [formantView, setFormantView] = useState<'curve' | 'scatter'>('curve');

  // 回放：音频元素挂在页面层，播放头位置驱动全部图表
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioFor, setAudioFor] = useState<{ id: string; url: string } | null>(null);
  const [audioDur, setAudioDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playTime, setPlayTime] = useState<number | null>(null);

  const fullRange = useMemo<[number, number]>(() => [0, record?.durationSec ?? 0], [record?.durationSec]);
  const getRange = (kind: RangedKind): [number, number] =>
    syncChartRange ? sharedRange : (ownRanges[kind] ?? fullRange);
  const setRangeFor = (kind: RangedKind, r: [number, number]) => {
    if (syncChartRange) setSharedRange(r);
    else setOwnRanges((prev) => ({ ...prev, [kind]: r }));
  };

  // 切换记录时重置区间与回放位置（渲染期派生重置，避免 effect 级联渲染）
  const [loadedRecordId, setLoadedRecordId] = useState<string | null>(record?.id ?? null);
  if (record && record.id !== loadedRecordId) {
    setLoadedRecordId(record.id);
    setSharedRange([0, record.durationSec]);
    setOwnRanges({});
    setPlayTime(null);
  }

  // 加载当前记录的音频；切换记录时停掉上一条回放（onPause 事件同步状态）
  useEffect(() => {
    if (!record) return;
    let alive = true;
    let created: string | null = null;
    audioRef.current?.pause();
    getAudio(record.id).then((blob) => {
      if (!alive || !blob) return;
      created = URL.createObjectURL(blob);
      setAudioFor({ id: record.id, url: created });
    });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [record?.id, getAudio]); // eslint-disable-line react-hooks/exhaustive-deps
  const audioUrl = audioFor && record && audioFor.id === record.id ? audioFor.url : null;

  // 区间联动统计：跟随音高曲线的区间（联动模式下即共享区间）。
  // 统一由序列重算（含全段）：保证与区间统计口径一致（如响度只计发声帧）；
  // 嗓音质量四项与靶标达成率是整段录音的临床指标，沿用录音时的整段值
  const pitchRange = getRange('pitch');
  const rangeStats = useMemo(() => {
    if (!record) return null;
    const r = syncChartRange ? sharedRange : (ownRanges.pitch ?? fullRange);
    return {
      ...computeStats(sliceSeries(record.series, r[0], r[1]), record.sampleHz),
      jitterPct: record.stats.jitterPct,
      shimmerPct: record.stats.shimmerPct,
      hnrDb: record.stats.hnrDb,
      cppsDb: record.stats.cppsDb,
      inTargetPct: record.stats.inTargetPct,
    };
  }, [record, syncChartRange, sharedRange, ownRanges, fullRange]);

  // 播放终点：选中区间时在其末尾停住，全段交给 ended 事件
  const playEndRef = useRef<number>(Infinity);
  if (record) {
    const [t0, t1] = pitchRange;
    playEndRef.current = t0 > 0.01 || t1 < record.durationSec - 0.01 ? t1 : Infinity;
  }

  // 回放中：rAF 驱动播放头，到达区间末尾自动停止
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const audio = audioRef.current;
      if (audio) {
        const time = audio.currentTime;
        if (playEndRef.current !== Infinity && time >= playEndRef.current - 0.02) {
          audio.pause();
          setPlayTime(playEndRef.current);
          return;
        }
        setPlayTime(time);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  if (!record || !rangeStats) return <EmptyState />;

  const recordWithStats: AnalysisRecord = { ...record, stats: rangeStats };
  const showBaseline = baselineRecord && baselineRecord.id !== record.id
    && (baselineRecord.stats.avgF0 > 0 || record.stats.avgF0 > 0);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (playing) {
      audio.pause();
      return;
    }
    // 媒体尚未开始加载时等一下（正常情况 src 为 blob URL，几乎瞬时就绪）
    if (audio.readyState === 0) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        audio.addEventListener('loadedmetadata', done, { once: true });
        audio.addEventListener('error', done, { once: true });
        setTimeout(done, 2000);
      });
      if (audio.readyState === 0) {
        toast.error(t('toast.playFail'));
        return;
      }
    }
    // 注意：MediaRecorder 录制的流式 webm 其 duration 常为 Infinity，
    // 浏览器播到末尾后才会修正，因此时长未知时不能据此拒绝播放
    const dur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : record.durationSec;
    const [t0, t1] = pitchRange;
    const partial = t0 > 0.01 || t1 < record.durationSec - 0.01;
    const end = partial ? t1 : dur;
    const start = partial ? t0 : 0;
    // 播放头已在末尾（含音频自然播完的 ended 状态）或区间之外时，回到起点重新播放
    const atAudioEnd = audio.ended || (isFinite(audio.duration) && audio.duration > 0 && audio.currentTime >= audio.duration - 0.05);
    if (atAudioEnd || audio.currentTime >= end - 0.05 || audio.currentTime < start - 0.05) {
      audio.currentTime = start;
    }
    setPlayTime(audio.currentTime);
    void audio.play().catch(() => toast.error(t('toast.playFail')));
  };

  const seekPlay = (frac: number) => {
    const audio = audioRef.current;
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
    const time = Math.max(0, Math.min(1, frac)) * audio.duration;
    audio.currentTime = time;
    setPlayTime(time);
  };

  const onShare = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const outcome = await exportShareImage(record);
      if (outcome === 'downloaded') toast.success(t('toast.shareDownloaded'));
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toast.error(t('toast.shareFail'));
    } finally {
      setShareBusy(false);
    }
  };

  const onExportCsv = () => {
    downloadText(`voice-frames-${record.id.slice(0, 8)}.csv`, recordToFrameCsv(record));
    toast.success(t('toast.frameCsvExported'));
  };

  return (
    <div className="flex flex-col gap-3.5">
      <HeroSummary
        record={recordWithStats}
        range={pitchRange}
        actions={
          <>
            <button
              onClick={onShare}
              disabled={shareBusy}
              className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-accent"
              aria-label={t('analysis.shareAria')}
              title={t('analysis.shareTitle')}
            >
              <Share2 size={16} />
            </button>
            <button
              onClick={onExportCsv}
              className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-accent"
              aria-label={t('analysis.csvAria')}
              title={t('analysis.csvTitle')}
            >
              <FileSpreadsheet size={16} />
            </button>
            <button
              onClick={() => setNoteOpen(true)}
              className={cn(
                'grid size-9 place-items-center rounded-full transition-colors hover:bg-surface-hi hover:text-accent',
                record.note ? 'text-accent' : 'text-ink-2',
              )}
              aria-label={t('analysis.noteAria')}
              title={t('analysis.noteAria')}
            >
              <Pencil size={15} />
            </button>
          </>
        }
      />
      {showBaseline && baselineRecord && <BaselineStrip record={record} baseline={baselineRecord} />}
      <PlaybackCard
        url={audioUrl}
        playing={playing}
        position={playTime}
        duration={audioDur || record.durationSec}
        onToggle={togglePlay}
        onSeek={seekPlay}
      />
      {record.mode === 'sustained' && <SustainedCard record={record} />}
      <StatsTable record={recordWithStats} />
      <AdviceCard record={record} />

      <AnalysisChart
        kind="pitch"
        title={t('analysis.titlePitch')}
        record={recordWithStats}
        heightClass="h-[210px] sm:h-[280px]"
        range={getRange('pitch')}
        onRangeChange={(r) => setRangeFor('pitch', r)}
        playhead={playTime}
      />
      {/* 共振峰卡片：曲线 / 元音空间散点双视图 */}
      <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <span className="text-xs font-medium tracking-wide text-ink-2">{t('analysis.titleFormant')}</span>
          <div className="flex shrink-0 items-center gap-2.5">
            {formantView === 'curve' ? (
              <div className="flex items-center gap-3 text-[11px] text-ink-2">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />F1</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent2" />F2</span>
              </div>
            ) : (
              <span className="hidden text-[10px] text-ink-2 sm:inline">{t('analysis.scatterRefHint')}</span>
            )}
            <div className="flex items-center rounded-full bg-surface-hi p-0.5 text-[11px]">
              <button
                onClick={() => setFormantView('curve')}
                className={cn(
                  'rounded-full px-2.5 py-0.5 transition-colors',
                  formantView === 'curve' ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
                )}
              >
                {t('analysis.viewCurve')}
              </button>
              <button
                onClick={() => setFormantView('scatter')}
                className={cn(
                  'rounded-full px-2.5 py-0.5 transition-colors',
                  formantView === 'scatter' ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
                )}
              >
                {t('analysis.viewScatter')}
              </button>
            </div>
          </div>
        </div>
        <div className={cn('relative', formantView === 'scatter' ? 'h-[210px] sm:h-[280px]' : 'h-[150px] sm:h-[200px]')}>
          <SeriesChart
            kind={formantView === 'scatter' ? 'vowelSpace' : 'formant'}
            series={record.series}
            range={getRange('formant')}
            playhead={playTime}
          />
        </div>
        <TimeRangeSelector
          series={record.series}
          total={record.durationSec}
          value={getRange('formant')}
          onChange={(r) => setRangeFor('formant', r)}
          className="mt-2.5"
        />
        {formantView === 'scatter' && (
          <p className="mt-1.5 text-center text-[10px] text-ink-2">
            {t('analysis.scatterExplain')}
          </p>
        )}
      </div>
      <AnalysisChart
        kind="energy"
        title={t('analysis.titleEnergy')}
        record={record}
        heightClass="h-[130px] sm:h-[180px]"
        range={getRange('energy')}
        onRangeChange={(r) => setRangeFor('energy', r)}
        playhead={playTime}
      />
      {record.spec && showSpectrogram && (
        <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
          <div className="mb-1.5 flex items-center justify-between px-0.5">
            <span className="text-xs font-medium tracking-wide text-ink-2">{t('analysis.titleSpec')}</span>
            <div className="flex items-center gap-3 text-[11px] text-ink-2">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />{t('analysis.specF1Legend')}</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent2" />{t('analysis.specF2Legend')}</span>
            </div>
          </div>
          <div className="relative h-[190px] sm:h-[260px]">
            <SpecChart record={record} range={getRange('spec')} playhead={playTime} />
          </div>
          <TimeRangeSelector
            series={record.series}
            total={record.durationSec}
            value={getRange('spec')}
            onChange={(r) => setRangeFor('spec', r)}
            className="mt-2.5"
          />
        </div>
      )}
      {/* 声域图（VRP）：仅滑音模式记录显示 */}
      {record.mode === 'glide' && (
        <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
          <div className="mb-1.5 flex items-center justify-between px-0.5">
            <span className="text-xs font-medium tracking-wide text-ink-2">{t('analysis.titleVrp')}</span>
            <span className="text-[10px] text-ink-2">{t('analysis.vrpDepthHint')}</span>
          </div>
          <div className="relative h-[260px] sm:h-[340px]">
            <SeriesChart
              kind="vrp"
              series={record.series}
              range={getRange('vrp')}
              playhead={playTime}
            />
          </div>
          <TimeRangeSelector
            series={record.series}
            total={record.durationSec}
            value={getRange('vrp')}
            onChange={(r) => setRangeFor('vrp', r)}
            className="mt-2.5"
          />
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-2">
            {t('analysis.vrpExplain')}
          </p>
        </div>
      )}

      <NoteDialog record={record} open={noteOpen} onOpenChange={setNoteOpen} />

      {/* 回放音频源（页面级，播放头位置由 rAF 循环同步到各图表） */}
      <audio
        ref={audioRef}
        src={audioUrl ?? undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPlayTime(null);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (isFinite(d) && d > 0) setAudioDur(d);
        }}
        className="hidden"
      />
    </div>
  );
}
