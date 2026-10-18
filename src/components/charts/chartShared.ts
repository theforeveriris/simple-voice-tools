/**
 * 图表画笔公共件
 * chartPainters / vowelPainter / vrpPainter 共享的调色板、画布助手与类型。
 * 独立成文件避免「总入口 ← 拆出的 painter」相互引用成环。
 */

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

export interface SeriesLike {
  t: number[];
  f0: (number | null)[];
  rmsDb: number[];
  f1: (number | null)[];
  f2: (number | null)[];
}

export interface PaintContext {
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

export const DASH: [number, number] = [4, 5];

export function dashedLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** 圆角矩形路径（ctx.roundRect 可用则用之，否则 arcTo 兜底；图表间共用） */
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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
