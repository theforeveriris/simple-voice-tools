/**
 * 分析页面
 * 结构（自上而下）：
 *   1. 页头：日期 / 模式徽标 + 分享图 / CSV / 备注操作
 *   2. 声纹概览卡：平均基频 + 音域标尺（跟随当前查看区间）
 *   3. 录音回放条（保存过音频时显示）
 *   4. 统计表格：音高 / 共振峰 / 能量 / 嗓音质量四组（跟随区间）
 *   5. 四个图表（音高、共振峰、能量、语谱图），共享同一个
 *      时间轴区间选择（任一图表下方拖动，全部同步 + 统计联动）。
 *
 * 未经过录音直接进入时显示空态提示。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ChartNoAxesColumn, ChevronRight, Sparkles, Play, Pause, Share2,
  FileSpreadsheet, Pencil, Music2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { createDemoRecord } from '@/lib/audio/demo';
import { computeStats } from '@/lib/audio/recorder';
import { recordToFrameCsv, downloadText } from '@/lib/export/csv';
import { exportShareImage } from '@/lib/export/shareCard';
import { SeriesChart } from '@/components/charts/SeriesChart';
import { SpecChart } from '@/components/charts/SpecChart';
import { TimeRangeSelector } from '@/components/charts/TimeRangeSelector';
import { freqToNote, bandOf, BAND_COLORS, BAND_LABELS, MODE_META } from '@/constants';
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

function HeroSummary({ record, range }: { record: AnalysisRecord; range: [number, number] }) {
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
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-40">
          <p className="flex items-center gap-1 text-xs text-ink-2">
            <Sparkles size={12} className="text-accent" />
            平均基频
            <span className="ml-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-on-accent-soft">
              {isPartial ? `区间 ${fmt(range[0])}–${fmt(range[1])}` : '全段'}
            </span>
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight tabular-nums text-ink">
              {avgF0.toFixed(1)}
            </span>
            <span className="text-sm text-ink-2">Hz</span>
            <span className="text-sm font-semibold text-accent">{note.name}</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-2">
            音高偏差 {note.cents >= 0 ? '+' : ''}{note.cents} cents · 基于当前区间有声帧
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
        aria-label={playing ? '暂停回放' : '播放录音'}
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
          aria-label="回放进度"
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
      <StatGroup
        title="嗓音质量"
        rows={[
          ['Jitter（基频微扰）', s.jitterPct != null ? `${s.jitterPct.toFixed(2)} %` : '—'],
          ['Shimmer（振幅微扰）', s.shimmerPct != null ? `${s.shimmerPct.toFixed(2)} %` : '—'],
          ['HNR（谐噪比）', s.hnrDb != null ? `${s.hnrDb.toFixed(1)} dB` : '—'],
          ['说明', <span key="hint" className="text-[10px] font-normal text-ink-2">需保存录音音频</span>],
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
    toast.success(text.trim() ? '已保存备注' : '已清除备注');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-0 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink">编辑备注</DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="给这条记录起个名字，如「晨起嗓音」「训练第 3 周」"
          className="min-h-24 rounded-2xl border-black/10 bg-surface-hi text-sm text-ink"
          maxLength={60}
        />
        <DialogFooter className="gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="px-1 py-2 text-sm font-medium text-ink-2 transition-opacity hover:opacity-70"
          >
            取消
          </button>
          <button
            onClick={save}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            保存
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

/** 分析页图表种类（含语谱图），用于独立时间轴模式 */
type RangedKind = 'pitch' | 'formant' | 'energy' | 'spec';

