/**
 * 元音空间画笔
 * F1×F2 平面（双对数、F2 倒置）的网格、参考元音、散点、目标区与实时落点视图。
 * 分析页散点、对比页叠加、实时元音落点页共用。
 */

import { VOWEL_AXIS_F1, VOWEL_AXIS_F2, VOWEL_REFS, getFormantTarget } from '@/constants';
import type { ChartPalette, PaintContext, SeriesLike } from './chartShared';
import { DASH, dashedLine, roundRectPath, chartPalette } from './chartShared';

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
  roundRectPath(ctx, left, top, right - left, bottom - top, 8);
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

export type { ChartPalette, PaintContext, SeriesLike };
