/**
 * 语谱图画布组件（分析页静态模式）
 * 绑定某条分析记录的量化语谱数据与时间区间，
 * 数据 / 尺寸变化时重绘；叠加 F1 / F2 轨迹点。
 */

import { useEffect, useMemo, useRef } from 'react';
import { bytesFromBase64 } from '@/lib/audio/spectrogram';
import { useStore } from '@/store/useStore';
import { chartPalette } from './chartPainters';
import { drawSpectrogram } from './specPainter';
import type { AnalysisRecord } from '@/types';
import { cn } from '@/lib/utils';

interface SpecChartProps {
  record: AnalysisRecord;
  /** 显示的时间区间 [t0, t1]（秒） */
  range: [number, number];
  className?: string;
}

export function SpecChart({ record, range, className }: SpecChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  const drawFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    if (w < 8 || h < 8) return;
    if (!pixels || !record.spec) return;
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pal = chartPalette();
    const showGrid = useStore.getState().settings.showGrid;
    drawSpectrogram({
      ctx, w, h,
      pixels,
      rows: Math.floor(pixels.length / record.spec.bands),
      bands: record.spec.bands,
      rowTimes,
      t0: range[0],
      t1: range[1],
      overlay: {
        series: record.series,
        f1Color: pal.accent,
        f2Color: pal.accent2,
      },
      gridColor: pal.grid,
      textColor: pal.textMuted,
      showGrid,
    });
  };

  // 尺寸自适应
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      drawFrame();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 数据 / 区间变化时重绘
  useEffect(() => {
    drawFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, range, pixels]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('block h-full w-full rounded-lg', className)}
      aria-label="语谱图"
    />
  );
}
