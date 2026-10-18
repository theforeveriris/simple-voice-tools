/**
 * Canvas 图表画笔集（时间序列：音高 / 能量 / 共振峰）+ 总入口 paintChart
 * 曲线按音高区间分段着色，网格为淡灰虚线，整体遵循 M3 莫奈色板。
 * 元音空间画笔见 vowelPainter.ts，VRP 声域图画笔见 vrpPainter.ts，
 * 调色板 / 画布助手等公共件见 chartShared.ts。
 */

import { BAND_COLORS, bandOf, getBandRanges, getPitchAxis, ENERGY_AXIS, FORMANT_AXIS } from '@/constants';
import { formatClock } from '@/lib/utils';
import type { PitchBand } from '@/types';
import type { PaintContext, SeriesLike } from './chartShared';
import { chartPalette, DASH, dashedLine } from './chartShared';
import {
  collectVowelPoints,
  drawFormantTarget,
  drawVowelPoints,
  drawVowelRefs,
  drawVowelSpaceFrame,
} from './vowelPainter';
import { drawVrpHeatmap } from './vrpPainter';

// ---- 兼容 re-export：既有调用方从本模块导入这些符号 ----
export { chartPalette, roundRectPath } from './chartShared';
export type { ChartPalette, SeriesLike } from './chartShared';
export {
  collectVowelPoints,
  drawFormantTarget,
  drawVowelCentroid,
  drawVowelPoints,
  drawVowelRefs,
  drawVowelSpaceFrame,
  paintVowelSpaceLive,
  vowelXY,
} from './vowelPainter';
export { drawVrpHeatmap } from './vrpPainter';

/** 选取美观的时间刻度步长 */
function niceTimeStep(span: number): number {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const s of steps) if (span / s <= 4) return s;
  return 600;
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

/**
 * 音高区间的背景色带（淡紫 / 淡蓝 / 黑 / 淡粉 / 淡紫）
 * 边界跟随自定义音区边界（设置 → 实验性功能）
 */
export function drawPitchBands(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fMin: number,
  fMax: number,
  yFor: (f: number) => number,
): void {
  const ranges = getBandRanges();
  const bands: PitchBand[] = ['low', 'male', 'transition', 'female', 'high'];
  for (const band of bands) {
    const [f0, f1] = ranges[band];
    const yTop = Math.max(0, yFor(Math.min(f1, fMax)));
    const yBot = Math.min(h, yFor(Math.max(f0, fMin)));
    if (yBot <= yTop) continue;
    ctx.globalAlpha = band === 'transition' ? 0.07 : 0.13;
    ctx.fillStyle = BAND_COLORS[band];
    ctx.fillRect(0, yTop, w, yBot - yTop);
  }
  ctx.globalAlpha = 1;

  // 区间分界虚线（颜色取自主题，深浅模式均可见）
  ctx.save();
  ctx.setLineDash(DASH);
  ctx.lineWidth = 1;
  ctx.strokeStyle = chartPalette().grid;
  for (const boundary of [ranges.male[0], ranges.transition[0], ranges.female[0], ranges.female[1]]) {
    const y = yFor(boundary);
    if (y > 8 && y < h - 8) dashedLine(ctx, 0, y, w, y);
  }
  ctx.restore();
}

/**
 * 训练靶标目标带：半透明主题色带 + 上下边界虚线
 * 绘制在音区背景之上、曲线之下
 */
function drawTargetBand(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  target: [number, number],
  yFor: (f: number) => number,
): void {
  const pal = chartPalette();
  const yTop = yFor(target[1]);
  const yBot = yFor(target[0]);
  if (yBot <= 0 || yTop >= h) return;
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = pal.accent;
  ctx.fillRect(0, Math.max(0, yTop), w, Math.min(h, yBot) - Math.max(0, yTop));
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, yTop);
  ctx.lineTo(w, yTop);
  ctx.moveTo(0, yBot);
  ctx.lineTo(w, yBot);
  ctx.stroke();
  ctx.restore();
}

/**
 * 音高曲线：逐段按所属音高区间着色
 * 线段颜色取决于该段音高所在区间，而非整条曲线统一染色
 */
