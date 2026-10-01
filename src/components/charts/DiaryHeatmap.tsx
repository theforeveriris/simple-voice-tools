/**
 * 用声日记（GitHub 风格日历热力图）
 * 每天一格（列 = 周，行 = 周起始日起的七天，周起始日跟随设置：默认周一，可选周日），
 * 展示近半年（26 周）的练习打卡情况：
 *   次数 / 总时长：格子深浅 = 活跃程度
 *   平均基频：格子颜色 = 当日平均基频所属音区色（观察音区漂移）
 * 数据全部来自 records 的 durationSec / createdAt / stats.avgF0，纯聚合展示。
 * 点选格子显示当日概要。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { BAND_COLORS, bandOf } from '@/constants';
import { chartPalette } from './chartPainters';
import { t, localeTag } from '@/i18n';
import { useStore } from '@/store/useStore';
import type { AnalysisRecord } from '@/types';
import { cn } from '@/lib/utils';

export type DiaryMetric = 'count' | 'duration' | 'avgF0';

/** 单元格与间距（px）：列数按容器宽度自适应，窄屏 ~25 周、宽屏最多一年 */
const CELL = 12;
const GAP = 2;
const MIN_WEEKS = 10;
const MAX_WEEKS = 53;
/** 每级深浅的门槛（次数） */
const COUNT_STEPS = [1, 2, 3, 5];
/** 每级深浅的门槛（秒） */
const DURATION_STEPS = [10, 30, 60, 120];

interface DayStat {
  /** 当日零点（本地时区）epoch ms */
  day: number;
  count: number;
  durationSec: number;
  /** 当日平均基频（无发声记录时 NaN） */
  avgF0: number;
}

const DAY_MS = 86400000;

/** 本地时区的当日零点 */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 列对齐偏移：weekStart=1（默认）按周一对齐，0 按周日对齐 */
function weekOffset(day: number, weekStart: 0 | 1): number {
  const d = new Date(day).getDay();
  return weekStart === 1 ? (d + 6) % 7 : d;
}

/** 聚合记录到「天」（平均基频只对有声记录求均值，避免静音记录稀释） */
function aggregate(records: AnalysisRecord[]): Map<number, DayStat> {
  const map = new Map<number, DayStat>();
  // 有声记录条数（day → n），换算日均值用
  const voiced = new Map<number, number>();
  for (const r of records) {
    const day = startOfDay(r.createdAt);
    let stat = map.get(day);
    if (!stat) {
      stat = { day, count: 0, durationSec: 0, avgF0: NaN };
      map.set(day, stat);
    }
    stat.count += 1;
    stat.durationSec += r.stats.durationSec;
    if (r.stats.avgF0 > 0) {
      stat.avgF0 = Number.isNaN(stat.avgF0) ? r.stats.avgF0 : stat.avgF0 + r.stats.avgF0;
      voiced.set(day, (voiced.get(day) ?? 0) + 1);
    }
  }
  for (const [day, n] of voiced) {
    const stat = map.get(day)!;
    stat.avgF0 /= n;
  }
  return map;
}

interface CellLayout {
  x: number;
  y: number;
  stat: DayStat | null;
}

interface PaintLayout {
  padL: number;
  padT: number;
  cell: number;
  gap: number;
  cols: number;
  cells: CellLayout[];
}

/** 圆角小方格路径（roundRect 兜底，旧 Safari 无此 API） */
function cellPath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, size, size, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, r);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
}

