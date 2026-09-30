/**
 * 分析报告分享图（PNG）
 * Canvas 手绘 1080×1350（4:5 竖版）品牌报告卡：
 * 应用署名 + 平均基频大字 + 音域标尺 + 迷你音高曲线 + 关键统计，
 * 跟随当前主题色板。优先走系统分享（Web Share API），不支持时下载。
 */

import { BAND_COLORS, BAND_LABELS, bandOf } from '@/constants';
import type { AnalysisRecord, PitchBand } from '@/types';

/** 从文档根读取当前主题色（CSS 变量） */
function readTheme(): {
  card: string; surface: string; ink: string; ink2: string; accent: string; accent2: string; line: string;
} {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    card: v('--c-card', '#FFFEFB'),
    surface: v('--c-surface', '#F7F5F2'),
    ink: v('--c-ink', '#26242E'),
    ink2: v('--c-ink-2', '#6E6A78'),
    accent: v('--c-accent', '#5B5BD6'),
    accent2: v('--c-accent2', '#8B5BD6'),
    line: v('--c-line', '#E5E3EC'),
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexWithAlpha(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const W = 1080;
const H = 1350;
const PAD = 72;

function posPct(f: number): number {
  const MIN = 60, MAX = 520;
  return (Math.log(Math.max(MIN, Math.min(MAX, f)) / MIN) / Math.log(MAX / MIN)) * 100;
}

/** 绘制完整报告卡 */
function drawCard(record: AnalysisRecord): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  const t = readTheme();
  const stats = record.stats;
  const band = bandOf(stats.avgF0);

  // 背景（卡片色）
  ctx.fillStyle = t.card;
  ctx.fillRect(0, 0, W, H);

  /* 页眉 */
  ctx.fillStyle = t.accent;
  ctx.beginPath();
  ctx.arc(PAD + 9, PAD + 14, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = t.ink2;
  ctx.font = '500 30px "Inter Tight", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Simple Voice Tool', PAD + 30, PAD + 15);
  const d = new Date(record.createdAt);
  const dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  ctx.textAlign = 'right';
  ctx.fillText(dateStr, W - PAD, PAD + 15);
  ctx.strokeStyle = t.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, PAD + 58);
  ctx.lineTo(W - PAD, PAD + 58);
  ctx.stroke();

  /* 平均基频大字 + 音区徽标 */
  const numY = PAD + 190;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = t.ink;
  ctx.font = '600 128px "Inter Tight", system-ui, sans-serif';
  ctx.fillText(stats.avgF0.toFixed(1), PAD, numY);
  const numW = ctx.measureText(stats.avgF0.toFixed(1)).width;
  ctx.fillStyle = t.ink2;
  ctx.font = '400 40px "Inter Tight", system-ui, sans-serif';
  ctx.fillText('Hz', PAD + numW + 18, numY);
  ctx.fillStyle = t.accent;
  ctx.font = '600 44px "Inter Tight", system-ui, sans-serif';
  ctx.fillText(freqToNoteSafe(stats.avgF0), PAD + numW + 18 + 90, numY);

  // 音区徽标
  const chipX = W - PAD - 240;
  const chipColor = BAND_COLORS[band as PitchBand];
  ctx.fillStyle = hexWithAlpha(chipColor, 0.18);
  roundRect(ctx, chipX, numY - 62, 240, 62, 31);
  ctx.fill();
  ctx.fillStyle = t.ink;
  ctx.font = '600 30px "Inter Tight", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(BAND_LABELS[band], chipX + 120, numY - 30);

  /* 音域标尺 */
  const rulerY = numY + 60;
  const rulerH = 22;
  const rulerX = PAD;
  const rulerW = W - PAD * 2;
  const bands: PitchBand[] = ['low', 'male', 'transition', 'female', 'high'];
  // 裁剪圆角后重绘色带
  ctx.save();
  roundRect(ctx, rulerX, rulerY, rulerW, rulerH, rulerH / 2);
  ctx.clip();
  for (let i = 0; i < bands.length; i++) {
    const [f0, f1] = bandRange(bands[i]);
    const x0 = (posPct(f0) / 100) * rulerW;
    const x1 = i === bands.length - 1 ? rulerW : (posPct(f1) / 100) * rulerW;
    ctx.fillStyle = hexWithAlpha(BAND_COLORS[bands[i]], 0.32);
    ctx.fillRect(rulerX + x0, rulerY, x1 - x0 + 1, rulerH);
  }
  // P10–P90 括条
  const px0 = rulerX + (posPct(stats.p10F0) / 100) * rulerW;
  const px1 = rulerX + (posPct(stats.p90F0) / 100) * rulerW;
  ctx.fillStyle = 'rgba(40,38,52,0.32)';
  roundRect(ctx, px0, rulerY + 3, Math.max(8, px1 - px0), rulerH - 6, (rulerH - 6) / 2);
  ctx.fill();
  // 平均基频游标
  const cx = rulerX + (posPct(stats.avgF0) / 100) * rulerW;
  ctx.fillStyle = t.ink;
  roundRect(ctx, cx - 5, rulerY - 8, 10, rulerH + 16, 5);
  ctx.fill();
  ctx.restore();
  // 刻度
  ctx.fillStyle = t.ink2;
  ctx.font = '400 22px "Inter Tight", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const f of [100, 200, 300, 400, 500]) {
    ctx.fillText(String(f), rulerX + (posPct(f) / 100) * rulerW, rulerY + rulerH + 30);
  }
  ctx.font = '400 24px "Inter Tight", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`音域 P10–P90：${stats.p10F0.toFixed(0)} – ${stats.p90F0.toFixed(0)} Hz`, rulerX, rulerY + rulerH + 72);

  /* 迷你音高曲线 */
  const chartY = rulerY + rulerH + 110;
  const chartH = 330;
  ctx.fillStyle = t.surface;
  roundRect(ctx, PAD, chartY, W - PAD * 2, chartH, 28);
  ctx.fill();
  drawMiniPitch(ctx, record, PAD + 16, chartY + 16, W - PAD * 2 - 32, chartH - 32);

  /* 统计网格 */
  const statY = chartY + chartH + 64;
  const items: [string, string][] = [
    ['平均 F1', stats.avgF1 != null ? `${stats.avgF1.toFixed(0)} Hz` : '—'],
    ['平均 F2', stats.avgF2 != null ? `${stats.avgF2.toFixed(0)} Hz` : '—'],
    ['录音时长', `${stats.durationSec.toFixed(1)} 秒`],
    ['平均响度', `${stats.avgDb.toFixed(1)} dB`],
  ];
  if (stats.jitterPct != null) items.push(['Jitter', `${stats.jitterPct.toFixed(2)} %`]);
  if (stats.shimmerPct != null) items.push(['Shimmer', `${stats.shimmerPct.toFixed(2)} %`]);
  if (stats.hnrDb != null) items.push(['HNR', `${stats.hnrDb.toFixed(1)} dB`]);
  const colW = (W - PAD * 2) / 4;
  items.slice(0, 8).forEach(([label, value], i) => {
    const x = PAD + (i % 4) * colW;
    const y = statY + Math.floor(i / 4) * 96;
    ctx.textAlign = 'left';
    ctx.fillStyle = t.ink2;
    ctx.font = '400 24px "Inter Tight", system-ui, sans-serif';
    ctx.fillText(label, x, y);
    ctx.fillStyle = t.ink;
    ctx.font = '600 36px "Inter Tight", system-ui, sans-serif';
    ctx.fillText(value, x, y + 44);
  });

  /* 页脚 */
  ctx.fillStyle = t.ink2;
  ctx.font = '400 24px "Inter Tight", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Simple Voice Tool · 本地分析，不上传任何数据', W / 2, H - PAD + 20);

  return canvas;
}

