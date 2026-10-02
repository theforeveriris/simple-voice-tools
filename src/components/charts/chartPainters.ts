/**
 * Canvas 图表画笔集
 * 三种图表（音高 / 能量 / 共振峰）共用的网格、背景、曲线绘制逻辑。
 * 曲线按音高区间分段着色，网格为淡灰虚线，整体遵循 M3 莫奈色板。
 */

import { BAND_COLORS, bandOf, getBandRanges, getPitchAxis, ENERGY_AXIS, FORMANT_AXIS, VOWEL_AXIS_F1, VOWEL_AXIS_F2, VOWEL_REFS, VRP_NOTE_MIN, VRP_NOTE_MAX, freqToNote, getFormantTarget } from '@/constants';
import { t } from '@/i18n';
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
export function drawTargetBand(
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
    const band = bandOf(f);

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

/* -------------------------------- 元音空间 -------------------------------- */

/** 对数轴归一化：v ∈ [min,max] → 0..1（越界截断） */
function logNorm(v: number, [min, max]: [number, number]): number {
  const c = Math.max(min, Math.min(max, v));
  return (Math.log(c) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

/** 元音平面坐标：x = F2 倒置（高 F2=舌位靠前 在左），y = F1 倒置（低 F1=开口小 在上） */
export function vowelXY(f1: number, f2: number, w: number, h: number): [number, number] {
  return [(1 - logNorm(f2, VOWEL_AXIS_F2)) * w, logNorm(f1, VOWEL_AXIS_F1) * h];
}

/** 收集区间内的有效元音点（有声帧且 F1/F2 同帧检出） */
export function collectVowelPoints(series: SeriesLike, t0: number, t1: number): { f1: number; f2: number }[] {
  const pts: { f1: number; f2: number }[] = [];
  for (let i = 0; i < series.t.length; i++) {
    const t = series.t[i];
    if (t < t0 - 0.05 || t > t1 + 0.05) continue;
    const f1 = series.f1[i];
    const f2 = series.f2[i];
    if (series.f0[i] == null || f1 == null || f2 == null || !isFinite(f1) || !isFinite(f2)) continue;
    pts.push({ f1, f2 });
  }
  return pts;
}

/** 元音空间网格与刻度（F1 横线 / F2 纵线，均为对数位） */
export function drawVowelSpaceFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pal: ChartPalette,
  showLabels: boolean,
): void {
  const f1Ticks = [250, 500, 1000];
  const f2Ticks = [800, 1500, 2500];
  ctx.save();
  ctx.setLineDash(DASH);
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.grid;
  for (const v of f1Ticks) dashedLine(ctx, 0, logNorm(v, VOWEL_AXIS_F1) * h, w, logNorm(v, VOWEL_AXIS_F1) * h);
  for (const v of f2Ticks) {
    const x = (1 - logNorm(v, VOWEL_AXIS_F2)) * w;
    dashedLine(ctx, x, 0, x, h);
  }
  if (showLabels) {
    ctx.fillStyle = pal.textMuted;
    ctx.globalAlpha = 0.75;
    ctx.font = '9px "Inter Tight", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const v of f1Ticks) ctx.fillText(`${v}Hz`, 4, logNorm(v, VOWEL_AXIS_F1) * h - 5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const v of f2Ticks) {
      const x = (1 - logNorm(v, VOWEL_AXIS_F2)) * w;
      if (x > 18 && x < w - 18) ctx.fillText(`${v}`, x, h - 2);
    }
  }
  ctx.restore();
}

/** 一组元音散点（低透明度同色叠加，密度自然形成热度） */
export function drawVowelPoints(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  points: { f1: number; f2: number }[],
  color: string,
  opts?: { alpha?: number; radius?: number },
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = opts?.alpha ?? 0.2;
  const r = opts?.radius ?? 2.2;
  for (const pt of points) {
    const [x, y] = vowelXY(pt.f1, pt.f2, w, h);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 质心 × 标记（对比视图中标记两组散点的中心） */
export function drawVowelCentroid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  points: { f1: number; f2: number }[],
  color: string,
): void {
  if (points.length === 0) return;
  let sf1 = 0;
  let sf2 = 0;
  for (const p of points) {
    sf1 += p.f1;
    sf2 += p.f2;
  }
  const [x, y] = vowelXY(sf1 / points.length, sf2 / points.length, w, h);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 4.5, y - 4.5);
  ctx.lineTo(x + 4.5, y + 4.5);
  ctx.moveTo(x + 4.5, y - 4.5);
  ctx.lineTo(x - 4.5, y + 4.5);
  ctx.stroke();
  ctx.restore();
}

/** 参考元音虚线圈（i/a/u，跟随主题淡化处理） */
export function drawVowelRefs(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pal: ChartPalette,
  showLabels: boolean,
): void {
  for (const ref of VOWEL_REFS) {
    const [x, y] = vowelXY(ref.f1, ref.f2, w, h);
    ctx.save();
    ctx.strokeStyle = pal.textMuted;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2.5, 2.5]);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
    if (showLabels) {
      ctx.setLineDash([]);
      ctx.fillStyle = pal.textMuted;
      ctx.font = '9px "Inter Tight", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${ref.label} ${ref.zh}`, x, y - 8);
    }
    ctx.restore();
  }
}

