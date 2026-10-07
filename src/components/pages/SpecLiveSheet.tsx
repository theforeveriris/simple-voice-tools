/**
 * 实时声谱图（实验性 · 实时功能）
 * 全屏滚动的语谱热力图：复用录音引擎逐帧量化好的语谱频带行
 * （getSpecRows，与分析页语谱图同一套对数频带与伪彩色方案），
 * 叠加音高轨迹（原始散点 + 平滑曲线，类似经典嗓音分析器的红轨视图）。
 * 监听模式即开即看，不录音不落库。
 */

import { useEffect, useRef, useState } from 'react';
import { recorder } from '@/lib/audio/recorder';
import { drawSpectrogram, specYFor } from '@/components/charts/specPainter';
import { chartPalette } from '@/components/charts/chartPainters';
import { SPEC_BANDS } from '@/constants';
import { useStore } from '@/store/useStore';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { Switch } from '@/components/ui';
import { LiveSheetFrame } from './LiveSheetFrame';
import { useLiveCanvas } from '@/hooks/useLiveCanvas';

/** 可视时间窗（秒）：滚动热力图的宽度 */
const WIN_SEC = 8;
/** 读数与叠加的平滑系数：新帧权重 */
const OVERLAY_SMOOTH = 0.3;
/** 音高轨迹配色（固定，任何伪彩色板上都可见）：散点蓝 / 轨迹红 */
const DOT_COLOR = '#4E8DF5';
const LINE_COLOR = '#FF5252';

/** 监听模式缓冲上限 7200 帧 → 窗口内最多 WIN_SEC × 60 行 */
const MAX_WIN_ROWS = Math.ceil(WIN_SEC * 60);

export function SpecLiveSheet({ onClose }: { onClose: () => void }) {
  useI18n();
  const showGrid = useStore((s) => s.settings.showGrid);
  const [overlay, setOverlay] = useState(true);

  const { canvasRef, attachCanvas, sizeRef, dprRef } = useLiveCanvas();
  // 可复用缓冲：窗口内行的扁平量化位图 + 行时间（避免每帧分配）
  const flatRef = useRef(new Uint8Array(MAX_WIN_ROWS * SPEC_BANDS));
  const timesRef = useRef<number[]>([]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const { w, h } = sizeRef.current;
        if (w >= 8 && h >= 8) {
          const dpr = dprRef.current;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          const pal = chartPalette();
          const { t: allTimes, rows: allRows } = recorder.getSpecRows();
          const snap = recorder.getLive();
          const t1 = snap.elapsedSec;
          const t0 = t1 - WIN_SEC;
          if (allTimes.length >= 2) {
            // 二分找第一个进入窗口的帧（缓冲按时间递增）
            let lo = 0;
            let hi = allTimes.length - 1;
            while (lo < hi) {
              const mid = (lo + hi) >> 1;
              if (allTimes[mid] < t0) lo = mid + 1;
              else hi = mid;
            }
            const first = lo;
            const n = allTimes.length - first;
            const flat = flatRef.current;
            const rowTimes = timesRef.current;
            rowTimes.length = n;
            for (let r = 0; r < n; r++) {
              rowTimes[r] = allTimes[first + r];
              flat.set(allRows[first + r], r * SPEC_BANDS);
            }

            // 语谱热力图（与分析页同款绘制：离屏位图放大 + 网格刻度）
            drawSpectrogram({
              ctx, w, h,
              pixels: flat.subarray(0, n * SPEC_BANDS),
              rows: n,
              bands: SPEC_BANDS,
              rowTimes,
              t0, t1,
              gridColor: pal.grid,
              textColor: pal.textMuted,
              showGrid,
            });

            // 音高轨迹：原始散点（蓝）+ EMA 平滑曲线（红），断音处断开
            if (overlay) {
              ctx.save();
              ctx.fillStyle = DOT_COLOR;
              for (let i = first; i < allTimes.length; i++) {
                const f = snap.f0[i];
                if (!isFinite(f) || f <= 0) continue;
                const x = ((allTimes[i] - t0) / WIN_SEC) * w;
                const y = specYFor(f, h);
                ctx.beginPath();
                ctx.arc(x, y, 1.7, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.shadowColor = 'rgba(0,0,0,0.45)';
              ctx.shadowBlur = 3;
              ctx.strokeStyle = LINE_COLOR;
              ctx.lineWidth = 2;
              ctx.lineJoin = 'round';
              ctx.lineCap = 'round';
              ctx.beginPath();
              let open = false;
              let smooth: number | null = null;
              for (let i = first; i < allTimes.length; i++) {
                const f = snap.f0[i];
                if (!isFinite(f) || f <= 0) {
                  open = false;
                  smooth = null;
                  continue;
                }
                smooth = smooth == null ? f : smooth * (1 - OVERLAY_SMOOTH) + f * OVERLAY_SMOOTH;
                const x = ((allTimes[i] - t0) / WIN_SEC) * w;
                const y = specYFor(smooth, h);
                if (open) ctx.lineTo(x, y);
                else ctx.moveTo(x, y);
                open = true;
              }
              ctx.stroke();
              ctx.restore();
            }
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, sizeRef, dprRef, showGrid, overlay]);

  return (
    <LiveSheetFrame
      title={t('specLive.title')}
      idleHint={t('specLive.hintIdle')}
      startLabel={t('specLive.start')}
      onClose={onClose}
      toolbar={
        <div className="mt-4 flex items-center justify-between rounded-[18px] bg-card px-4 py-2.5 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
          <span className="text-xs text-ink-2">{t('specLive.overlay')}</span>
          <Switch checked={overlay} onCheckedChange={setOverlay} />
        </div>
      }
    >
      <div className="mt-3.5 rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
        <canvas
          ref={attachCanvas}
          className="block h-[62vh] min-h-[380px] w-full"
          aria-label={t('specLive.title')}
        />
        <p className="mt-2 text-center text-[10px] leading-relaxed text-ink-2">{t('specLive.hint')}</p>
      </div>
      <p className="mt-2 text-center text-xs text-ink-2">{t('specLive.noSignal')}</p>
    </LiveSheetFrame>
  );
}