function freqToNoteSafe(freq: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

function bandRange(band: PitchBand): [number, number] {
  switch (band) {
    case 'low': return [50, 85];
    case 'male': return [85, 165];
    case 'transition': return [165, 180];
    case 'female': return [180, 255];
    case 'high': return [255, 520];
  }
}

/** 迷你音高曲线（分区间着色） */
function drawMiniPitch(
  ctx: CanvasRenderingContext2D,
  record: AnalysisRecord,
  x0: number, y0: number, w: number, h: number,
): void {
  const { series } = record;
  const tMax = Math.max(0.001, record.durationSec);
  const fMin = 50, fMax = 520;
  const xOf = (t: number) => x0 + (t / tMax) * w;
  const yOf = (f: number) => y0 + h - ((f - fMin) / (fMax - fMin)) * h;

  // 区间背景
  for (const band of ['low', 'male', 'transition', 'female', 'high'] as PitchBand[]) {
    const [f0, f1] = bandRange(band);
    const yTop = yOf(Math.min(f1, fMax));
    const yBot = yOf(Math.max(f0, fMin));
    ctx.fillStyle = hexWithAlpha(BAND_COLORS[band], 0.14);
    ctx.fillRect(x0, yTop, w, yBot - yTop);
  }

  // 曲线
  ctx.save();
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let open = false;
  let strokeBand: PitchBand | null = null;
  for (let i = 0; i < series.t.length; i++) {
    const f = series.f0[i];
    if (f == null || !isFinite(f)) {
      if (open) { ctx.stroke(); open = false; strokeBand = null; }
      continue;
    }
    const band = bandOf(f);
    const x = xOf(series.t[i]);
    const y = yOf(f);
    if (!open || band !== strokeBand) {
      if (open) ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = BAND_COLORS[band];
      ctx.moveTo(x, y);
      open = true;
      strokeBand = band;
    } else {
      ctx.lineTo(x, y);
    }
  }
  if (open) ctx.stroke();
  ctx.restore();
}

/**
 * 生成并分享/下载报告图
 * 支持 Web Share API（移动端分享面板）时优先分享，否则下载 PNG。
 */
export async function exportShareImage(record: AnalysisRecord): Promise<'shared' | 'downloaded'> {
  const canvas = drawCard(record);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG export failed');
  const d = new Date(record.createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const filename = `voice-report-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.png`;
  const file = new File([blob], filename, { type: 'image/png' });

  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Simple Voice Tool · 分析报告' });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
