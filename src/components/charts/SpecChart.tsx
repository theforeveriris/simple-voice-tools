/**
 * 语谱图画布组件（分析页静态模式）
 * 绑定某条分析记录的量化语谱数据与时间区间，
 * 数据 / 尺寸变化时重绘；叠加 F1 / F2 轨迹点。
 * 播放头画在独立覆盖层：回放每帧只重绘一条线，
 * 不再触发「离屏位图逐像素着色 + 全量轨迹」的整帧重绘。
 */

import { useEffect, useMemo, useRef } from 'react';
import { bytesFromBase64 } from '@/lib/audio/spectrogram';
import { useStore } from '@/store/useStore';
import { chartPalette } from './chartPainters';
import { drawSpectrogram } from './specPainter';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';
import { cn } from '@/lib/utils';

interface SpecChartProps {
  record: AnalysisRecord;
  /** 显示的时间区间 [t0, t1]（秒） */
  range: [number, number];
  /** 播放头位置（秒），null = 不显示 */
  playhead?: number | null;
  className?: string;
}

export function SpecChart({ record, range, playhead, className }: SpecChartProps) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);

  const pixels = useMemo(() => (record.spec ? bytesFromBase64(record.spec.data) : null), [record.spec]);
  // 行时间与分析序列对齐（记录保存时按相同倍率降采样）
  const rowTimes = useMemo(() => {
    if (!pixels || !record.spec) return [];
    const rows = Math.floor(pixels.length / record.spec.bands);
    const t = record.series.t;
    const out: number[] = [];
    for (let r = 0; r < rows; r++) out.push(t[Math.min(r, t.length - 1)] ?? (r / rows) * record.durationSec);
    return out;
  }, [pixels, record]);

  // 最新 props 经 ref 读取：ResizeObserver 捕获的挂载期闭包也能拿到当前数据
  const propsRef = useRef({ record, range, pixels, rowTimes, playhead });
  // eslint-disable-next-line react-hooks/refs -- 与 SeriesChart 同款：渲染期同步，供 RO 闭包读取
  propsRef.current = { record, range, pixels, rowTimes, playhead };

  const drawBase = () => {
    const canvas = baseRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    if (w < 8 || h < 8) return;
    const { record: rec, range: rng, pixels: px, rowTimes: rt } = propsRef.current;
    if (!px || !rec.spec) return;
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pal = chartPalette();
    drawSpectrogram({
      ctx, w, h,
      pixels: px,
      rows: Math.floor(px.length / rec.spec.bands),
      bands: rec.spec.bands,
      rowTimes: rt,
      t0: rng[0],
      t1: rng[1],
      overlay: {
        series: rec.series,
        f1Color: pal.accent,
        f2Color: pal.accent2,
      },
      gridColor: pal.grid,
      textColor: pal.textMuted,
      showGrid: useStore.getState().settings.showGrid,
    });
  };

  const drawOverlay = () => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const ph = propsRef.current.playhead;
    const [t0, t1] = propsRef.current.range;
    if (ph == null || !isFinite(ph) || ph < t0 || ph > t1 || !(t1 - t0 > 1e-6)) return;
    const x = ((ph - t0) / (t1 - t0)) * w;
    // 与 drawSpectrogram 内的播放头同款式样
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 3;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x - 4.5, 0);
    ctx.lineTo(x + 4.5, 0);
    ctx.lineTo(x, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // 尺寸自适应（两层画布同步缩放并重绘）
  useEffect(() => {
    const base = baseRef.current;
    const overlay = overlayRef.current;
    if (!base || !overlay) return;
    const ro = new ResizeObserver(() => {
      const rect = base.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      sizeRef.current = { w: rect.width, h: rect.height };
      for (const c of [base, overlay]) {
        c.width = Math.max(1, Math.round(rect.width * dpr));
        c.height = Math.max(1, Math.round(rect.height * dpr));
      }
      drawBase();
      drawOverlay();
    });
    ro.observe(base);
    return () => ro.disconnect();
  }, []);

  // 数据 / 区间变化重绘底图；播放头变化只重绘覆盖层
  useEffect(() => {
    drawBase();
  }, [record, range, pixels, rowTimes]);
  useEffect(() => {
    drawOverlay();
  }, [playhead, range]);

  return (
    <div className={cn('relative h-full w-full', className)}>
      <canvas
        ref={baseRef}
        className="block h-full w-full rounded-lg"
        aria-label={t('analysis.specAria')}
      />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 block h-full w-full" aria-hidden />
    </div>
  );
}
