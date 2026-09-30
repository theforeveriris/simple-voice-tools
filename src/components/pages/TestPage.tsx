/**
 * 测试页面
 * 由上到下：模式引导横幅（朗读文本 / 长音 / 滑音）→
 *   F1/F2 共振峰曲线（较矮） → 音频能量图（较矮） → 音高曲线图（较高）
 * 三张图随录音时间推进实时滚动更新；
 * 短按圆球以当前模式开始录音，长按弹出模式选择，结束后自动进入分析页。
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Mic, AudioWaveform, BookOpenText, AudioLines, TrendingUp, ChevronDown } from 'lucide-react';
import { SeriesChart } from '@/components/charts/SeriesChart';
import { recorder } from '@/lib/audio/recorder';
import { freqToNote, MODE_META } from '@/constants';
import { pickPassage, type ReadingPassage } from '@/lib/texts';
import { useStore } from '@/store/useStore';
import type { TestMode } from '@/types';
import { cn } from '@/lib/utils';

/** 图表卡片容器：白底、微圆角、无边框、微阴影 */
function ChartCard({
  title,
  right,
  children,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-col rounded-[22px] bg-card p-3.5 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]',
        className,
      )}
    >
      <div className="mb-1.5 flex shrink-0 items-center justify-between px-0.5">
        <span className="text-xs font-medium tracking-wide text-ink-2">{title}</span>
        {right}
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

/** 音高图右上角的实时读数（Hz + 钢琴音高），约 8Hz 刷新避免频繁重渲染 */
function LivePitchReadout() {
  const isRecording = useStore((s) => s.isRecording);
  // 非录音态直接静态渲染，避免 effect 内同步重置状态
  if (!isRecording) {
    return (
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-sm text-ink-2">— Hz</span>
      </div>
    );
  }
  return <LiveReadout />;
}

function LiveReadout() {
  const [readout, setReadout] = useState<{ freq: number; note: string } | null>(null);

  useEffect(() => {
    let raf = 0;
    let lastUpdate = 0;
    const loop = (now: number) => {
      if (now - lastUpdate > 120) {
        lastUpdate = now;
        const pitch = recorder.lastPitch;
        setReadout(pitch ? { freq: pitch.freq, note: freqToNote(pitch.freq).name } : null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex items-baseline gap-2 tabular-nums">
      {readout ? (
        <>
          <span className="text-lg font-semibold text-ink">{readout.freq.toFixed(1)}</span>
          <span className="text-[11px] text-ink-2">Hz</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-on-accent-soft">
            {readout.note}
          </span>
        </>
      ) : (
        <span className="text-sm text-ink-2">— Hz</span>
      )}
    </div>
  );
}

/** 共振峰图例 */
function FormantLegend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-ink-2">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-accent" /> F1
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-accent2" /> F2
      </span>
    </div>
  );
}

/** 未录音时的图表占位提示 */
function IdleHint() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="flex flex-col items-center gap-2 text-ink-2">
        <Mic size={22} strokeWidth={1.6} />
        <p className="text-xs">点击右下角的圆球按钮开始测试</p>
      </div>
    </div>
  );
}

/** 录音已用时长（约 10Hz 刷新，用于引导进度条；非录音态派生为 0） */
function useRecordingElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      if (now - last > 100) {
        last = now;
        setElapsed(recorder.getLive().elapsedSec);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return active ? elapsed : 0;
}

