/**
 * 测试页面
 * 由上到下：模式提示文字（极简，无卡片）→
 *   F1/F2 共振峰曲线 → 音频能量图 → 音高曲线图
 * 三张图按比例分配剩余高度，随录音时间推进实时滚动更新；
 * 短按圆球以当前模式开始录音，长按弹出模式选择，结束后自动进入分析页。
 * 训练靶标启用时：音高图叠加目标带，右上角显示实时偏差与区间达成率。
 */

import { useEffect, useState } from 'react';
import { SeriesChart } from '@/components/charts/SeriesChart';
import { LiveSpectrum } from '@/components/charts/LiveSpectrum';
import { recorder } from '@/lib/audio/recorder';
import { freqToNote } from '@/constants';
import { useStore } from '@/store/useStore';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { VowelLiveSheet } from './VowelLiveSheet';
import type { TestMode } from '@/types';
import { cn } from '@/lib/utils';
import { LocateFixed } from 'lucide-react';

/** 图表卡片容器：白底、微圆角、无边框、微阴影 */
function ChartCard({
  title,
  right,
  children,
  className,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
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

/** 音高图右上角的实时读数（Hz + 钢琴音高 + 靶标偏差），约 8Hz 刷新避免频繁重渲染 */
function LivePitchReadout() {
  const isRecording = useStore((s) => s.isRecording);
  // 非录音态直接静态渲染，避免 effect 内同步重置状态
  if (!isRecording) {
    return (
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-sm text-ink-2">{t('test.noReading')}</span>
      </div>
    );
  }
  return <LiveReadout />;
}

/** 实时读数 + 训练靶标反馈（偏差/达标）+ 区间达成率 */
function LiveReadout() {
  useI18n();
  const targetEnabled = useStore((s) => s.settings.targetEnabled);
  const targetMin = useStore((s) => s.settings.targetF0Min);
  const targetMax = useStore((s) => s.settings.targetF0Max);
  const [readout, setReadout] = useState<{
    freq: number; note: string; inPct: number;
  } | null>(null);

  useEffect(() => {
    let raf = 0;
    let lastUpdate = 0;
    const loop = (now: number) => {
      if (now - lastUpdate > 120) {
        lastUpdate = now;
        const pitch = recorder.lastPitch;
        // 区间达成率：对当前实时缓冲统计（约 8Hz 重算足够）
        let inPct: number | null = null;
        if (targetEnabled) {
          const live = recorder.getLive();
          let voiced = 0;
          let inside = 0;
          for (const f of live.f0) {
            if (!isFinite(f) || f <= 0) continue;
            voiced++;
            if (f >= targetMin && f <= targetMax) inside++;
          }
          if (voiced > 0) inPct = Math.round((inside / voiced) * 100);
        }
        setReadout({
          freq: pitch ? pitch.freq : 0,
          note: pitch ? freqToNote(pitch.freq).name : '',
          inPct: inPct ?? -1,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [targetEnabled, targetMin, targetMax]);

  const pitch = readout && readout.note ? readout : null;
  const inTarget = pitch != null && pitch.freq >= targetMin && pitch.freq <= targetMax;
  const deviation = pitch == null ? 0 : pitch.freq < targetMin ? pitch.freq - targetMin : pitch.freq - targetMax;

  return (
    <div className="flex items-center gap-2.5">
      {targetEnabled && readout && readout.inPct >= 0 && (
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold tabular-nums text-on-accent-soft">
          {t('test.inTargetPct', { pct: readout.inPct })}
        </span>
      )}
      <div className="flex items-baseline gap-2 tabular-nums">
        {pitch ? (
          <>
            <span className="text-lg font-semibold text-ink">{pitch.freq.toFixed(1)}</span>
            <span className="text-[11px] text-ink-2">Hz</span>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-on-accent-soft">
              {pitch.note}
            </span>
            {targetEnabled && (
              <span
                className={cn(
                  'text-[11px] font-semibold tabular-nums',
                  inTarget ? 'text-accent' : 'text-ink-2',
                )}
              >
                {inTarget
                  ? t('test.inTargetOn')
                  : t(deviation < 0 ? 'test.inTargetBelow' : 'test.inTargetAbove', { hz: Math.abs(Math.round(deviation)) })}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-ink-2">{t('test.noReading')}</span>
        )}
      </div>
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

/** 各模式的一句提示（极简文字，无卡片） */
const MODE_HINT_KEY: Record<TestMode, 'test.hintReading' | 'test.hintSustained' | 'test.hintGlide'> = {
  reading: 'test.hintReading',
  sustained: 'test.hintSustained',
  glide: 'test.hintGlide',
};

function ModeHint({ mode }: { mode: TestMode }) {
  return (
    <p className="mx-auto w-[60%] py-0.5 text-center text-xs text-ink-2">{t(MODE_HINT_KEY[mode])}</p>
  );
}

export function TestPage() {
  useI18n();
  const mode = useStore((s) => s.settings.testMode);
  const targetEnabled = useStore((s) => s.settings.targetEnabled);
  const targetMin = useStore((s) => s.settings.targetF0Min);
  const targetMax = useStore((s) => s.settings.targetF0Max);
  const liveSpectrum = useStore((s) => s.settings.liveSpectrum);
  const [vowelLiveOpen, setVowelLiveOpen] = useState(false);
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
    // 三张图按 6 : 5 : 12 分配剩余高度（basis-0 使比例不受内容影响，min-h 防塌缩）；
    // 开启实时频谱（实验性）时追加第四张，压缩其余图的比例
    <div className="-mb-14 flex h-[calc(100dvh-7.25rem)] min-h-[360px] flex-col gap-3 sm:gap-3.5">
      {/* 模式提示（极简文字） */}
      <ModeHint mode={mode} />

      {/* F1 / F2 共振峰 */}
      <ChartCard
        title={t('test.titleFormant')}
        right={
          <div className="flex items-center gap-1.5">
            <FormantLegend />
            <button
              onClick={() => setVowelLiveOpen(true)}
              className="grid size-7 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-accent"
              aria-label={t('vowelLive.openAria')}
              title={t('vowelLive.title')}
            >
              <LocateFixed size={14} />
            </button>
          </div>
        }
        className="min-h-[72px] shrink basis-0 grow-[6]"
      >
        {chartsReady && <SeriesChart kind="formant" live />}
      </ChartCard>

      {/* 音频能量 */}
      <ChartCard title={t('test.titleEnergy')} className="min-h-[60px] shrink basis-0 grow-[5]">
        {chartsReady && <SeriesChart kind="energy" live />}
      </ChartCard>

      {/* 音高曲线 */}
      <ChartCard
        title={t('test.titlePitch')}
        right={
          <div className="flex items-center gap-2">
            {targetEnabled && (
              <span className="hidden text-[10px] tabular-nums text-ink-2 sm:inline">
                {t('test.targetLegend', { min: targetMin, max: targetMax })}
              </span>
            )}
            <LivePitchReadout />
          </div>
        }
        className="min-h-[130px] shrink basis-0 grow-[12]"
      >
        {chartsReady && <SeriesChart kind="pitch" live />}
      </ChartCard>

      {/* 实时频谱（实验性）：窄带幅度谱，可见谐波列与共振峰峰包 */}
      {liveSpectrum && (
        <ChartCard title={t('test.titleSpectrum')} className="min-h-[72px] shrink basis-0 grow-[4]">
          {chartsReady && <LiveSpectrum />}
        </ChartCard>
      )}

      {/* 实时元音落点（实验性，全屏子页面） */}
      {vowelLiveOpen && <VowelLiveSheet onClose={() => setVowelLiveOpen(false)} />}
    </div>
  );
}
