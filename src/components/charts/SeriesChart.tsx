/**
 * 图表画布组件
 * - live 模式：从录音引擎读取实时缓冲，requestAnimationFrame 驱动滚动绘制
 * - 静态模式：绑定某条分析记录与时间区间，数据/尺寸变化时重绘；
 *   时间序列图表（音高/能量/共振峰）支持按住查看 crosshair 读数
 */

import { useEffect, useRef } from 'react';
import { recorder } from '@/lib/audio/recorder';
import { LIVE_WINDOW_SEC } from '@/constants';
import { useStore } from '@/store/useStore';
import type { RecordSeries } from '@/types';
import { paintChart, drawCrosshair } from './chartPainters';
import type { CrosshairKind } from './chartPainters';
import { cn } from '@/lib/utils';

export type ChartKind = 'pitch' | 'energy' | 'formant' | 'vowelSpace' | 'vrp';

/** 支持 crosshair 查值的图表种类 */
const CROSSHAIR_KINDS: ChartKind[] = ['pitch', 'energy', 'formant'];

interface SeriesChartProps {
  kind: ChartKind;
  /** live = 实时绘制录音引擎数据 */
  live?: boolean;
  /** 静态模式：数据序列 */
  series?: RecordSeries;
  /** 静态模式：显示的时间区间 [t0, t1]（秒） */
  range?: [number, number];
  /** 静态模式：播放头位置（秒），null = 不显示 */
  playhead?: number | null;
  className?: string;
}

export function SeriesChart({ kind, live = false, series, range, playhead, className }: SeriesChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);
  // crosshair 当前位置（秒），null = 未激活
  const crossTRef = useRef<number | null>(null);
  // 让 rAF 循环与 ResizeObserver 始终读到最新 props
  // （drawFrame 仅在 effect / rAF / ResizeObserver 回调中执行，渲染期写入是刻意的）
  const propsRef = useRef({ kind, live, series, range, playhead });
  // eslint-disable-next-line react-hooks/refs
  propsRef.current = { kind, live, series, range, playhead };

  const drawFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    if (w < 8 || h < 8) return;
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cur = propsRef.current;
    const settings = useStore.getState().settings;
    const showGrid = settings.showGrid;
    const target: [number, number] | null = settings.targetEnabled
      ? [settings.targetF0Min, settings.targetF0Max]
      : null;

    if (cur.live) {
      const snap = recorder.getLive();
      const t1 = Math.max(LIVE_WINDOW_SEC, snap.elapsedSec);
      const t0 = t1 - LIVE_WINDOW_SEC;
      paintChart(
        cur.kind, ctx, w, h,
        { t: snap.t, f0: snap.f0.map((v) => (isFinite(v) ? v : null)), rmsDb: snap.rmsDb, f1: snap.f1.map((v) => (isFinite(v) ? v : null)), f2: snap.f2.map((v) => (isFinite(v) ? v : null)) },
        t0, t1, showGrid, false, true, null, cur.kind === 'pitch' ? target : null,
      );
    } else if (cur.series && cur.range) {
      paintChart(cur.kind, ctx, w, h, cur.series, cur.range[0], cur.range[1], showGrid, true, false, cur.playhead ?? null, cur.kind === 'pitch' ? target : null);
      // crosshair（按住查值）
      if (crossTRef.current != null && (CROSSHAIR_KINDS as string[]).includes(cur.kind)) {
        drawCrosshair(cur.kind as CrosshairKind, ctx, w, h, cur.series, cur.range[0], cur.range[1], crossTRef.current);
      }
    }
  };

  // 尺寸自适应
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      if (!propsRef.current.live) drawFrame();
    });
    ro.observe(canvas);
    return () => ro.disconnect();

  }, []);

  // 静态模式：数据 / 区间 / 播放头变化时重绘
  useEffect(() => {
    if (!live) drawFrame();

  }, [live, series, range, playhead]);

  // 实时模式：rAF 循环
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const loop = () => {
      drawFrame();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);

  }, [live]);

  /* ---------- crosshair 交互（仅静态时间序列图） ---------- */
  const crossActiveRef = useRef(false);
  const supportsCrosshair = !live && (CROSSHAIR_KINDS as string[]).includes(kind);

  const pointerToT = (clientX: number): number | null => {
    const canvas = canvasRef.current;
    const cur = propsRef.current;
    if (!canvas || !cur.range) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    const frac = (clientX - rect.left) / rect.width;
    const t = cur.range[0] + frac * (cur.range[1] - cur.range[0]);
    return Math.max(cur.range[0], Math.min(cur.range[1], t));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!supportsCrosshair) return;
    const t = pointerToT(e.clientX);
    if (t == null) return;
    crossActiveRef.current = true;
    crossTRef.current = t;
    // 横向拖动查值，纵向仍可滚动页面
    e.currentTarget.setPointerCapture(e.pointerId);
    drawFrame();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!crossActiveRef.current) return;
    const t = pointerToT(e.clientX);
    if (t == null) return;
    crossTRef.current = t;
    drawFrame();
  };

  const endCrosshair = () => {
    if (!crossActiveRef.current) return;
    crossActiveRef.current = false;
    crossTRef.current = null;
    drawFrame();
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={supportsCrosshair ? onPointerDown : undefined}
      onPointerMove={supportsCrosshair ? onPointerMove : undefined}
      onPointerUp={supportsCrosshair ? endCrosshair : undefined}
      onPointerCancel={supportsCrosshair ? endCrosshair : undefined}
      onPointerLeave={supportsCrosshair ? endCrosshair : undefined}
      style={supportsCrosshair ? { touchAction: 'pan-y' } : undefined}
      className={cn('block h-full w-full', className)}
    />
  );
}