/** 朗读引导横幅：《飞鸟集》随机段落，可折叠给图表让空间（折叠状态由页面持有） */
function ReadingBanner({
  isRecording,
  collapsed,
  onToggle,
}: {
  isRecording: boolean;
  collapsed: boolean;
  onToggle: (v: boolean) => void;
}) {
  const [passage, setPassage] = useState<ReadingPassage>(() => pickPassage());
  // 渲染期派生：录音开始的瞬间换一段，保证多次测试语料有变化
  const [wasRecording, setWasRecording] = useState(false);
  if (isRecording !== wasRecording) {
    setWasRecording(isRecording);
    if (isRecording) setPassage((prev) => pickPassage(prev.id));
  }

  return (
    <div className="shrink-0 rounded-[18px] bg-card p-3 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <button
        onClick={() => onToggle(!collapsed)}
        className="flex w-full items-center gap-2 text-left"
        aria-label={collapsed ? '展开朗读文本' : '收起朗读文本'}
      >
        <BookOpenText size={14} className="shrink-0 text-accent" />
        <span className="text-xs font-semibold text-ink">朗读引导 · 飞鸟集</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
          距离麦克风 20–30 厘米，用正常音量朗读
        </span>
        <ChevronDown
          size={14}
          className={cn('shrink-0 text-ink-2 transition-transform duration-200', collapsed ? '' : 'rotate-180')}
        />
      </button>
      {!collapsed && (
        <div className="mt-1.5 space-y-0.5 pl-6">
          {passage.lines.map((line, i) => (
            <p key={i} className="text-[13px] leading-snug text-ink">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** 长音 / 滑音引导横幅：模式说明 + 录音进度 */
function ModeGuideBanner({ mode, isRecording }: { mode: Exclude<TestMode, 'reading'>; isRecording: boolean }) {
  const meta = MODE_META[mode];
  const elapsed = useRecordingElapsed(isRecording);
  const Icon = mode === 'sustained' ? AudioLines : TrendingUp;
  const progress = meta.autoStopSec > 0 ? Math.min(1, elapsed / meta.autoStopSec) : 0;

  return (
    <div className="shrink-0 rounded-[18px] bg-card p-3 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="flex items-center gap-2">
        <Icon size={14} className="shrink-0 text-accent" />
        <span className="text-xs font-semibold text-ink">{meta.label}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">{meta.desc}</span>
        {isRecording && (
          <span className="shrink-0 text-[11px] tabular-nums text-ink-2">
            {Math.floor(elapsed)}s / {meta.autoStopSec}s
          </span>
        )}
      </div>
      {isRecording && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-hi">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function TestPage() {
  const isRecording = useStore((s) => s.isRecording);
  const mode = useStore((s) => s.settings.testMode);
  const setTab = useStore((s) => s.setTab);
  // 非录音状态下显示占位提示
  const showHint = !isRecording;
  // 朗读横幅折叠状态提升到页面：折叠后让出的空间优先分给前两个图表
  const [bannerCollapsed, setBannerCollapsed] = useState(false);
  const bannerShort = mode === 'reading' && bannerCollapsed;
  // 图表延迟挂载：三张 Canvas 的 rAF 绘制循环会占用主线程，
  // 推迟到页面入场与底栏弹簧动画结束（约 300ms）后再启动，保证动效满帧
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setChartsReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    // 高度下探到距底栏约 12px（页头 pt-7 + 底栏顶 4.75rem + 间距 0.75rem = 7.25rem），
    // -mb-14 抵消 main 的 pb-36 中多余部分，页面不产生滚动；
    // 三张图按比例分配剩余空间，横幅收起时用更高的 min-h 优先加高前两图
    <div className="-mb-14 flex h-[calc(100dvh-7.25rem)] min-h-[360px] flex-col gap-3 sm:gap-3.5">
      {/* 页头 */}
      <div className="flex shrink-0 items-end justify-between pt-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">语音测试</h1>
          <p className="mt-0.5 text-xs text-ink-2">长按圆球可切换模式，录音结束自动生成分析</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setTab('analysis')}
          className="hidden items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70 sm:flex"
        >
          <AudioWaveform size={14} />
          查看最近分析
        </motion.button>
      </div>

      {/* 模式引导横幅 */}
      {mode === 'reading' ? (
        <ReadingBanner isRecording={isRecording} collapsed={bannerCollapsed} onToggle={setBannerCollapsed} />
      ) : (
        <ModeGuideBanner mode={mode} isRecording={isRecording} />
      )}

      {/* 三张图按 6 : 5 : 12 分配剩余高度（basis-0 使比例不受内容影响）；
          朗读横幅收起时以更高的 min-h 锁定前两图增量，音高图只取剩余不缩水 */}
      {/* F1 / F2 共振峰 */}
      <ChartCard
        title="F1 / F2 共振峰曲线"
        right={<FormantLegend />}
        className={cn(
          'shrink basis-0 grow-[6] transition-all duration-300',
          bannerShort ? 'min-h-[180px] sm:min-h-[160px]' : 'min-h-[72px]',
        )}
      >
        {chartsReady && <SeriesChart kind="formant" live />}
        {showHint && <IdleHint />}
      </ChartCard>

      {/* 音频能量 */}
      <ChartCard
        title="音频能量"
        className={cn(
          'shrink basis-0 grow-[5] transition-all duration-300',
          bannerShort ? 'min-h-[150px] sm:min-h-[135px]' : 'min-h-[60px]',
        )}
      >
        {chartsReady && <SeriesChart kind="energy" live />}
        {showHint && <IdleHint />}
      </ChartCard>

      {/* 音高曲线 */}
      <ChartCard
        title="音高曲线"
        right={<LivePitchReadout />}
        className="min-h-[130px] shrink basis-0 grow-[12] transition-all duration-300"
      >
        {chartsReady && <SeriesChart kind="pitch" live />}
        {showHint && <IdleHint />}
      </ChartCard>
    </div>
  );
}
