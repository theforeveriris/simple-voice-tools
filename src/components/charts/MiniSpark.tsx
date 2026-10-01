/**
 * 迷你音高波形
 * 历史记录卡片中的小曲线预览，同样按音高区间着色。
 * 默认固定尺寸（桌面端内联）；full 模式撑满容器宽度（移动端卡片底部整行曲线），
 * 用 ResizeObserver 跟随宽度重绘。
 */

import { useEffect, useRef, useState } from 'react';
import { getPitchAxis } from '@/constants';
import type { RecordSeries } from '@/types';
import { BAND_COLORS } from '@/constants';
import { cn } from '@/lib/utils';

interface MiniSparkProps {
  series: RecordSeries;
  width?: number;
  height?: number;
  /** 撑满容器宽度并随尺寸变化重绘（与 width 互斥，优先） */
  full?: boolean;
  className?: string;
}

export function MiniSpark({ series, width = 110, height = 30, full = false, className }: MiniSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fullWidth, setFullWidth] = useState(0);

  // full 模式：测量容器宽度（挂载后异步拿到首个非零值，随布局变化重绘）
  useEffect(() => {
    if (!full) return;
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setFullWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [full]);

  const w = full ? fullWidth : width;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || w <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);

    const { t, f0 } = series;
    if (t.length < 2) return;
    const tMax = t[t.length - 1];
    const [fMin, fMax] = getPitchAxis();
    const xOf = (tv: number) => (tv / tMax) * w;
    const yOf = (f: number) => height - ((f - fMin) / (fMax - fMin)) * height;

    // 降采样到画布像素级，分段着色
    const step = Math.max(1, Math.floor(t.length / (w * 2)));
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
  }, [series, w, height]);

  if (full) {
    return (
      <div ref={wrapRef} className={cn('w-full', className)} aria-hidden>
        <canvas ref={canvasRef} style={{ width: '100%', height }} />
      </div>
    );
  }
  return <canvas ref={canvasRef} style={{ width, height }} className={className} aria-hidden />;
}
