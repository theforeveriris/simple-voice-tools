/**
 * 跨记录趋势图
 * x = 录音日期，y = 对数频率轴（与音域标尺同刻度），
 * 每条记录画一根 P10–P90 音域竖条 + 平均基频圆点，
 * 背景叠加男/女声区色带便于解读。点击圆点打开对应记录。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { BAND_COLORS, getBandRanges } from '@/constants';
import { chartPalette } from './chartPainters';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';
import { cn } from '@/lib/utils';

interface TrendChartProps {
  records: AnalysisRecord[];
  onOpen: (record: AnalysisRecord) => void;
  /** 同模式过滤下按时间连线（全部模式下各记录模式混杂，不连线） */
  connectLine?: boolean;
  className?: string;
}

const F_MIN = 50;
const F_MAX = 520;
const DASH: [number, number] = [4, 5];

/** 对数频率 → 纵向像素 */
function yFor(f: number, h: number): number {
  return h - ((Math.log(Math.max(F_MIN, Math.min(F_MAX, f)) / F_MIN)) / Math.log(F_MAX / F_MIN)) * h;
}

/** roundRect 兜底（旧版 Safari 无 ctx.roundRect） */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 选取美观的日期刻度步长（毫秒） */
function niceDateStep(spanMs: number): number {
  const day = 86400000;
  const steps = [day, 2 * day, 7 * day, 14 * day, 30 * day, 90 * day, 180 * day, 365 * day];
  for (const s of steps) if (spanMs / s <= 5) return s;
  return 730 * day;
}

function drawTrend(
  canvas: HTMLCanvasElement,
  records: AnalysisRecord[],
  selectedId: string | null,
  connectLine: boolean,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (records.length === 0 || w < 40 || h < 40) return;

  const pal = chartPalette();
  const padL = 34;
  const padR = 16;
  const padT = 26;
  const padB = 30;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const sorted = [...records].sort((a, b) => a.createdAt - b.createdAt);
  const first = sorted[0].createdAt;
  const last = sorted[sorted.length - 1].createdAt;
  const span = Math.max(last - first, 86400000);
  const pad = Math.max(span * 0.06, 6 * 3600000);
  const t0 = first - pad;
  const t1 = last + pad;
  const xOf = (t: number) => padL + ((t - t0) / (t1 - t0)) * innerW;

  // 音区背景色带（边界跟随自定义音区边界）
  const ranges = getBandRanges();
  const bands = ['low', 'male', 'transition', 'female', 'high'] as const;
  for (const band of bands) {
    const [f0, f1] = ranges[band];
    const yTop = yFor(f1, innerH) + padT;
    const yBot = yFor(f0, innerH) + padT;
    ctx.fillStyle = BAND_COLORS[band];
    ctx.globalAlpha = band === 'transition' ? 0.05 : 0.1;
    ctx.fillRect(padL, yTop, innerW, yBot - yTop);
  }
  ctx.globalAlpha = 1;

  // 时间刻度
  ctx.save();
  ctx.setLineDash(DASH);
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.grid;
  ctx.fillStyle = pal.textMuted;
  ctx.font = '9px "Inter Tight", system-ui, sans-serif';
  ctx.globalAlpha = 0.8;
  const step = niceDateStep(t1 - t0);
  const start = Math.ceil(t0 / step) * step;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let t = start; t <= t1; t += step) {
    const x = xOf(t);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + innerH);
    ctx.stroke();
    const d = new Date(t);
    ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, x, padT + innerH + 8);
  }
  // 频率刻度
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const f of [100, 200, 300, 500]) {
    const y = yFor(f, innerH) + padT;
    if (y < padT + 4 || y > padT + innerH - 4) continue;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + innerW, y);
    ctx.stroke();
    ctx.fillText(`${f}`, 4, y);
  }
  ctx.restore();

  // 同模式连线：相邻记录的平均基频走势
  if (connectLine && sorted.length > 1) {
    ctx.save();
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    sorted.forEach((r, i) => {
      const x = xOf(r.createdAt);
      const y = yFor(r.stats.avgF0, innerH) + padT;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // P10–P90 竖条 + 平均基频圆点
  sorted.forEach((r) => {
    const x = xOf(r.createdAt);
    const y0 = yFor(r.stats.p10F0, innerH) + padT;
    const y1 = yFor(r.stats.p90F0, innerH) + padT;
    ctx.fillStyle = pal.accent;
    ctx.globalAlpha = 0.22;
    const barW = 8;
    roundRectPath(ctx, x - barW / 2, y1, barW, Math.max(4, y0 - y1), barW / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
  sorted.forEach((r) => {
    const x = xOf(r.createdAt);
    const y = yFor(r.stats.avgF0, innerH) + padT;
    const selected = r.id === selectedId;
    ctx.beginPath();
    ctx.arc(x, y, selected ? 7 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = pal.accent;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  });

  // 选中信息
  const sel = sorted.find((r) => r.id === selectedId);
  if (sel) {
    const d = new Date(sel.createdAt);
    const label = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${sel.stats.avgF0.toFixed(1)} Hz（${sel.stats.p10F0.toFixed(0)}–${sel.stats.p90F0.toFixed(0)}）`;
    ctx.font = '600 11px "Inter Tight", system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(40,38,52,0.78)';
    roundRectPath(ctx, padL, 2, tw + 16, 20, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, padL + 8, 12);
  }
}

export function TrendChart({ records, onOpen, connectLine = false, className }: TrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = useMemo(() => [...records].sort((a, b) => a.createdAt - b.createdAt), [records]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => drawTrend(canvas, sorted, selectedId, connectLine);
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [sorted, selectedId, connectLine]);

  // 点击 / 拖动选择最近的记录点
  const pick = (clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || sorted.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const padL = 34;
    const innerW = rect.width - padL - 16;
    const first = sorted[0].createdAt;
    const last = sorted[sorted.length - 1].createdAt;
    const span = Math.max(last - first, 86400000);
    const pad = Math.max(span * 0.06, 6 * 3600000);
    const t0 = first - pad;
    const t1 = last + pad;
    const xOf = (t: number) => padL + ((t - t0) / (t1 - t0)) * innerW;
    const yOf = (f: number) => yFor(f, rect.height - 26 - 30) + 26;

    let best: string | null = null;
    let bestDist = Infinity;
    for (const r of sorted) {
      const dx = clientX - rect.left - xOf(r.createdAt);
      const dy = clientY - rect.top - yOf(r.stats.avgF0);
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = r.id;
      }
    }
    return bestDist < 44 ? best : null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const id = pick(e.clientX, e.clientY);
    if (id && id === selectedId) {
      // 再次点击已选中的点 → 打开该记录
      const rec = sorted.find((r) => r.id === id);
      if (rec) onOpen(rec);
    } else {
      setSelectedId(id);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className={cn('block h-[260px] w-full touch-none sm:h-[320px]', className)}
      onPointerDown={onPointerDown}
      aria-label={t('history.trendAria')}
    />
  );
}