function drawPitchLine(
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
      continue;
    }
    if (t < p.t0 - 0.05 || t > p.t1 + 0.05) continue;
    const x = xOf(t);
    const y = yFor(f);
    const band = bandOf(f);

    if (!segOpen) {
      beginSeg(band, x, y);
    } else if (band !== segBand) {
      ctx.stroke();
      beginSeg(band, lastX, lastY);
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    lastX = x;
    lastY = y;
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
        const band = bandOf(f);
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

function drawEnergy(
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

function drawFormantLine(
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

export type PaintKind = 'pitch' | 'energy' | 'formant' | 'vowelSpace' | 'vrp';

/** crosshair 支持查值的时间序列图表 */
export type CrosshairKind = 'pitch' | 'energy' | 'formant';

/**
 * crosshair 查值气泡：按住图表时显示最近采样帧的 t / F0 / F1 / F2 / dB
 */
export function drawCrosshair(
  kind: CrosshairKind,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  series: SeriesLike,
  t0: number,
  t1: number,
  tCross: number,
): void {
  const pal = chartPalette();
  // 找最近的有值帧（含 rmsDb 的帧都算有效采样）
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < series.t.length; i++) {
    const tt = series.t[i];
    if (tt < t0 || tt > t1) continue;
    const d = Math.abs(tt - tCross);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (best < 0 || bestDist > (t1 - t0)) return;

  const x = ((series.t[best] - t0) / (t1 - t0)) * w;
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = pal.textMuted;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, h);
  ctx.stroke();
  ctx.restore();

  // 气泡内容
  const f0 = series.f0[best];
  const lines: string[] = [formatClock(series.t[best])];
  if (kind === 'pitch' || kind === 'formant') {
    lines.push(`F0  ${f0 != null && isFinite(f0) ? `${f0.toFixed(1)} Hz` : '—'}`);
  }
  if (kind === 'formant') {
    const f1 = series.f1[best];
    const f2 = series.f2[best];
    lines.push(`F1  ${f1 != null && isFinite(f1) ? `${Math.round(f1)} Hz` : '—'}`);
    lines.push(`F2  ${f2 != null && isFinite(f2) ? `${Math.round(f2)} Hz` : '—'}`);
  }
  if (kind === 'pitch' || kind === 'energy') {
    lines.push(`dB  ${series.rmsDb[best].toFixed(1)}`);
  }

  ctx.save();
  ctx.font = '10px "Inter Tight", system-ui, sans-serif';
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const padX = 8;
  const padY = 6;
  const lineH = 14;
  const bw = tw + padX * 2;
  const bh = lines.length * lineH + padY * 2 - 2;
  // 靠近右缘时气泡放到线左侧
  const bx = x + 10 + bw > w ? x - 10 - bw : x + 10;
  const by = Math.max(4, Math.min(h - bh - 4, h / 2 - bh / 2));
  ctx.fillStyle = 'rgba(30,28,40,0.88)';
  const r = 8;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
  ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
  ctx.arcTo(bx, by + bh, bx, by, r);
  ctx.arcTo(bx, by, bx + bw, by, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, bx + padX, by + padY + i * lineH));
  ctx.restore();
}

/**
 * 绘制一帧图表
 * @param kind 图表类型
 * @param playheadT 播放头位置（秒），null = 不绘制
 * @param target 训练靶标目标区间（Hz），仅音高图使用
 */
export function paintChart(
  kind: PaintKind,
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
  target?: [number, number] | null,
): void {
  if (t1 - t0 < 1e-6 || w < 8 || h < 8) return;
  const pal = chartPalette();
  const p: PaintContext = { ctx, w, h, t0, t1, showGrid, showLabels, pal, live };
  const xOf = (t: number) => ((t - t0) / (t1 - t0)) * w;

  if (kind === 'pitch') {
    const [fMin, fMax] = getPitchAxis();
    const yFor = (f: number) => h - ((f - fMin) / (fMax - fMin)) * h;
    drawPitchBands(ctx, w, h, fMin, fMax, yFor);
    if (target) drawTargetBand(ctx, w, h, target, yFor);
    drawValueGrid(p, yFor, [100, 300, 500].map((v) => ({ v, label: `${v}Hz` })));
    drawTimeGrid(p);
    drawPitchLine(p, series, xOf, yFor);
  } else if (kind === 'energy') {
    const [dMin, dMax] = ENERGY_AXIS;
    const yFor = (db: number) => h - ((db - dMin) / (dMax - dMin)) * h;
    drawValueGrid(p, yFor, [0, -30, -60].map((v) => ({ v, label: `${v}dB` })));
    drawTimeGrid(p);
    drawEnergy(p, series, xOf, yFor);
  } else if (kind === 'formant') {
    const [aMin, aMax] = FORMANT_AXIS;
    const yFor = (f: number) => h - ((f - aMin) / (aMax - aMin)) * h;
    drawValueGrid(p, yFor, [1000, 2000, 3000].map((v) => ({ v, label: `${v}Hz` })));
    drawTimeGrid(p);
    drawFormantLine(p, series.f1, series, xOf, yFor, pal.accent);
    drawFormantLine(p, series.f2, series, xOf, yFor, pal.accent2);
  } else if (kind === 'vowelSpace') {
    drawVowelSpaceFrame(ctx, w, h, pal, showLabels);
    drawVowelPoints(ctx, w, h, collectVowelPoints(series, t0, t1), pal.accent);
    drawVowelRefs(ctx, w, h, pal, showLabels);
    drawFormantTarget(ctx, w, h, pal);
  } else if (kind === 'vrp') {
    drawVrpHeatmap(p, series);
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