/**
 * 共振峰目标区：训练设置启用时叠加 (F1±r, F2±r) 虚线矩形 + 中心 ×，
 * 用第二强调色与散点/参考元音区分（分析页散点与实时落点视图共用）
 */
export function drawFormantTarget(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pal: ChartPalette,
): void {
  const target = getFormantTarget();
  if (!target) return;
  const { f1, f2, radius } = target;
  const [x1] = vowelXY(f1, Math.min(VOWEL_AXIS_F2[1], f2 + radius), w, h);
  const [x2] = vowelXY(f1, Math.max(VOWEL_AXIS_F2[0], f2 - radius), w, h);
  const [, y1] = vowelXY(Math.min(VOWEL_AXIS_F1[1], f1 + radius), f2, w, h);
  const [, y2] = vowelXY(Math.max(VOWEL_AXIS_F1[0], f1 - radius), f2, w, h);
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  ctx.save();
  ctx.strokeStyle = pal.accent2;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 4]);
  roundRectPathOn(ctx, left, top, right - left, bottom - top, 8);
  ctx.stroke();
  // 中心 × 标记
  const [cx, cy] = vowelXY(f1, f2, w, h);
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 4);
  ctx.lineTo(cx + 4, cy + 4);
  ctx.moveTo(cx + 4, cy - 4);
  ctx.lineTo(cx - 4, cy + 4);
  ctx.stroke();
  ctx.restore();
}

/** 局部 roundRect（与 drawVowelSpace 系列同款兜底，避免依赖外部工具） */
function roundRectPathOn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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

/**
 * 实时元音落点视图（vowelSpace 画笔的 live 模式）
 * 窗口内落点按新旧渐隐（越新越亮越大），叠加窗口质心 × 与当前帧呼吸光点，
 * 供实时元音落点练习页逐帧调用（调用方负责清屏与尺寸）。
 */
