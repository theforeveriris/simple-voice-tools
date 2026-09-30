/**
 * 语谱图绘制
 * 将量化频带位图（行 × 频带，magma 伪彩色）绘制到画布，
 * 叠加时间刻度 / 频率刻度网格与 F1 / F2 共振峰轨迹点。
 */

import { SPEC_FMIN, SPEC_FMAX } from '@/constants';
import { specColorRgb } from '@/lib/audio/spectrogram';
import { formatClock } from './chartPainters';

const DASH: [number, number] = [4, 5];

/** 对数频率 → 纵向像素（低频在底部） */
export function specYFor(freq: number, h: number): number {
  return h - (Math.log(freq / SPEC_FMIN) / Math.log(SPEC_FMAX / SPEC_FMIN)) * h;
}

interface OverlaySeries {
  t: number[];
  f1: (number | null)[];
  f2: (number | null)[];
}

export interface SpecPaintOptions {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** 量化频带位图：行优先，每行 bands 字节 */
  pixels: Uint8Array;
  rows: number;
  bands: number;
  /** 每行对应的时间（秒，与行数等长或更短） */
  rowTimes: number[];
  t0: number;
  t1: number;
  /** 叠加的 F1/F2 轨迹与配色 */
  overlay?: { series: OverlaySeries; f1Color: string; f2Color: string };
  gridColor: string;
  textColor: string;
  showGrid: boolean;
  /** 播放头位置（秒），null = 不绘制 */
  playheadT?: number | null;
}

/**
 * 绘制一帧语谱图
 * 离屏画布按 rows×bands 逐像素着色后放大绘制，平滑插值得到连续色块。
 */
export function drawSpectrogram(o: SpecPaintOptions): void {
  const { ctx, w, h, pixels, rows, bands, rowTimes, t0, t1, gridColor, textColor, showGrid } = o;
  if (w < 8 || h < 8 || t1 - t0 < 1e-6 || rows < 2) return;

  // 1. 离屏位图
  const off = document.createElement('canvas');
  off.width = rows;
  off.height = bands;
  const offCtx = off.getContext('2d');
  if (!offCtx) return;
  const img = offCtx.createImageData(rows, bands);
  for (let r = 0; r < rows; r++) {
    for (let b = 0; b < bands; b++) {
      const [cr, cg, cb] = specColorRgb(pixels[r * bands + b] / 255);
      const p = (r * bands + b) * 4;
      img.data[p] = cr;
      img.data[p + 1] = cg;
      img.data[p + 2] = cb;
      img.data[p + 3] = 255;
    }
  }
  offCtx.putImageData(img, 0, 0);

  // 2. 放大绘制（频带 0 是最低频 → 翻转让低频在底部）
  // 按时间窗裁剪行范围，缩放查看时只绘制窗口内的行，保持锐度
  let r0 = 0;
  let r1 = rows - 1;
  if (rowTimes.length >= rows) {
    while (r0 < rows - 1 && rowTimes[r0] < t0) r0++;
    while (r1 > r0 && rowTimes[r1] > t1) r1--;
    if (r1 - r0 < 2) {
      r0 = Math.max(0, r0 - 1);
      r1 = Math.min(rows - 1, r1 + 1);
    }
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(0, h);
  ctx.scale(1, -1);
  ctx.drawImage(off, r0, 0, Math.max(1, r1 - r0), bands, 0, 0, w, h);
  ctx.restore();

  // 3. 网格与刻度
  if (showGrid) {
    ctx.save();
    ctx.setLineDash(DASH);
    ctx.lineWidth = 1;
    ctx.strokeStyle = gridColor;
    ctx.fillStyle = textColor;
    ctx.font = '9px "Inter Tight", system-ui, sans-serif';
    ctx.globalAlpha = 0.8;
    // 频率刻度（对数位置）
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const f of [250, 500, 1000, 2000, 4000]) {
      const y = specYFor(f, h);
      if (y < 6 || y > h - 6) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, 4, y - 5);
    }
    // 时间刻度
    const span = t1 - t0;
    const steps = [1, 2, 5, 10, 15, 30, 60, 120];
    const step = steps.find((s) => span / s <= 6) ?? 300;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const start = Math.ceil((t0 + 0.01) / step) * step;
    for (let t = start; t <= t1 + 1e-6; t += step) {
      const x = ((t - t0) / span) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      if (x < w - 24) ctx.fillText(formatClock(t), x, h - 2);
    }
    ctx.restore();
  }

  // 4. F1 / F2 轨迹点
  if (o.overlay) {
    const { series, f1Color, f2Color } = o.overlay;
    const drawTrack = (values: (number | null)[], color: string) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      for (let i = 0; i < series.t.length; i++) {
        const v = values[i];
        const t = series.t[i];
        if (v == null || t < t0 || t > t1) continue;
        const x = ((t - t0) / (t1 - t0)) * w;
        const y = specYFor(v, h);
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    };
    drawTrack(series.f1, f1Color);
    drawTrack(series.f2, f2Color);
  }

  // 播放头（回放位置指示线）
  const ph = o.playheadT;
  if (ph != null && isFinite(ph) && ph >= t0 && ph <= t1) {
    const x = ((ph - t0) / (t1 - t0)) * w;
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
  }
}
