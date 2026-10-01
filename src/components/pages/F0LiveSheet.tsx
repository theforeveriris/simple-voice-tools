/**
 * 实时 F0 基频曲线（实验性 · 实时功能）
 * 高幅面画布滚动绘制音高曲线，复用测试页同款画笔（音区色带 + 网格 +
 * 训练靶标带 + 末端呼吸光点）；监听模式即开即看，不录音不落库。
 * 音高检测算法跟随 实验性功能 → 实时音高算法 设置。
 */

import { useEffect, useMemo, useState } from 'react';
import { recorder } from '@/lib/audio/recorder';
import { paintChart } from '@/components/charts/chartPainters';
import { freqToNote, getLiveWindowSec } from '@/constants';
import { useStore } from '@/store/useStore';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { LiveSheetFrame, useLiveCanvas } from './LiveSheetFrame';

/** 读数刷新间隔（ms）：约 8Hz，避免 setState 过频 */
const READOUT_INTERVAL_MS = 120;

interface Readout {
  hz: number;
  note: string;
  cents: number;
}

export function F0LiveSheet({ onClose }: { onClose: () => void }) {
  useI18n();
  const showGrid = useStore((s) => s.settings.showGrid);
  const targetEnabled = useStore((s) => s.settings.targetEnabled);
  const targetF0Min = useStore((s) => s.settings.targetF0Min);
  const targetF0Max = useStore((s) => s.settings.targetF0Max);
  // 稳定引用：避免每次渲染新数组导致绘制 effect 反复重建
  const target = useMemo<[number, number] | null>(
    () => (targetEnabled ? [targetF0Min, targetF0Max] : null),
    [targetEnabled, targetF0Min, targetF0Max],
  );

  const [readout, setReadout] = useState<Readout | null>(null);
  const { canvasRef, attachCanvas, sizeRef, dprRef } = useLiveCanvas();

  // 绘制 + 读数循环
  useEffect(() => {
    let raf = 0;
    let lastReadout = 0;
    const win = getLiveWindowSec();
    const loop = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const { w, h } = sizeRef.current;
        if (w >= 8 && h >= 8) {
          const dpr = dprRef.current;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          const snap = recorder.getLive();
          // 起始阶段序列不足一个窗口，也按整窗绘制（t0 为负，曲线从左侧渐入）
          const t1 = Math.max(snap.elapsedSec, win);
          paintChart('pitch', ctx, w, h, snap, t1 - win, t1, showGrid, true, true, null, target);
          if (now - lastReadout > READOUT_INTERVAL_MS) {
            lastReadout = now;
            let hz: number | null = null;
            for (let i = snap.f0.length - 1; i >= 0; i--) {
              if (isFinite(snap.f0[i]) && snap.f0[i] > 0) {
                hz = snap.f0[i];
                break;
              }
            }
            if (hz != null) {
              const note = freqToNote(hz);
              setReadout({ hz, note: note.name, cents: note.cents });
            } else {
              setReadout(null);
            }
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, sizeRef, dprRef, showGrid, target]);

  return (
    <LiveSheetFrame
      title={t('f0Live.title')}
      idleHint={t('f0Live.hintIdle')}
      startLabel={t('f0Live.start')}
      onClose={onClose}
    >
      <div className="mt-4 rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
        <canvas
          ref={attachCanvas}
          className="block h-[62vh] min-h-[380px] w-full"
          aria-label={t('f0Live.title')}
        />
        <p className="mt-2 text-center text-[10px] leading-relaxed text-ink-2">{t('f0Live.hint')}</p>
      </div>

      {/* 实时读数：F0 / 最近音符 */}
      <div className="mt-3.5 flex items-center justify-center gap-x-10 rounded-[18px] bg-card px-4 py-3 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
        <div className="text-center">
          <p className="text-[10px] font-medium tracking-wide text-ink-2">F0</p>
          <p className="text-lg font-semibold tabular-nums text-ink">
            {readout ? readout.hz.toFixed(1) : '—'}
            <span className="ml-0.5 text-[10px] font-normal text-ink-2">Hz</span>
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-medium tracking-wide text-ink-2">{t('f0Live.note')}</p>
          <p className="text-lg font-semibold tabular-nums text-ink">
            {readout ? readout.note : '—'}
            <span className="ml-0.5 text-[10px] font-normal text-ink-2">
              {readout ? `${readout.cents >= 0 ? '+' : ''}${readout.cents}¢` : ''}
            </span>
          </p>
        </div>
      </div>
      {!readout && (
        <p className="mt-2 text-center text-xs text-ink-2">{t('f0Live.noSignal')}</p>
      )}
    </LiveSheetFrame>
  );
}
