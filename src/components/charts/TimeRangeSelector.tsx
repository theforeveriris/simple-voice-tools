/**
 * 时间轴区间选择器
 * 分析页每个图表下方的双滑块控件：
 * 背景以能量密度条预览整段录音，拖动滑块选择图表显示的时间区间。
 * 造型极简：细轨、细滑块、无内嵌文字。
 */

import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { RecordSeries } from '@/types';
import { formatClock } from './chartPainters';
import { cn } from '@/lib/utils';

interface TimeRangeSelectorProps {
  series: RecordSeries;
  /** 时间轴总长（秒） */
  total: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  className?: string;
}

const MIN_SPAN = 0.4; // 最小选择跨度（秒）
const BUCKETS = 90;

export function TimeRangeSelector({ series, total, value, onChange, className }: TimeRangeSelectorProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: 0 | 1 } | null>(null);
  const [dragging, setDragging] = useState<0 | 1 | null>(null);

  // 能量密度预览条：把 rmsDb 分桶取峰值，映射到条高
  const bars = useMemo(() => {
    const out = new Array<number>(BUCKETS).fill(-90);
    for (let i = 0; i < series.t.length; i++) {
      const b = Math.min(BUCKETS - 1, Math.floor((series.t[i] / Math.max(total, 0.01)) * BUCKETS));
      out[b] = Math.max(out[b], series.rmsDb[i]);
    }
    return out.map((db) => {
      const norm = Math.max(0, Math.min(1, (db + 90) / 85));
      return 0.08 + norm * 0.92;
    });
  }, [series, total]);

  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / Math.max(total, 0.01)) * 100))}%`;

  const posToT = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return p * total;
  };

  const applyDrag = (handle: 0 | 1, t: number) => {
    if (handle === 0) {
      onChange([Math.max(0, Math.min(t, value[1] - MIN_SPAN)), value[1]]);
    } else {
      onChange([value[0], Math.min(total, Math.max(t, value[0] + MIN_SPAN))]);
    }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    const t = posToT(e.clientX);
    // 点击处靠近哪个滑块就拖动哪个
    const handle: 0 | 1 = Math.abs(t - value[0]) <= Math.abs(t - value[1]) ? 0 : 1;
    dragRef.current = { handle };
    setDragging(handle);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    applyDrag(handle, t);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    applyDrag(dragRef.current.handle, posToT(e.clientX));
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(null);
  };

  return (
    <div className={cn('select-none', className)}>
      <div
        ref={trackRef}
        className="relative h-6 cursor-ew-resize touch-none overflow-hidden bg-surface-hi"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* 能量密度预览 */}
        <div className="absolute inset-0 flex items-end gap-px px-px pb-px">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-ink/10"
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>

        {/* 选中窗口 */}
        <div
          className="pointer-events-none absolute inset-y-0 border-x border-accent/70 bg-accent/10"
          style={{ left: pct(value[0]), width: `${(Math.min(100, ((value[1] - value[0]) / Math.max(total, 0.01)) * 100))}%` }}
        />

        {/* 两个细滑块 */}
        {([0, 1] as const).map((handle) => (
          <div
            key={handle}
            className={cn(
              'pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 bg-accent transition-transform',
              dragging === handle ? 'scale-x-150' : '',
            )}
            style={{ left: pct(value[handle]) }}
          />
        ))}
      </div>
      <p className="mt-1 text-center text-[10px] tabular-nums text-ink-2">
        已选 {formatClock(value[0])} – {formatClock(value[1])}
      </p>
    </div>
  );
}