export function AnalysisPage() {
  const record = useStore((s) => s.currentAnalysis);
  const syncChartRange = useStore((s) => s.settings.syncChartRange);
  const getAudio = useHistoryStore((s) => s.getAudio);
  const [sharedRange, setSharedRange] = useState<[number, number]>([0, record?.durationSec ?? 0]);
  const [ownRanges, setOwnRanges] = useState<Partial<Record<RangedKind, [number, number]>>>({});
  const [noteOpen, setNoteOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

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

  // 区间联动统计：跟随音高曲线的区间（联动模式下即共享区间）
  const pitchRange = getRange('pitch');
  const rangeStats = useMemo(() => {
    if (!record) return null;
    const r = syncChartRange ? sharedRange : (ownRanges.pitch ?? fullRange);
    const isFull = r[0] <= 0.001 && r[1] >= record.durationSec - 0.001;
    if (isFull) return record.stats;
    // 嗓音质量三项是整段录音的临床指标，不随区间重算，沿用全段值
    return {
      ...computeStats(sliceSeries(record.series, r[0], r[1]), record.sampleHz),
      jitterPct: record.stats.jitterPct,
      shimmerPct: record.stats.shimmerPct,
      hnrDb: record.stats.hnrDb,
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
        const t = audio.currentTime;
        if (playEndRef.current !== Infinity && t >= playEndRef.current - 0.02) {
          audio.pause();
          setPlayTime(playEndRef.current);
          return;
        }
        setPlayTime(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  if (!record || !rangeStats) return <EmptyState />;

  const recordWithStats: AnalysisRecord = { ...record, stats: rangeStats };

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
        toast.error('回放失败，音频无法解码');
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
    void audio.play().catch(() => toast.error('回放失败，音频无法解码'));
  };

  const seekPlay = (frac: number) => {
    const audio = audioRef.current;
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
    const t = Math.max(0, Math.min(1, frac)) * audio.duration;
    audio.currentTime = t;
    setPlayTime(t);
  };

  const onShare = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const outcome = await exportShareImage(record);
      if (outcome === 'downloaded') toast.success('报告图已生成并下载');
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toast.error('分享图生成失败');
    } finally {
      setShareBusy(false);
    }
  };

  const onExportCsv = () => {
    downloadText(`voice-frames-${record.id.slice(0, 8)}.csv`, recordToFrameCsv(record));
    toast.success('已导出帧级 CSV 数据');
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="pt-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">分析报告</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-2">
              {new Date(record.createdAt).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              的录音
              {record.mode && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-on-accent-soft">
                  <Music2 size={9} />
                  {MODE_META[record.mode].label}
                </span>
              )}
              · {syncChartRange ? '统计与图表随下方时间轴联动' : '各图表时间轴可独立缩放'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={onShare}
              disabled={shareBusy}
              className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-accent"
              aria-label="导出分享图片"
              title="导出分享图片（PNG）"
            >
              <Share2 size={16} />
            </button>
            <button
              onClick={onExportCsv}
              className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-accent"
              aria-label="导出帧级 CSV"
              title="导出帧级 CSV 数据"
            >
              <FileSpreadsheet size={16} />
            </button>
            <button
              onClick={() => setNoteOpen(true)}
              className={cn(
                'grid size-9 place-items-center rounded-full transition-colors hover:bg-surface-hi hover:text-accent',
                record.note ? 'text-accent' : 'text-ink-2',
              )}
              aria-label="编辑备注"
              title="编辑备注"
            >
              <Pencil size={15} />
            </button>
          </div>
        </div>
        {record.note && (
          <p className="mt-1.5 rounded-lg bg-accent-soft/60 px-2.5 py-1 text-xs text-on-accent-soft">
            📎 {record.note}
          </p>
        )}
      </div>

      <HeroSummary record={recordWithStats} range={pitchRange} />
      <PlaybackCard
        url={audioUrl}
        playing={playing}
        position={playTime}
        duration={audioDur || record.durationSec}
        onToggle={togglePlay}
        onSeek={seekPlay}
      />
      <StatsTable record={recordWithStats} />

      <AnalysisChart
        kind="pitch"
        title="音高曲线"
        record={recordWithStats}
        heightClass="h-[210px] sm:h-[280px]"
        range={getRange('pitch')}
        onRangeChange={(r) => setRangeFor('pitch', r)}
        playhead={playTime}
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
        range={getRange('formant')}
        onRangeChange={(r) => setRangeFor('formant', r)}
        playhead={playTime}
      />
      <AnalysisChart
        kind="energy"
        title="音频能量"
        record={record}
        heightClass="h-[130px] sm:h-[180px]"
        range={getRange('energy')}
        onRangeChange={(r) => setRangeFor('energy', r)}
        playhead={playTime}
      />
      {record.spec && (
        <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
          <div className="mb-1.5 flex items-center justify-between px-0.5">
            <span className="text-xs font-medium tracking-wide text-ink-2">语谱图</span>
            <div className="flex items-center gap-3 text-[11px] text-ink-2">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />F1 轨迹</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent2" />F2 轨迹</span>
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
