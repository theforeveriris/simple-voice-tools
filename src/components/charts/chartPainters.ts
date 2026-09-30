/**
 * Canvas 图表画笔集
 * 三种图表（音高 / 能量 / 共振峰）共用的网格、背景、曲线绘制逻辑。
 * 曲线按音高区间分段着色，网格为淡灰虚线，整体遵循 M3 莫奈色板。
 */

import { BAND_COLORS, BAND_RANGES, PITCH_AXIS, ENERGY_AXIS, FORMANT_AXIS } from '@/constants';
import type { PitchBand } from '@/types';

/**
 * 图表调色板（跟随莫奈主题，缓存于主题变更事件）
 */
export interface ChartPalette {
  accent: string;
  accent2: string;
  ink: string;
  textMuted: string;
  grid: string;
}

let paletteCache: ChartPalette | null = null;

export function chartPalette(): ChartPalette {
  if (paletteCache) return paletteCache;
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  paletteCache = {
    accent: v('--c-accent', '#5B5BD6'),
    accent2: v('--c-accent2', '#8B5BD6'),
    ink: v('--c-ink', '#26242E'),
    textMuted: v('--c-ink-2', '#6E6A78'),
    grid: v('--c-line', '#E5E3EC'),
  };
  return paletteCache;
}

window.addEventListener('app:themechange', () => {
  paletteCache = null;
});

/** 秒 → m:ss */
export function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 选取美观的时间刻度步长 */
function niceTimeStep(span: number): number {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const s of steps) if (span / s <= 4) return s;
  return 600;
}

export interface SeriesLike {
  t: number[];
  f0: (number | null)[];
  rmsDb: number[];
  f1: (number | null)[];
  f2: (number | null)[];
}

interface PaintContext {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  t0: number;
  t1: number;
  showGrid: boolean;
  /** 是否绘制刻度数值（测试页纯图表时关闭） */
  showLabels: boolean;
  pal: ChartPalette;
  live: boolean;
}

const DASH: [number, number] = [4, 5];

function dashedLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/**
 * 纵向刻度网格（频率 / 分贝值，左侧标注）
 */
function drawValueGrid(
  p: PaintContext,
  yFor: (v: number) => number,
  ticks: { v: number; label: string }[],
): void {
  const { ctx, w, pal, showGrid } = p;
  if (!showGrid) return;
  ctx.save();
  ctx.setLineDash(DASH);
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.grid;
  ctx.fillStyle = pal.textMuted;
  ctx.font = '9px "Inter Tight", system-ui, sans-serif';
  ctx.globalAlpha = 0.75;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const tick of ticks) {
    const y = yFor(tick.v);
    if (y < 8 || y > p.h - 8) continue;
    dashedLine(ctx, 0, y, w, y);
    if (p.showLabels) ctx.fillText(tick.label, 5, y - 5);
  }
  ctx.restore();
}

/**
 * 时间刻度网格（纵向虚线，底部标注）
 */
function drawTimeGrid(p: PaintContext): void {
  const { ctx, h, t0, t1, pal, showGrid } = p;
  if (!showGrid) return;
  const step = niceTimeStep(t1 - t0);
  ctx.save();
  ctx.setLineDash(DASH);
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.grid;
  if (p.showLabels) {
    ctx.fillStyle = pal.textMuted;
    ctx.globalAlpha = 0.75;
    ctx.font = '9px "Inter Tight", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
  }
  const start = Math.ceil((t0 + 0.01) / step) * step;
  for (let t = start; t <= t1 + 1e-6; t += step) {
    const x = ((t - t0) / (t1 - t0)) * p.w;
    dashedLine(ctx, x, 0, x, h);
    // 右缘附近的标签会被裁切，跳过
    if (p.showLabels && x < p.w - 26) ctx.fillText(formatClock(t), x, h - 2);
  }
  ctx.restore();
}

/* ---------------------------------- 音高图 ---------------------------------- */

