/**
 * 分析报告分享图（PNG）
 * Canvas 手绘 1080×1350（4:5 竖版）品牌报告卡：
 * 应用署名 + 平均基频大字 + 音域标尺 + 迷你音高曲线 + 关键统计，
 * 跟随当前主题色板。优先走系统分享（Web Share API），不支持时下载。
 */

import { BAND_COLORS, getBandRanges, bandOf, freqToNote } from '@/constants';
// 该文件内 t 已被主题色板局部变量占用，i18n 翻译函数以 ti 引用
import { t as ti } from '@/i18n';
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
  ctx.fillText(freqToNote(stats.avgF0).name, PAD + numW + 18 + 90, numY);

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
  ctx.fillText(ti(`band.${band}`), chipX + 120, numY - 30);

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
  ctx.fillText(ti('share.rangeLine', { a: stats.p10F0.toFixed(0), b: stats.p90F0.toFixed(0) }), rulerX, rulerY + rulerH + 72);

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
    [ti('analysis.statF1'), stats.avgF1 != null ? `${stats.avgF1.toFixed(0)} Hz` : '—'],
    [ti('analysis.statF2'), stats.avgF2 != null ? `${stats.avgF2.toFixed(0)} Hz` : '—'],
    [ti('analysis.statDuration'), `${stats.durationSec.toFixed(1)} ${ti('analysis.unitSec')}`],
    [ti('analysis.statDb'), `${stats.avgDb.toFixed(1)} dB`],
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
  ctx.fillText(ti('share.footer'), W / 2, H - PAD + 20);

  return canvas;
}

function bandRange(band: PitchBand): [number, number] {
  return getBandRanges()[band];
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
  const d = new Date(record.createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const filename = `voice-report-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.png`;
  return shareOrDownload(canvas, filename);
}

/** 画布 → PNG → 系统分享（可用时）或下载 */
async function shareOrDownload(canvas: HTMLCanvasElement, filename: string): Promise<'shared' | 'downloaded'> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG export failed');
  const file = new File([blob], filename, { type: 'image/png' });

  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: ti('share.shareTitle') });
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

/* ================================ 对比分享卡 ================================ */

/** A/B 双方概要块的行高基准 */
const CMP_TOP = PAD + 96;

/** 对比 Δ 指标表行：[指标, A 值, B 值, Δ] */
function compareRows(a: AnalysisRecord, b: AnalysisRecord): [string, string, string, string][] {
  const sa = a.stats;
  const sb = b.stats;
  const sign = (v: number, digits = 1) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
  const delta = (x: number | null | undefined, y: number | null | undefined, digits = 1) =>
    x == null || y == null ? '—' : `${sign(y - x, digits)}`;
  const fmt = (v: number | null | undefined, digits = 1, unit = ' Hz') =>
    v == null ? '—' : `${v.toFixed(digits)}${unit}`;

  const rows: [string, string, string, string][] = [
    [ti('analysis.rowAvgF0'), fmt(sa.avgF0), fmt(sb.avgF0), `${delta(sa.avgF0, sb.avgF0)} Hz`],
    [ti('compare.medianF0'), fmt(sa.medianF0), fmt(sb.medianF0), `${delta(sa.medianF0, sb.medianF0)} Hz`],
    [
      ti('compare.rangeP10P90'),
      `${sa.p10F0.toFixed(0)}–${sa.p90F0.toFixed(0)}`,
      `${sb.p10F0.toFixed(0)}–${sb.p90F0.toFixed(0)}`,
      `${delta(sa.p10F0, sb.p10F0, 0)} / ${delta(sa.p90F0, sb.p90F0, 0)} Hz`,
    ],
    [ti('compare.stdF0'), fmt(sa.stdF0), fmt(sb.stdF0), `${delta(sa.stdF0, sb.stdF0)} Hz`],
    [ti('analysis.rowAvgF1'), fmt(sa.avgF1, 0), fmt(sb.avgF1, 0), `${delta(sa.avgF1, sb.avgF1, 0)} Hz`],
    [ti('analysis.rowAvgF2'), fmt(sa.avgF2, 0), fmt(sb.avgF2, 0), `${delta(sa.avgF2, sb.avgF2, 0)} Hz`],
    [ti('compare.avgDb'), fmt(sa.avgDb, 1, ' dB'), fmt(sb.avgDb, 1, ' dB'), `${delta(sa.avgDb, sb.avgDb)} dB`],
  ];
  // 嗓音质量（任一方有值才显示，最多补两行保证排版）
  const vq: [string, number | null | undefined, number | null | undefined, number, string][] = [
    ['Jitter', sa.jitterPct, sb.jitterPct, 2, ' %'],
    ['Shimmer', sa.shimmerPct, sb.shimmerPct, 2, ' %'],
    ['HNR', sa.hnrDb, sb.hnrDb, 1, ' dB'],
    ['CPPS', sa.cppsDb, sb.cppsDb, 1, ' dB'],
  ].filter(([, x, y]) => x != null || y != null) as [string, number | null | undefined, number | null | undefined, number, string][];
  for (const [label, x, y, digits, unit] of vq.slice(0, 2)) {
    rows.push([label, fmt(x, digits, unit), fmt(y, digits, unit), `${delta(x, y, digits)}${unit}`]);
  }
  return rows;
}

