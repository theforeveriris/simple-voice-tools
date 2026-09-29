/**
 * 迷你音高波形
 * 历史记录卡片中的小曲线预览，同样按音高区间着色。
 */

import { useEffect, useRef } from 'react';
import { PITCH_AXIS } from '@/constants';
import type { RecordSeries } from '@/types';
import { BAND_COLORS } from '@/constants';

interface MiniSparkProps {
  series: RecordSeries;
  width?: number;
  height?: number;
  className?: string;
}

export function MiniSpark({ series, width = 110, height = 30, className }: MiniSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const { t, f0 } = series;
    if (t.length < 2) return;
    const tMax = t[t.length - 1];
    const [fMin, fMax] = PITCH_AXIS;
    const xOf = (tv: number) => (tv / tMax) * width;
    const yOf = (f: number) => height - ((f - fMin) / (fMax - fMin)) * height;

    // 降采样到画布像素级，分段着色
    const step = Math.max(1, Math.floor(t.length / (width * 2)));
    let open = false;
    let prevBand = '';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < t.length; i += step) {
      const f = f0[i];
      if (f == null) {
        if (open) {
          ctx.stroke();
          ctx.beginPath();
          open = false;
        }
        continue;
      }
      const band = f < 85 ? 'low' : f < 165 ? 'male' : f < 180 ? 'transition' : f <= 255 ? 'female' : 'high';
      const x = xOf(t[i]);
      const y = yOf(f);
      if (!open || band !== prevBand) {
        if (open) {
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y);
        } else {
          ctx.moveTo(x, y);
        }
        ctx.strokeStyle = BAND_COLORS[band as keyof typeof BAND_COLORS];
        prevBand = band;
        open = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    if (open) ctx.stroke();
  }, [series, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} className={className} aria-hidden />;
}
