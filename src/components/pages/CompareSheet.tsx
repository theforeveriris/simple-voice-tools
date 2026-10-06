/**
 * 两两记录对比视图
 * 全屏浮层：两条记录的关键指标并排 + 差值列，
 * 音高曲线按相对时间对齐叠加（A 主色 / B 次色），便于观察训练前后变化。
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, TrendingUp, Share2 } from 'lucide-react';
import { BAND_COLORS, getBandRanges, bandOf } from '@/constants';
import { ShareCardSheet } from '@/components/share/ShareCardSheet';
import { renderShareCompareCard, shareCompareFilename } from '@/lib/export/shareCard';
import { chartPalette, collectVowelPoints, drawVowelSpaceFrame, drawVowelPoints, drawVowelCentroid, drawVowelRefs, vowelXY } from '@/components/charts/chartPainters';
import { AdviceCard } from '@/components/analysis/AdviceCard';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { useStore } from '@/store/useStore';
import type { AnalysisRecord } from '@/types';

const F_MIN = 50;
const F_MAX = 520;

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function deltaText(a: number | null | undefined, b: number | null | undefined, digits = 1): string {
  if (a == null || b == null) return '—';
  const d = b - a;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(digits)}`;
}

/** 叠加两条音高曲线（x 按各自时长归一化对齐起点） */
function drawOverlay(
  canvas: HTMLCanvasElement,
  a: AnalysisRecord,
  b: AnalysisRecord,
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
  if (w < 40 || h < 40) return;

  const pal = chartPalette();
  const padB = 18;
  const xOf = (t: number, dur: number) => (t / Math.max(dur, 0.01)) * w;
  const yOf = (f: number) => h - padB - ((Math.max(F_MIN, Math.min(F_MAX, f)) - F_MIN) / (F_MAX - F_MIN)) * (h - padB);

  // 音区背景（边界跟随自定义音区边界）
  const ranges = getBandRanges();
  for (const band of ['low', 'male', 'transition', 'female', 'high'] as const) {
    const [f0, f1] = ranges[band];
    const yTop = yOf(f1);
    const yBot = yOf(f0);
    ctx.fillStyle = BAND_COLORS[band];
    ctx.globalAlpha = band === 'transition' ? 0.05 : 0.1;
    ctx.fillRect(0, yTop, w, yBot - yTop);
  }
  ctx.globalAlpha = 1;

  const drawSeries = (rec: AnalysisRecord, color: string) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
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
  };
  drawSeries(a, pal.accent);
  drawSeries(b, pal.accent2);
}

/** 叠加两条记录的元音空间散点（A/B 双色 + 各自质心 × 标记） */
function drawVowelOverlay(
  canvas: HTMLCanvasElement,
  a: AnalysisRecord,
  b: AnalysisRecord,
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
  if (w < 40 || h < 40) return;

  const pal = chartPalette();
  const ptsA = collectVowelPoints(a.series, 0, a.durationSec);
  const ptsB = collectVowelPoints(b.series, 0, b.durationSec);
  drawVowelSpaceFrame(ctx, w, h, pal, false);
  drawVowelPoints(ctx, w, h, ptsA, pal.accent, { alpha: 0.16 });
  drawVowelPoints(ctx, w, h, ptsB, pal.accent2, { alpha: 0.16 });
  drawVowelCentroid(ctx, w, h, ptsA, pal.accent);
  drawVowelCentroid(ctx, w, h, ptsB, pal.accent2);
  drawVowelRefs(ctx, w, h, pal, false);

  // 质心旁标注 A / B
  const labelCentroid = (pts: { f1: number; f2: number }[], tag: string, color: string) => {
    if (pts.length === 0) return;
    let sf1 = 0;
    let sf2 = 0;
    for (const p of pts) {
      sf1 += p.f1;
      sf2 += p.f2;
    }
    const [x, y] = vowelXY(sf1 / pts.length, sf2 / pts.length, w, h);
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = 'bold 10px "Inter Tight", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(tag, x + 7, y + 4);
    ctx.restore();
  };
  labelCentroid(ptsA, 'A', pal.accent);
  labelCentroid(ptsB, 'B', pal.accent2);
}