/** 绘制 A vs B 对比报告卡（双曲线叠加 + Δ 指标表 + 各自音域） */
function drawCompareCard(a: AnalysisRecord, b: AnalysisRecord): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  const t = readTheme();
  const ranges = getBandRanges();
  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 背景 + 页眉
  ctx.fillStyle = t.card;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = t.accent;
  ctx.beginPath();
  ctx.arc(PAD + 9, PAD + 14, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = t.ink2;
  ctx.font = '500 30px "Inter Tight", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Simple Voice Tool', PAD + 30, PAD + 15);
  ctx.textAlign = 'right';
  ctx.fillText(ti('share.compareTitle'), W - PAD, PAD + 15);
  ctx.strokeStyle = t.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, PAD + 58);
  ctx.lineTo(W - PAD, PAD + 58);
  ctx.stroke();

  /* A / B 概要块 */
  const colW = (W - PAD * 2 - 48) / 2;
  const sides: { tag: string; rec: AnalysisRecord; color: string; x: number }[] = [
    { tag: 'A', rec: a, color: t.accent, x: PAD },
    { tag: 'B', rec: b, color: t.accent2, x: PAD + colW + 48 },
  ];
  for (const { tag, rec, color, x } of sides) {
    const stats = rec.stats;
    // 标签圆点 + 日期
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 21, CMP_TOP + 21, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.card;
    ctx.font = '700 26px "Inter Tight", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, x + 21, CMP_TOP + 23);
    ctx.fillStyle = t.ink2;
    ctx.font = '400 26px "Inter Tight", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(fmtDate(rec.createdAt), x + 56, CMP_TOP + 24);

    // 平均基频大字
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = t.ink;
    ctx.font = '600 84px "Inter Tight", system-ui, sans-serif';
    const numStr = stats.avgF0.toFixed(1);
    ctx.fillText(numStr, x, CMP_TOP + 150);
    const numW = ctx.measureText(numStr).width;
    ctx.fillStyle = t.ink2;
    ctx.font = '400 32px "Inter Tight", system-ui, sans-serif';
    ctx.fillText('Hz', x + numW + 14, CMP_TOP + 150);
    ctx.fillStyle = color;
    ctx.font = '600 38px "Inter Tight", system-ui, sans-serif';
    ctx.fillText(freqToNote(stats.avgF0).name, x + numW + 14 + 62, CMP_TOP + 150);

    // 音区徽标
    const band = bandOf(stats.avgF0);
    const bandLabel = ti(`band.${band}`);
    ctx.font = '600 26px "Inter Tight", system-ui, sans-serif';
    const chipW = ctx.measureText(bandLabel).width + 44;
    ctx.fillStyle = hexWithAlpha(BAND_COLORS[band], 0.18);
    roundRect(ctx, x, CMP_TOP + 178, chipW, 50, 25);
    ctx.fill();
    ctx.fillStyle = t.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bandLabel, x + chipW / 2, CMP_TOP + 204);

    // 音域行（P10–P90）
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = t.ink2;
    ctx.font = '400 26px "Inter Tight", system-ui, sans-serif';
    ctx.fillText(
      ti('share.rangeLine', { a: stats.p10F0.toFixed(0), b: stats.p90F0.toFixed(0) }),
      x, CMP_TOP + 282,
    );
  }

  // 分隔线
  ctx.strokeStyle = t.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, CMP_TOP + 320);
  ctx.lineTo(W - PAD, CMP_TOP + 320);
  ctx.stroke();

  /* Δ 指标表 */
  const rows = compareRows(a, b);
  const headY = CMP_TOP + 352;
  const rowH = 42;
  const labelX = PAD;
  const aRight = PAD + 500;
  const bRight = PAD + 710;
  const dRight = W - PAD;
  ctx.textBaseline = 'alphabetic';
  ctx.font = '500 24px "Inter Tight", system-ui, sans-serif';
  ctx.fillStyle = t.ink2;
  ctx.textAlign = 'left';
  ctx.fillText(ti('compare.colMetric'), labelX, headY);
  ctx.textAlign = 'right';
  ctx.fillStyle = t.accent;
  ctx.fillText('A', aRight, headY);
  ctx.fillStyle = t.accent2;
  ctx.fillText('B', bRight, headY);
  ctx.fillStyle = t.ink2;
  ctx.fillText(ti('compare.colDelta'), dRight, headY);

  rows.forEach(([label, va, vb, vd], i) => {
    const y = headY + 34 + i * rowH;
    ctx.strokeStyle = t.line;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD, y - rowH / 2 + 4);
    ctx.lineTo(W - PAD, y - rowH / 2 + 4);
    ctx.stroke();
    ctx.fillStyle = t.ink2;
    ctx.textAlign = 'left';
    ctx.font = '400 25px "Inter Tight", system-ui, sans-serif';
    ctx.fillText(label, labelX, y);
    ctx.fillStyle = t.ink;
    ctx.font = '600 25px "Inter Tight", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(va, aRight, y);
    ctx.fillText(vb, bRight, y);
    ctx.fillText(vd, dRight, y);
  });
  const tableEnd = headY + 34 + rows.length * rowH;

  /* 双曲线叠加图（x 按各自时长归一化对齐） */
  const chartY = tableEnd + 36;
  const chartH = Math.max(240, H - PAD - 28 - chartY);
  ctx.fillStyle = t.surface;
  roundRect(ctx, PAD, chartY, W - PAD * 2, chartH, 28);
  ctx.fill();

  const fMin = 50;
  const fMax = 520;
  const inX = PAD + 20;
  const inW = W - PAD * 2 - 40;
  const inY = chartY + 20;
  const inH = chartH - 40;
  const xOf = (tt: number, dur: number) => inX + (tt / Math.max(dur, 0.01)) * inW;
  const yOf = (f: number) => inY + inH - ((Math.max(fMin, Math.min(fMax, f)) - fMin) / (fMax - fMin)) * inH;

  // 音区背景
  for (const band of ['low', 'male', 'transition', 'female', 'high'] as PitchBand[]) {
    const [f0, f1] = ranges[band];
    ctx.fillStyle = hexWithAlpha(BAND_COLORS[band], 0.14);
    ctx.fillRect(inX, yOf(f1), inW, yOf(f0) - yOf(f1));
  }

  // 两条曲线（区间着色淡化为主题色，A/B 色差优先）
  for (const { rec, color } of [{ rec: a, color: t.accent }, { rec: b, color: t.accent2 }]) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let open = false;
    for (let i = 0; i < rec.series.t.length; i++) {
      const f = rec.series.f0[i];
      if (f == null || !isFinite(f)) {
        open = false;
        continue;
      }
      const x = xOf(rec.series.t[i], rec.durationSec);
      const y = yOf(f);
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

  // 图例（自右向左排布，最终视觉顺序 A → B）
  ctx.font = '600 26px "Inter Tight", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  let legendX = W - PAD - 20 - ctx.measureText('B').width - 46;
  for (const [tag, color] of [['B', t.accent2], ['A', t.accent]] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(legendX + 10, chartY + 30, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.ink;
    ctx.textAlign = 'left';
    ctx.fillText(tag, legendX + 28, chartY + 31);
    legendX -= 56;
  }

  /* 页脚 */
  ctx.fillStyle = t.ink2;
  ctx.font = '400 24px "Inter Tight", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ti('share.footer'), W / 2, H - PAD + 20);

  return canvas;
}

/**
 * 生成并分享/下载 A vs B 对比报告图
 * 入口：历史页多选两条记录进入对比浮层 → 分享按钮。
 */
export async function exportShareCompareImage(a: AnalysisRecord, b: AnalysisRecord): Promise<'shared' | 'downloaded'> {
  const canvas = drawCompareCard(a, b);
  const d = new Date(a.createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const filename = `voice-compare-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.png`;
  return shareOrDownload(canvas, filename);
}