export function paintVowelSpaceLive(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  series: SeriesLike,
  t0: number,
  t1: number,
  showLabels: boolean,
): void {
  const pal = chartPalette();
  drawVowelSpaceFrame(ctx, w, h, pal, showLabels);
  drawVowelRefs(ctx, w, h, pal, showLabels);
  drawFormantTarget(ctx, w, h, pal);

  // 渐隐落点：age 0（旧）→ 1（新），亮度/尺寸随之增长，密度形成残影轨迹
  const span = Math.max(1e-3, t1 - t0);
  let count = 0;
  let sf1 = 0;
  let sf2 = 0;
  ctx.save();
  ctx.fillStyle = pal.accent;
  for (let i = 0; i < series.t.length; i++) {
    const tt = series.t[i];
    if (tt < t0 - 0.05 || tt > t1 + 0.05) continue;
    const f1 = series.f1[i];
    const f2 = series.f2[i];
    if (series.f0[i] == null || f1 == null || f2 == null || !isFinite(f1) || !isFinite(f2)) continue;
    const age = Math.max(0, Math.min(1, (tt - t0) / span));
    ctx.globalAlpha = 0.06 + 0.5 * age * age;
    const [x, y] = vowelXY(f1, f2, w, h);
    ctx.beginPath();
    ctx.arc(x, y, 1.8 + 1.6 * age, 0, Math.PI * 2);
    ctx.fill();
    count++;
    sf1 += f1;
    sf2 += f2;
  }
  ctx.restore();

  // 窗口质心 ×（整体发音位置的锚点）
  if (count > 0) {
    drawVowelCentroid(ctx, w, h, [{ f1: sf1 / count, f2: sf2 / count }], pal.accent2);
  }

  // 当前落点呼吸光点（最新一个有效帧）
  for (let i = series.t.length - 1; i >= 0; i--) {
    const f1 = series.f1[i];
    const f2 = series.f2[i];
    if (series.f0[i] == null || f1 == null || f2 == null || !isFinite(f1) || !isFinite(f2)) continue;
    const [x, y] = vowelXY(f1, f2, w, h);
    ctx.save();
    ctx.shadowColor = pal.accent;
    ctx.shadowBlur = 14;
    ctx.fillStyle = pal.accent;
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

/* ------------------------------- 声域图 VRP ------------------------------- */

/**
 * VRP 声域图热力图：半音（纵轴，固定 C2–C6）× 响度（横轴 dBFS，自适应 5–95 分位），
 * 色深 = 驻留帧数。经典的 phonetogram 视图，直观呈现音域与各音高上的力度分布。
 */
export function drawVrpHeatmap(p: PaintContext, series: SeriesLike): void {
  const { ctx, w, h, t0, t1, pal, showLabels } = p;

  // 收集区间内有声帧 → (半音格, 1dB 桶) 计数
  const cells = new Map<string, number>();
  const dbs: number[] = [];
  for (let i = 0; i < series.t.length; i++) {
    const t = series.t[i];
    if (t < t0 - 0.05 || t > t1 + 0.05) continue;
    const f0 = series.f0[i];
    const db = series.rmsDb[i];
    if (f0 == null || !isFinite(f0) || !isFinite(db)) continue;
    const midi = Math.round(69 + 12 * Math.log2(f0 / 440));
    dbs.push(db);
    const bucket = Math.floor(db);
    const key = `${midi},${bucket}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }

  const [noteMin, noteMax] = [VRP_NOTE_MIN, VRP_NOTE_MAX];
  const yFor = (midi: number) => h - ((midi - noteMin) / (noteMax - noteMin)) * h;
  const rowH = h / (noteMax - noteMin);

  // 响度轴范围：有声帧 5–95 分位 ± 2dB，过窄时兜底
  dbs.sort((a, b) => a - b);
  const q = (frac: number) => dbs[Math.min(dbs.length - 1, Math.max(0, Math.floor(dbs.length * frac)))];
  const lo = dbs.length ? Math.floor(q(0.05) - 2) : -60;
  const hi = dbs.length ? Math.ceil(q(0.95) + 2) : -20;
  const span = Math.max(12, hi - lo);
  const xFor = (db: number) => ((db - lo) / span) * w;

  // 八度参考线（C3/C4/C5）
  ctx.save();
  ctx.setLineDash(DASH);
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.grid;
  ctx.font = '9px "Inter Tight", system-ui, sans-serif';
  for (const midi of [48, 60, 72]) {
    if (midi <= noteMin || midi >= noteMax) continue;
    const y = yFor(midi);
    dashedLine(ctx, 0, y, w, y);
    if (showLabels) {
      ctx.fillStyle = pal.textMuted;
      ctx.globalAlpha = 0.8;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      const hz = Math.round(440 * Math.pow(2, (midi - 69) / 12));
      ctx.fillText(`${freqToNote(hz).name} · ${hz}Hz`, 4, y - 2);
    }
  }
  ctx.restore();

  if (cells.size === 0) {
    if (showLabels) {
      ctx.save();
      ctx.fillStyle = pal.textMuted;
      ctx.globalAlpha = 0.6;
      ctx.font = '11px "Inter Tight", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('vrp.empty'), w / 2, h / 2);
      ctx.restore();
    }
    return;
  }

  // 热力格（色深 ∝ √驻留帧数）
  let maxCount = 1;
  for (const c of cells.values()) if (c > maxCount) maxCount = c;
  ctx.save();
  ctx.fillStyle = pal.accent;
  for (const [key, count] of cells) {
    const comma = key.indexOf(',');
    const midi = Number(key.slice(0, comma));
    const bucket = Number(key.slice(comma + 1));
    const x = xFor(bucket);
    const cw = Math.max(1.5, xFor(bucket + 1) - x - 0.5);
    const yTop = yFor(midi + 0.5);
    ctx.globalAlpha = 0.12 + 0.78 * Math.sqrt(count / maxCount);
    ctx.fillRect(x, yTop, cw, Math.max(2, rowH - 0.5));
  }
  ctx.restore();

  // 响度轴刻度
  if (showLabels) {
    ctx.save();
    ctx.fillStyle = pal.textMuted;
    ctx.globalAlpha = 0.75;
    ctx.font = '9px "Inter Tight", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const stepDb = span > 44 ? 20 : span > 22 ? 10 : 5;
    for (let db = Math.ceil(lo / stepDb) * stepDb; db <= lo + span; db += stepDb) {
      const x = xFor(db);
      if (x > 14 && x < w - 14) ctx.fillText(`${db}`, x, h - 2);
    }
    ctx.restore();
  }
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