/** 音高区间的背景色带（淡紫 / 淡蓝 / 黑 / 淡粉 / 淡紫） */
export function drawPitchBands(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fMin: number,
  fMax: number,
  yFor: (f: number) => number,
): void {
  const bands: PitchBand[] = ['low', 'male', 'transition', 'female', 'high'];
  for (const band of bands) {
    const [f0, f1] = BAND_RANGES[band];
    const yTop = Math.max(0, yFor(Math.min(f1, fMax)));
    const yBot = Math.min(h, yFor(Math.max(f0, fMin)));
    if (yBot <= yTop) continue;
    ctx.globalAlpha = band === 'transition' ? 0.07 : 0.13;
    ctx.fillStyle = BAND_COLORS[band];
    ctx.fillRect(0, yTop, w, yBot - yTop);
  }
  ctx.globalAlpha = 1;

  // 区间分界虚线
  ctx.save();
  ctx.setLineDash(DASH);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(60,58,70,0.18)';
  for (const boundary of [BAND_RANGES.male[0], BAND_RANGES.transition[0], BAND_RANGES.female[0], BAND_RANGES.female[1]]) {
    const y = yFor(boundary);
    if (y > 8 && y < h - 8) dashedLine(ctx, 0, y, w, y);
  }
  ctx.restore();
}

/**
 * 音高曲线：逐段按所属音高区间着色
 * 线段颜色取决于该段音高所在区间，而非整条曲线统一染色
 */
export function drawPitchLine(
  p: PaintContext,
  series: SeriesLike,
  xOf: (t: number) => number,
  yFor: (f: number) => number,
): void {
  const { ctx } = p;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.4;

  let segBand: PitchBand | null = null;
  let segOpen = false;
  let lastX = 0;
  let lastY = 0;
  let hadPrev = false;

  const beginSeg = (band: PitchBand, x: number, y: number) => {
    ctx.strokeStyle = BAND_COLORS[band];
    ctx.beginPath();
    ctx.moveTo(x, y);
    segBand = band;
    segOpen = true;
  };

  for (let i = 0; i < series.t.length; i++) {
    const f = series.f0[i];
    const t = series.t[i];
    if (f == null || !isFinite(f)) {
      if (segOpen) {
        ctx.stroke();
        segOpen = false;
      }
      segBand = null;
      hadPrev = false;
      continue;
    }
    if (t < p.t0 - 0.05 || t > p.t1 + 0.05) continue;
    const x = xOf(t);
    const y = yFor(f);
    const band = f < BAND_RANGES.male[0] ? 'low'
      : f < BAND_RANGES.transition[0] ? 'male'
      : f < BAND_RANGES.female[0] ? 'transition'
      : f <= BAND_RANGES.female[1] ? 'female' : 'high';

    if (!segOpen) {
      beginSeg(band, x, y);
      if (hadPrev) ctx.moveTo(lastX, lastY); // 从上一有效点接续，避免断点
      if (hadPrev) ctx.lineTo(x, y);
    } else if (band !== segBand) {
      ctx.stroke();
      beginSeg(band, lastX, lastY);
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    lastX = x;
    lastY = y;
    hadPrev = true;
  }
  if (segOpen) ctx.stroke();
  ctx.restore();

  // 实时模式：末端呼吸光点
  if (p.live) {
    for (let i = series.t.length - 1; i >= 0; i--) {
      const f = series.f0[i];
      if (f != null && isFinite(f) && series.t[i] >= p.t0) {
        const x = xOf(series.t[i]);
        const y = yFor(f);
        const band = f < 85 ? 'low' : f < 165 ? 'male' : f < 180 ? 'transition' : f <= 255 ? 'female' : 'high';
        ctx.save();
        ctx.shadowColor = BAND_COLORS[band as PitchBand];
        ctx.shadowBlur = 14;
        ctx.fillStyle = BAND_COLORS[band as PitchBand];
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
    }
  }
}

/* ---------------------------------- 能量图 ---------------------------------- */

export function drawEnergy(
  p: PaintContext,
  series: SeriesLike,
  xOf: (t: number) => number,
  yFor: (db: number) => number,
): void {
  const { ctx, h, pal } = p;
  // 收集窗口内的有效点
  const pts: [number, number][] = [];
  for (let i = 0; i < series.t.length; i++) {
    const t = series.t[i];
    if (t < p.t0 - 0.05 || t > p.t1 + 0.05) continue;
    pts.push([xOf(t), yFor(series.rmsDb[i])]);
  }
  if (pts.length < 2) return;

  // 面积填充（垂直渐变）
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, pal.accent);
  grad.addColorStop(1, pal.accent2);
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], h);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1][0], h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 电平线
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

