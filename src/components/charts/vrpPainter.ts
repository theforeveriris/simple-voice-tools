/**
 * 声域图 VRP 画笔
 * 半音（纵轴，固定 C2–C6）× 响度（横轴 dBFS，自适应 5–95 分位）的驻留热力图。
 * 经典的 phonetogram 视图，直观呈现音域与各音高上的力度分布。
 */

import { VRP_NOTE_MIN, VRP_NOTE_MAX, freqToNote } from '@/constants';
import { t } from '@/i18n';
import type { PaintContext, SeriesLike } from './chartShared';
import { DASH, dashedLine } from './chartShared';

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
