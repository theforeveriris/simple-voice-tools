/**
 * 实时元音落点（实验性 · 实时功能）
 * 复用 vowelSpace 画笔的 live 模式：说话时实时观察自己的 F1/F2
 * 落点在元音空间里的移动轨迹（渐隐残影 + 质心 × + 当前落点光点）。
 * 语言训练 / 发音矫正的即时反馈视图。
 * 生命周期（监听模式 / 录音中复用数据流）由 LiveSheetFrame 统一处理。
 */

import { useEffect, useState } from 'react';
import { recorder } from '@/lib/audio/recorder';
import { paintVowelSpaceLive } from '@/components/charts/chartPainters';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { LiveSheetFrame, useLiveCanvas } from './LiveSheetFrame';

/** 落点轨迹窗口（秒）：保留最近的移动残影 */
const TRAIL_SEC = 10;
/** 读数刷新间隔（ms）：约 8Hz，避免 setState 过频 */
const READOUT_INTERVAL_MS = 120;

export function VowelLiveSheet({ onClose }: { onClose: () => void }) {
  useI18n();
  const [readout, setReadout] = useState<{ f0: number; f1: number; f2: number } | null>(null);
  const { canvasRef, sizeRef, dprRef } = useLiveCanvas(true);

  // 绘制 + 读数循环
  useEffect(() => {
    let raf = 0;
    let lastReadout = 0;
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
          const t1 = snap.elapsedSec;
          const t0 = Math.max(0, t1 - TRAIL_SEC);
          paintVowelSpaceLive(
            ctx, w, h,
            {
              t: snap.t,
              f0: snap.f0.map((v) => (isFinite(v) ? v : null)),
              rmsDb: snap.rmsDb,
              f1: snap.f1.map((v) => (isFinite(v) ? v : null)),
              f2: snap.f2.map((v) => (isFinite(v) ? v : null)),
            },
            t0, t1, true,
          );
          if (now - lastReadout > READOUT_INTERVAL_MS) {
            lastReadout = now;
            let f0: number | null = null;
            let f1: number | null = null;
            let f2: number | null = null;
            for (let i = snap.t.length - 1; i >= 0; i--) {
              if (f1 == null && isFinite(snap.f1[i])) f1 = snap.f1[i];
              if (f2 == null && isFinite(snap.f2[i])) f2 = snap.f2[i];
              if (isFinite(snap.f0[i]) && snap.f0[i] > 0) {
                f0 = snap.f0[i];
                break;
              }
            }
            setReadout(f0 != null || f1 != null ? { f0: f0 ?? 0, f1: f1 ?? 0, f2: f2 ?? 0 } : null);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, sizeRef, dprRef]);

  return (
    <LiveSheetFrame
      title={t('vowelLive.title')}
      idleHint={t('vowelLive.hintIdle')}
      startLabel={t('vowelLive.start')}
      onClose={onClose}
    >
      {/* 元音空间画布 */}
      <div className="mt-4 rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
        <canvas ref={canvasRef} className="block h-[46vh] min-h-[280px] w-full" aria-label={t('vowelLive.title')} />
        <p className="mt-2 text-center text-[10px] leading-relaxed text-ink-2">{t('vowelLive.hint')}</p>
      </div>

      {/* 实时读数：F0 / F1 / F2 */}
      <div className="mt-3.5 flex items-center justify-center gap-x-8 rounded-[18px] bg-card px-4 py-3 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
        {(
          [
            ['F0', readout && readout.f0 > 0 ? readout.f0.toFixed(1) : null],
            ['F1', readout && readout.f1 > 0 ? String(Math.round(readout.f1)) : null],
            ['F2', readout && readout.f2 > 0 ? String(Math.round(readout.f2)) : null],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="text-center">
            <p className="text-[10px] font-medium tracking-wide text-ink-2">{label}</p>
            <p className="text-lg font-semibold tabular-nums text-ink">
              {value ?? '—'}
              <span className="ml-0.5 text-[10px] font-normal text-ink-2">Hz</span>
            </p>
          </div>
        ))}
      </div>
      {readout == null && (
        <p className="mt-2 text-center text-xs text-ink-2">{t('vowelLive.noSignal')}</p>
      )}
    </LiveSheetFrame>
  );
}
