/**
 * 分析页面
 * 结构（自上而下）：
 *   1. 声纹概览卡：平均基频 + 音域标尺（在男女声区间上的位置可视化）
 *   2. 统计表格：音高 / 共振峰 / 能量三组数据
 *   3. 三个图表（共振峰、能量、音高），每个图表下方有
 *      双滑块时间轴区间选择器，可缩放查看任意时间窗。
 *
 * 未经过录音直接进入时显示空态提示。
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChartNoAxesColumn, ChevronRight, Sparkles } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { createDemoRecord } from '@/lib/audio/demo';
import { SeriesChart } from '@/components/charts/SeriesChart';
import { TimeRangeSelector } from '@/components/charts/TimeRangeSelector';
import { freqToNote, bandOf, BAND_COLORS, BAND_LABELS } from '@/constants';
import type { AnalysisRecord } from '@/types';
import { cn } from '@/lib/utils';

/* ------------------------------- 音域标尺 ------------------------------- */

/** 对数刻度：60–520Hz 映射到 0–100% */
const RULER_MIN = 60;
const RULER_MAX = 520;
const posPct = (f: number) => ((Math.log(f / RULER_MIN) / Math.log(RULER_MAX / RULER_MIN)) * 100).toFixed(2);

/**
 * 音域标尺：在男/女声区色带上标出本次录音的
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
        {/* P10–P90 音域括条 */}
        <div
          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-[0_0_0_1px_rgba(40,38,52,0.35)] transition-all duration-700"
          style={{
            left: `${posPct(Math.max(RULER_MIN, p10F0))}%`,
            width: `${Number(posPct(Math.min(RULER_MAX, p90F0))) - Number(posPct(Math.max(RULER_MIN, p10F0)))}%`,
            background: 'rgba(40,38,52,0.28)',
          }}
        />
        {/* 平均基频游标 */}
        <div
          className="absolute top-1/2 z-10 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow ring-2 ring-white transition-all duration-700"
          style={{ left: `${posPct(Math.min(RULER_MAX, Math.max(RULER_MIN, avgF0)))}%` }}
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
        <span className="text-ink-2">音域 P10–P90：<span className="tabular-nums text-ink">{p10F0.toFixed(0)}–{p90F0.toFixed(0)} Hz</span></span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
          <span className="size-1.5 rounded-full" style={{ background: BAND_COLORS[band] }} />
          {BAND_LABELS[band]}
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

