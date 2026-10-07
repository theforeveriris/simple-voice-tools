/**
 * 跨记录趋势图
 * metric = f0（默认）：x = 录音日期，y = 对数频率轴（与音域标尺同刻度），
 *   每条记录画一根 P10–P90 音域竖条 + 平均基频圆点，背景叠加男/女声区色带便于解读。
 * metric = mpt / cpps：y = 线性轴（最长声时秒数 / CPPS dB），
 *   只画有该指标数据的记录（MPT 仅长音模式、CPPS 需保存录音音频）。
 * 点击圆点打开对应记录。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { BAND_COLORS, getBandRanges } from '@/constants';
import { trendMetricValue } from '@/lib/trendMetric';
import type { TrendMetric } from '@/lib/trendMetric';
import { chartPalette, roundRectPath } from './chartPainters';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';
import { cn } from '@/lib/utils';

interface TrendChartProps {
  records: AnalysisRecord[];
  onOpen: (record: AnalysisRecord) => void;
  /** 同模式过滤下按时间连线（全部模式下各记录模式混杂，不连线） */
  connectLine?: boolean;
  /** 纵轴指标（默认 f0） */
  metric?: TrendMetric;
  className?: string;
}

const F_MIN = 50;
const F_MAX = 520;
const DASH: [number, number] = [4, 5];
/** 绘图内边距：drawTrend 与 pick() 的命中换算必须共用同一组常量 */
const PAD_L = 34;
const PAD_R = 16;
const PAD_T = 26;
const PAD_B = 30;

/** 线性值 → 纵向像素（vMin 贴底、vMax 贴顶） */
function yLinear(v: number, vMin: number, vMax: number, h: number): number {
  const t = (v - vMin) / Math.max(1e-9, vMax - vMin);
  return h - Math.max(0, Math.min(1, t)) * h;
}

/** 选取美观的日期刻度步长（毫秒） */
function niceDateStep(spanMs: number): number {
  const day = 86400000;
  const steps = [day, 2 * day, 7 * day, 14 * day, 30 * day, 90 * day, 180 * day, 365 * day];
  for (const s of steps) if (spanMs / s <= 5) return s;
  return 730 * day;
}

/** 线性轴的美观刻度步长（MPT 秒 / CPPS dB 通用） */
function niceLinearStep(span: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 20, 30, 60, 120];
  for (const s of steps) if (span / s <= 5) return s;
  return 300;
}

/** 线性轴取值范围：MPT 从 0 起；CPPS 数据范围上下各留 10% 余量 */
function linearDomain(values: number[], metric: TrendMetric): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (metric === 'mpt') return [0, Math.max(niceLinearStep(max) , max) * 1.02];
  const pad = Math.max((max - min) * 0.15, 0.5);
  return [min - pad, max + pad];
}

