/**
 * 测试页面
 * 由上到下三个圆角矩形图表区：
 *   F1/F2 共振峰曲线（较矮） → 音频能量图（较矮） → 音高曲线图（较高）
 * 三张图随录音时间推进实时滚动更新；
 * 点击右下角悬浮圆球开始 / 停止录音，结束后自动进入分析页。
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Mic, AudioWaveform } from 'lucide-react';
import { SeriesChart } from '@/components/charts/SeriesChart';
import { recorder } from '@/lib/audio/recorder';
import { freqToNote } from '@/constants';
import { useStore } from '@/store/useStore';
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
  const [readout, setReadout] = useState<{ freq: number; note: string } | null>(null);

  useEffect(() => {
    if (!isRecording) {
      setReadout(null);
      return;
    }
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
  }, [isRecording]);

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

export function TestPage() {
  const isRecording = useStore((s) => s.isRecording);
  const setTab = useStore((s) => s.setTab);
  // 非录音状态下显示占位提示
  const showHint = !isRecording;
  // 图表延迟挂载：三张 Canvas 的 rAF 绘制循环会占用主线程，
  // 推迟到页面入场与底栏弹簧动画结束（约 300ms）后再启动，保证动效满帧
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setChartsReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-[calc(100dvh-10.75rem)] min-h-[440px] flex-col gap-3 sm:gap-3.5">
      {/* 页头 */}
      <div className="flex shrink-0 items-end justify-between pt-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">语音测试</h1>
          <p className="mt-0.5 text-xs text-ink-2">
            距离麦克风 20–30 厘米，用正常音量持续说话或朗读
          </p>
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

      {/* F1 / F2 共振峰 */}
      <ChartCard
        title="F1 / F2 共振峰曲线"
        right={<FormantLegend />}
        className="h-[124px] shrink-0 sm:h-[168px]"
      >
        {chartsReady && <SeriesChart kind="formant" live />}
        {showHint && <IdleHint />}
      </ChartCard>

      {/* 音频能量 */}
      <ChartCard title="音频能量" className="h-[104px] shrink-0 sm:h-[148px]">
        {chartsReady && <SeriesChart kind="energy" live />}
        {showHint && <IdleHint />}
      </ChartCard>

      {/* 音高曲线 */}
      <ChartCard
        title="音高曲线"
        right={<LivePitchReadout />}
        className="min-h-[190px] flex-1 sm:min-h-[240px]"
      >
        {chartsReady && <SeriesChart kind="pitch" live />}
        {showHint && <IdleHint />}
      </ChartCard>
    </div>
  );
}