function HeroSummary({ record }: { record: AnalysisRecord }) {
  const { avgF0 } = record.stats;
  const note = freqToNote(avgF0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="rounded-[22px] bg-card p-5 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-40">
          <p className="flex items-center gap-1 text-xs text-ink-2">
            <Sparkles size={12} className="text-accent" />
            平均基频
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight tabular-nums text-ink">
              {avgF0.toFixed(1)}
            </span>
            <span className="text-sm text-ink-2">Hz</span>
            <span className="text-sm font-semibold text-accent">{note.name}</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-2">
            音高偏差 {note.cents >= 0 ? '+' : ''}{note.cents} cents · 基于全部有声帧
          </p>
        </div>
        <div className="min-w-[280px] flex-1 lg:max-w-md">
          <RangeRuler record={record} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <StatChip label="录音时长" value={`${record.stats.durationSec.toFixed(1)} 秒`} />
        <StatChip label="平均 F1" value={record.stats.avgF1 != null ? `${record.stats.avgF1.toFixed(0)} Hz` : '—'} />
        <StatChip label="平均 F2" value={record.stats.avgF2 != null ? `${record.stats.avgF2.toFixed(0)} Hz` : '—'} />
        <StatChip label="平均响度" value={`${record.stats.avgDb.toFixed(1)} dB`} />
      </div>
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
    <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatGroup
        title="音高统计"
        rows={[
          ['平均基频', `${s.avgF0.toFixed(1)} Hz（${freqToNote(s.avgF0).name}）`],
          ['中位基频', fmtHz(s.medianF0)],
          ['最低 / 最高', `${s.minF0.toFixed(0)} / ${s.maxF0.toFixed(0)} Hz`],
          ['P10 / P90', `${s.p10F0.toFixed(0)} / ${s.p90F0.toFixed(0)} Hz`],
          ['基频标准差', `${s.stdF0.toFixed(1)} Hz`],
          ['男声区占比', `${s.malePct}%`],
          ['女声区占比', `${s.femalePct}%`],
          ['过渡区占比', `${s.transitionPct}%`],
        ]}
      />
      <StatGroup
        title="共振峰统计"
        rows={[
          ['平均 F1', fmtHz(s.avgF1, 0)],
          ['F1 波动范围', s.f1Range ? `${s.f1Range[0].toFixed(0)} – ${s.f1Range[1].toFixed(0)} Hz` : '—'],
          ['平均 F2', fmtHz(s.avgF2, 0)],
          ['F2 波动范围', s.f2Range ? `${s.f2Range[0].toFixed(0)} – ${s.f2Range[1].toFixed(0)} Hz` : '—'],
          ['F1 / F2 比值', s.avgF1 && s.avgF2 ? (s.avgF2 / s.avgF1).toFixed(2) : '—'],
        ]}
      />
      <StatGroup
        title="能量与时长"
        rows={[
          ['录音时长', `${s.durationSec.toFixed(1)} 秒`],
          ['有效发声占比', `${voicedPct}%`],
          ['平均响度', `${s.avgDb.toFixed(1)} dB`],
          ['峰值响度', `${s.peakDb.toFixed(1)} dB`],
          ['采样帧数', `${s.totalSamples}（${s.sampleHz.toFixed(0)} Hz）`],
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
}: {
  kind: 'pitch' | 'energy' | 'formant';
  title: string;
  right?: ReactNode;
  record: AnalysisRecord;
  heightClass: string;
}) {
  const total = record.durationSec;
  const [range, setRange] = useState<[number, number]>([0, total]);
  useEffect(() => setRange([0, total]), [record.id, total]);

  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-xs font-medium tracking-wide text-ink-2">{title}</span>
        {right}
      </div>
      <div className={cn('relative', heightClass)}>
        <SeriesChart kind={kind} series={record.series} range={range} />
      </div>
      <TimeRangeSelector
        series={record.series}
        total={total}
        value={range}
        onChange={setRange}
        className="mt-2.5"
      />
    </div>
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
        <p className="text-sm text-ink-2">请先进行测试以获得数据进行分析</p>
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={() => setTab('test')}
            className="flex items-center gap-1 px-1 py-2 text-sm font-medium text-accent transition-opacity hover:opacity-70"
          >
            去测试
            <ChevronRight size={15} />
          </button>
          <button
            onClick={loadDemo}
            className="px-1 py-2 text-sm font-medium text-ink-2 transition-opacity hover:opacity-70"
          >
            载入示例数据
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function AnalysisPage() {
  const record = useStore((s) => s.currentAnalysis);
  if (!record) return <EmptyState />;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="pt-1">
        <h1 className="text-xl font-semibold tracking-tight text-ink">分析报告</h1>
        <p className="mt-0.5 text-xs text-ink-2">
          {new Date(record.createdAt).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          的录音 · 拖动图表下方的时间轴可缩放查看区间
        </p>
      </div>

      <HeroSummary record={record} />
      <StatsTable record={record} />

      <AnalysisChart
        kind="pitch"
        title="音高曲线"
        record={record}
        heightClass="h-[210px] sm:h-[280px]"
      />
      <AnalysisChart
        kind="formant"
        title="F1 / F2 共振峰"
        right={
          <div className="flex items-center gap-3 text-[11px] text-ink-2">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />F1</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent2" />F2</span>
          </div>
        }
        record={record}
        heightClass="h-[150px] sm:h-[200px]"
      />
      <AnalysisChart
        kind="energy"
        title="音频能量"
        record={record}
        heightClass="h-[130px] sm:h-[180px]"
      />
    </div>
  );
}