/* --------------------------------- 共振峰图 --------------------------------- */

export function drawFormantLine(
  p: PaintContext,
  values: (number | null)[],
  series: SeriesLike,
  xOf: (t: number) => number,
  yFor: (f: number) => number,
  color: string,
): void {
  const { ctx } = p;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let open = false;
  for (let i = 0; i < series.t.length; i++) {
    const v = values[i];
    const t = series.t[i];
    if (v == null || !isFinite(v) || t < p.t0 - 0.05 || t > p.t1 + 0.05) {
      open = false;
      continue;
    }
    const x = xOf(t);
    const y = yFor(v);
    if (!open) {
      ctx.moveTo(x, y);
      open = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/* --------------------------------- 总入口 --------------------------------- */

/**
 * 绘制一帧图表
 * @param kind 图表类型
 * @param playheadT 播放头位置（秒），null = 不绘制
 */
export function paintChart(
  kind: 'pitch' | 'energy' | 'formant',
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  series: SeriesLike,
  t0: number,
  t1: number,
  showGrid: boolean,
  showLabels: boolean,
  live: boolean,
  playheadT?: number | null,
): void {
  if (t1 - t0 < 1e-6 || w < 8 || h < 8) return;
  const pal = chartPalette();
  const p: PaintContext = { ctx, w, h, t0, t1, showGrid, showLabels, pal, live };
  const xOf = (t: number) => ((t - t0) / (t1 - t0)) * w;

  if (kind === 'pitch') {
    const [fMin, fMax] = PITCH_AXIS;
    const yFor = (f: number) => h - ((f - fMin) / (fMax - fMin)) * h;
    drawPitchBands(ctx, w, h, fMin, fMax, yFor);
    drawValueGrid(p, yFor, [100, 300, 500].map((v) => ({ v, label: `${v}Hz` })));
    drawTimeGrid(p);
    drawPitchLine(p, series, xOf, yFor);
  } else if (kind === 'energy') {
    const [dMin, dMax] = ENERGY_AXIS;
    const yFor = (db: number) => h - ((db - dMin) / (dMax - dMin)) * h;
    drawValueGrid(p, yFor, [0, -30, -60].map((v) => ({ v, label: `${v}dB` })));
    drawTimeGrid(p);
    drawEnergy(p, series, xOf, yFor);
  } else {
    const [aMin, aMax] = FORMANT_AXIS;
    const yFor = (f: number) => h - ((f - aMin) / (aMax - aMin)) * h;
    drawValueGrid(p, yFor, [1000, 2000, 3000].map((v) => ({ v, label: `${v}Hz` })));
    drawTimeGrid(p);
    drawFormantLine(p, series.f1, series, xOf, yFor, pal.accent);
    drawFormantLine(p, series.f2, series, xOf, yFor, pal.accent2);
  }

  // 播放头（回放位置指示线，画在曲线之上）
  if (playheadT != null && isFinite(playheadT) && playheadT >= t0 && playheadT <= t1) {
    const x = xOf(playheadT);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.moveTo(x - 4.5, 0);
    ctx.lineTo(x + 4.5, 0);
    ctx.lineTo(x, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