export function CompareSheet({
  pair,
  onClose,
}: {
  pair: [AnalysisRecord, AnalysisRecord];
  onClose: () => void;
}) {
  useI18n();
  const [a, b] = pair;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showGrid = useStore((s) => s.settings.showGrid);
  const adviceMode = useStore((s) => s.settings.adviceMode);
  const adviceOnCompare = useStore((s) => s.settings.adviceOnCompare);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => drawOverlay(canvas, a, b);
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [a, b]);

  const vowelCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = vowelCanvasRef.current;
    if (!canvas) return;
    const paint = () => drawVowelOverlay(canvas, a, b);
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [a, b]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sA = a.stats;
  const sB = b.stats;
  const hasVQ = sA.jitterPct != null || sB.jitterPct != null;
  const hasVowel = sA.avgF1 != null || sB.avgF1 != null;

  const rows: [string, string, string, string][] = [
    [t('analysis.rowAvgF0'), `${sA.avgF0.toFixed(1)} Hz`, `${sB.avgF0.toFixed(1)} Hz`, `${deltaText(sA.avgF0, sB.avgF0)} Hz`],
    [t('compare.medianF0'), `${sA.medianF0.toFixed(1)} Hz`, `${sB.medianF0.toFixed(1)} Hz`, `${deltaText(sA.medianF0, sB.medianF0)} Hz`],
    [t('compare.rangeP10P90'), `${sA.p10F0.toFixed(0)}–${sA.p90F0.toFixed(0)}`, `${sB.p10F0.toFixed(0)}–${sB.p90F0.toFixed(0)}`, `${deltaText(sA.p10F0, sB.p10F0, 0)} / ${deltaText(sA.p90F0, sB.p90F0, 0)} Hz`],
    [t('compare.stdF0'), `${sA.stdF0.toFixed(1)} Hz`, `${sB.stdF0.toFixed(1)} Hz`, `${deltaText(sA.stdF0, sB.stdF0)} Hz`],
    [t('analysis.rowAvgF1'), sA.avgF1 != null ? `${sA.avgF1.toFixed(0)} Hz` : '—', sB.avgF1 != null ? `${sB.avgF1.toFixed(0)} Hz` : '—', `${deltaText(sA.avgF1, sB.avgF1, 0)} Hz`],
    [t('analysis.rowAvgF2'), sA.avgF2 != null ? `${sA.avgF2.toFixed(0)} Hz` : '—', sB.avgF2 != null ? `${sB.avgF2.toFixed(0)} Hz` : '—', `${deltaText(sA.avgF2, sB.avgF2, 0)} Hz`],
    [t('compare.avgDb'), `${sA.avgDb.toFixed(1)} dB`, `${sB.avgDb.toFixed(1)} dB`, `${deltaText(sA.avgDb, sB.avgDb)} dB`],
    ...(hasVQ
      ? ([
          ['Jitter', sA.jitterPct != null ? `${sA.jitterPct.toFixed(2)}%` : '—', sB.jitterPct != null ? `${sB.jitterPct.toFixed(2)}%` : '—', `${deltaText(sA.jitterPct, sB.jitterPct, 2)}%`],
          ['Shimmer', sA.shimmerPct != null ? `${sA.shimmerPct.toFixed(2)}%` : '—', sB.shimmerPct != null ? `${sB.shimmerPct.toFixed(2)}%` : '—', `${deltaText(sA.shimmerPct, sB.shimmerPct, 2)}%`],
          ['HNR', sA.hnrDb != null ? `${sA.hnrDb.toFixed(1)} dB` : '—', sB.hnrDb != null ? `${sB.hnrDb.toFixed(1)} dB` : '—', `${deltaText(sA.hnrDb, sB.hnrDb)} dB`],
          ...(sA.cppsDb != null || sB.cppsDb != null
            ? ([['CPPS', sA.cppsDb != null ? `${sA.cppsDb.toFixed(1)} dB` : '—', sB.cppsDb != null ? `${sB.cppsDb.toFixed(1)} dB` : '—', `${deltaText(sA.cppsDb, sB.cppsDb)} dB`]] as [string, string, string, string][])
            : []),
        ] as [string, string, string, string][])
      : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-noswipe className="fixed inset-0 z-[60] overflow-y-auto bg-surface"
    >
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
            <TrendingUp size={19} className="text-accent" />
            {t('compare.title')}
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShareOpen(true)}
              className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-accent"
              aria-label={t('compare.shareAria')}
              title={t('compare.shareTitle')}
            >
              <Share2 size={17} />
            </button>
            <button
              onClick={onClose}
              className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-ink"
              aria-label={t('compare.closeAria')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* A / B 标识 */}
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {([['A', a], ['B', b]] as const).map(([tag, rec]) => (
            <div key={tag} className="min-w-0 rounded-[18px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05)]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${tag === 'A' ? 'bg-accent' : 'bg-accent2'}`}>
                  {tag}
                </span>
                <span className="min-w-0 text-xs text-ink-2">{fmtDate(rec.createdAt)}</span>
                {rec.mode && (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-on-accent-soft">
                    {t(`mode.${rec.mode}`)}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">
                {rec.stats.avgF0.toFixed(1)}
                <span className="ml-1 text-xs font-normal text-ink-2">Hz</span>
              </p>
              <p className="truncate text-[11px] text-ink-2">{rec.note || t('compare.durationNote', { n: rec.stats.durationSec.toFixed(1) })}</p>
            </div>
          ))}
        </div>

        {/* 叠加曲线 */}
        <div className="mt-3.5 rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05)]">
          <div className="mb-1.5 flex items-center justify-between px-0.5">
            <span className="text-xs font-medium tracking-wide text-ink-2">{t('compare.overlayTitle')}</span>
            <div className="flex items-center gap-3 text-[11px] text-ink-2">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />A</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent2" />B</span>
            </div>
          </div>
          <canvas ref={canvasRef} className="block h-[220px] w-full sm:h-[280px]" aria-label={t('compare.overlayAria')} />
          {!showGrid && <p className="mt-1 text-center text-[10px] text-ink-2">{t('compare.gridHint')}</p>}
        </div>

        {/* 元音空间叠加（任一记录有共振峰数据时显示） */}
        {hasVowel && (
          <div className="mt-3.5 rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05)]">
            <div className="mb-1.5 flex items-center justify-between px-0.5">
              <span className="text-xs font-medium tracking-wide text-ink-2">{t('compare.vowelTitle')}</span>
              <div className="flex items-center gap-3 text-[11px] text-ink-2">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />A</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent2" />B</span>
              </div>
            </div>
            <canvas ref={vowelCanvasRef} className="block h-[240px] w-full sm:h-[300px]" aria-label={t('compare.vowelAria')} />
            <p className="mt-1 text-center text-[10px] text-ink-2">
              {t('compare.vowelHint')}
            </p>
          </div>
        )}

        {/* 指标对比表 */}
        <div className="mt-3.5 rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05)]">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] text-ink-2">
                <th className="pb-2 text-left font-medium">{t('compare.colMetric')}</th>
                <th className="pb-2 text-right font-medium text-accent">A</th>
                <th className="pb-2 text-right font-medium text-accent2">B</th>
                <th className="pb-2 text-right font-medium">{t('compare.colDelta')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, va, vb, vd]) => (
                <tr key={label} className="border-t border-black/[0.04]">
                  <td className="py-2 text-[11px] text-ink-2">{label}</td>
                  <td className="py-2 text-right text-xs font-medium tabular-nums text-ink">{va}</td>
                  <td className="py-2 text-right text-xs font-medium tabular-nums text-ink">{vb}</td>
                  <td className="py-2 text-right text-xs font-medium tabular-nums text-ink">{vd}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-ink-2">
            {t('compare.bandNote', { a: t(`band.${bandOf(sA.avgF0)}`), b: t(`band.${bandOf(sB.avgF0)}`) })}
          </p>
        </div>

        {/* 训练建议（实验性，设置 → 实验性功能 → 在对比页面使用建议） */}
        {adviceOnCompare && adviceMode !== 'none' && (
          <div className="mt-3.5">
            <AdviceCard records={pair} />
          </div>
        )}
      </div>

      <ShareCardSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        render={(style) => renderShareCompareCard(a, b, style)}
        filename={shareCompareFilename(a)}
      />
    </motion.div>
  );
}