function drawTrend(
  canvas: HTMLCanvasElement,
  sorted: AnalysisRecord[],
  values: (number | null)[],
  selectedId: string | null,
  connectLine: boolean,
  metric: TrendMetric,
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
  if (sorted.length === 0 || w < 40 || h < 40) return;

  const pal = chartPalette();
  const padL = PAD_L;
  const padR = PAD_R;
  const padT = PAD_T;
  const padB = PAD_B;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const first = sorted[0].createdAt;
  const last = sorted[sorted.length - 1].createdAt;
  const span = Math.max(last - first, 86400000);
  const pad = Math.max(span * 0.06, 6 * 3600000);
  const t0 = first - pad;
  const t1 = last + pad;
  const xOf = (t: number) => padL + ((t - t0) / (t1 - t0)) * innerW;

  // 纵轴：f0 用对数频率轴 + 音区色带；mpt/cpps 用线性轴
  const linear = metric !== 'f0';
  const present = values.filter((v): v is number => v != null);
  const [vMin, vMax] = present.length > 0 ? linearDomain(present, metric) : [0, 1];
  const yOf = (v: number) =>
    linear ? yLinear(v, vMin, vMax, innerH) + padT : yFor(v, innerH) + padT;

  if (!linear) {
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
  }

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
  // 纵轴刻度
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (linear) {
    const stepY = niceLinearStep(vMax - vMin);
    const y0 = Math.ceil(vMin / stepY) * stepY;
    for (let v = y0; v <= vMax + 1e-9; v += stepY) {
      const y = yOf(v);
      if (y < padT + 4 || y > padT + innerH - 4) continue;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + innerW, y);
      ctx.stroke();
      ctx.fillText(stepY < 1 ? v.toFixed(1) : `${Math.round(v)}`, 4, y);
    }
  } else {
    for (const f of [100, 200, 300, 500]) {
      const y = yOf(f);
      if (y < padT + 4 || y > padT + innerH - 4) continue;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + innerW, y);
      ctx.stroke();
      ctx.fillText(`${f}`, 4, y);
    }
  }
  ctx.restore();

  // 同模式连线：相邻记录的指标走势
  if (connectLine && present.length > 1) {
    ctx.save();
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    let began = false;
    sorted.forEach((r, i) => {
      const v = values[i];
      if (v == null) {
        began = false;
        return;
      }
      const x = xOf(r.createdAt);
      const y = yOf(v);
      if (!began) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      began = true;
    });
    ctx.stroke();
    ctx.restore();
  }

  // P10–P90 竖条（仅基频指标）+ 指标圆点
  if (!linear) {
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
  }
  sorted.forEach((r, i) => {
    const v = values[i];
    if (v == null) return;
    const x = xOf(r.createdAt);
    const y = yOf(v);
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
  const selIdx = sorted.findIndex((r) => r.id === selectedId);
  if (selIdx >= 0 && values[selIdx] != null) {
    const sel = sorted[selIdx];
    const v = values[selIdx] as number;
    const d = new Date(sel.createdAt);
    const valLabel = metric === 'f0'
      ? `${v.toFixed(1)} Hz（${sel.stats.p10F0.toFixed(0)}–${sel.stats.p90F0.toFixed(0)}）`
      : metric === 'mpt' ? `${v.toFixed(1)} s` : `${v.toFixed(1)} dB`;
    const label = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${valLabel}`;
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

function yFor(f: number, h: number): number {
  return h - ((Math.log(Math.max(F_MIN, Math.min(F_MAX, f)) / F_MIN)) / Math.log(F_MAX / F_MIN)) * h;
}

export function TrendChart({ records, onOpen, connectLine = false, metric = 'f0', className }: TrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = useMemo(() => [...records].sort((a, b) => a.createdAt - b.createdAt), [records]);
  // 各记录的指标值（MPT 逐条现算，纯函数开销可忽略；随记录/指标变化重算）
  const values = useMemo(() => sorted.map((r) => trendMetricValue(r, metric)), [sorted, metric]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => drawTrend(canvas, sorted, values, selectedId, connectLine, metric);
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [sorted, values, selectedId, connectLine, metric]);

  // 点击 / 拖动选择最近的记录点
  const pick = (clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || sorted.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const innerW = rect.width - PAD_L - PAD_R;
    const innerH = rect.height - PAD_T - PAD_B;
    const first = sorted[0].createdAt;
    const last = sorted[sorted.length - 1].createdAt;
    const span = Math.max(last - first, 86400000);
    const pad = Math.max(span * 0.06, 6 * 3600000);
    const t0 = first - pad;
    const t1 = last + pad;
    const xOf = (t: number) => PAD_L + ((t - t0) / (t1 - t0)) * innerW;
    const present = values.filter((v): v is number => v != null);
    const [vMin, vMax] = present.length > 0 ? linearDomain(present, metric) : [0, 1];
    const yOf = (v: number) =>
      metric !== 'f0' ? yLinear(v, vMin, vMax, innerH) + PAD_T : yFor(v, innerH) + PAD_T;

    let best: string | null = null;
    let bestDist = Infinity;
    sorted.forEach((r, i) => {
      const v = values[i];
      if (v == null) return;
      const dx = clientX - rect.left - xOf(r.createdAt);
      const dy = clientY - rect.top - yOf(v);
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = r.id;
      }
    });
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