function drawHeatmap(
  canvas: HTMLCanvasElement,
  days: Map<number, DayStat>,
  metric: DiaryMetric,
  selectedDay: number | null,
  weekStart: 0 | 1,
): PaintLayout | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const dpr = window.devicePixelRatio || 1;
  const pal = chartPalette();

  const padL = 20;
  const padT = 16;
  const gap = GAP;
  const cell = CELL;
  const weeks = Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, Math.floor((w - padL - 2) / (cell + gap))));
  const h = padT + 7 * (cell + gap) + 2;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // 起点对齐到周起始日（含今天在内的最后 weeks 周）
  const today = startOfDay(Date.now());
  const gridStart = today - (weeks * 7 - 1) * DAY_MS;
  const firstCol = gridStart - weekOffset(gridStart, weekStart) * DAY_MS;

  const cells: CellLayout[] = [];

  // 月份标签（月份变化的列上标注，间隔太近时跳过）
  ctx.save();
  ctx.fillStyle = pal.textMuted;
  ctx.globalAlpha = 0.75;
  ctx.font = '9px "Inter Tight", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let lastLabelCol = -4;
  for (let col = 0; col < weeks; col++) {
    const colDay = firstCol + col * 7 * DAY_MS;
    const d = new Date(colDay);
    const prev = new Date(colDay - 7 * DAY_MS);
    if (d.getMonth() !== prev.getMonth() && col - lastLabelCol >= 3) {
      ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, padL + col * (cell + gap), 10);
      lastLabelCol = col;
    }
  }
  // 行标签：第 0 / 2 / 4 行 = 周起始日 +0/+2/+4 天
  // （周一起始：一/三/五；周日起始：日/二/四），沿用本地化窄格式的星期名
  ctx.textBaseline = 'middle';
  for (const row of [0, 2, 4]) {
    const label = new Date(firstCol + row * DAY_MS).toLocaleDateString(localeTag(), { weekday: 'narrow' });
    ctx.fillText(label, 2, padT + row * (cell + gap) + cell / 2);
  }
  ctx.restore();

  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < 7; row++) {
      const day = firstCol + (col * 7 + row) * DAY_MS;
      const stat = day > today ? null : days.get(day) ?? null;
      const x = padL + col * (cell + gap);
      const y = padT + row * (cell + gap);
      cells.push({ x, y, stat });

      ctx.save();
      if (!stat) {
        // 未来日期不画；过去的空日画淡底格
        if (day <= today) {
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = pal.grid;
          cellPath(ctx, x, y, cell, 2.5);
          ctx.fill();
        }
        ctx.restore();
        continue;
      }

      const selected = selectedDay === stat.day;
      let fill: string;
      if (metric === 'avgF0') {
        fill = stat.avgF0 > 0 ? BAND_COLORS[bandOf(stat.avgF0)] : pal.grid;
        ctx.globalAlpha = stat.avgF0 > 0 ? 0.8 : 0.55;
      } else {
        const v = metric === 'count' ? stat.count : stat.durationSec;
        const steps = metric === 'count' ? COUNT_STEPS : DURATION_STEPS;
        let level = 0;
        for (const s of steps) if (v >= s) level++;
        fill = level === 0 ? pal.grid : pal.accent;
        ctx.globalAlpha = level === 0 ? 0.55 : [0.18, 0.38, 0.62, 0.9][level - 1];
      }
      ctx.fillStyle = fill;
      cellPath(ctx, x, y, cell, 2.5);
      ctx.fill();
      if (selected) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = pal.ink;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  return { padL, padT, cell, gap, cols: weeks, cells };
}

export function DiaryHeatmap({
  records,
  metric,
  className,
}: {
  records: AnalysisRecord[];
  metric: DiaryMetric;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<PaintLayout | null>(null);
  const [selected, setSelected] = useState<DayStat | null>(null);
  // 周起始日：1 = 周一（默认），0 = 周日
  const weekStart = useStore((s) => s.settings.diaryWeekStart);

  const days = useMemo(() => aggregate(records), [records]);

  // 渲染期派生重置（与 AnalysisPage NoteDialog 同一模式）：
  // 指标或数据变化后，先前点选的当日概要已不可信，直接清掉
  const [resetKey, setResetKey] = useState({ metric, records });
  if (resetKey.metric !== metric || resetKey.records !== records) {
    setResetKey({ metric, records });
    setSelected(null);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => {
      layoutRef.current = drawHeatmap(canvas, days, metric, selected?.day ?? null, weekStart);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [days, metric, selected?.day, weekStart]);

  // 指标或数据变化后的选中清理由上方渲染期派生逻辑处理
  const pick = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const step = layout.cell + layout.gap;
    const col = Math.floor((x - layout.padL) / step);
    const row = Math.floor((y - layout.padT) / step);
    if (col < 0 || col >= layout.cols || row < 0 || row >= 7) {
      setSelected(null);
      return;
    }
    const cell = layout.cells[col * 7 + row];
    setSelected(cell?.stat ?? null);
  };

  // 当日概要行
  const info = (() => {
    if (!selected) return null;
    const dateLabel = new Date(selected.day).toLocaleDateString(localeTag(), { month: 'numeric', day: 'numeric' });
    const parts = [t('history.diaryCount', { n: selected.count })];
    if (selected.durationSec > 0) parts.push(t('common.sec', { n: Math.round(selected.durationSec) }));
    if (selected.avgF0 > 0) parts.push(`${t('history.diaryF0', { f0: selected.avgF0.toFixed(1) })}`);
    return `${dateLabel} · ${parts.join(' · ')}`;
  })();

  return (
    <div className={cn('select-none', className)}>
      <canvas
        ref={canvasRef}
        onPointerDown={pick}
        className="block w-full cursor-pointer touch-none"
        aria-label={t('history.diary')}
      />
      <div className="mt-2 flex min-h-4 items-center justify-between gap-3 text-[10px] text-ink-2">
        <span className="min-w-0 truncate">
          {info ?? t('history.diaryHint')}
        </span>
        {/* 图例：次数/时长为深浅梯度，基频为音区色 */}
        {metric === 'avgF0' ? (
          <span className="flex shrink-0 items-center gap-1">
            {(['low', 'male', 'transition', 'female', 'high'] as const).map((b) => (
              <span key={b} className="size-2 rounded-[2px]" style={{ background: BAND_COLORS[b], opacity: 0.8 }} />
            ))}
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1">
            <span>{t('history.diaryLess')}</span>
            {[0.18, 0.38, 0.62, 0.9].map((a) => (
              <span key={a} className="size-2 rounded-[2px]" style={{ background: 'var(--c-accent)', opacity: a }} />
            ))}
            <span>{t('history.diaryMore')}</span>
          </span>
        )}
      </div>
    </div>
  );
}
