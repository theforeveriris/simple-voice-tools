/**
 * 实时浮层（LiveSheet）的统一绘制循环。
 * 四个 *LiveSheet（F0 / 元音 / VRP / 语谱）历史上各自复制了同一套
 * rAF 骨架：取画布 2D 上下文 → DPR 变换 → 清屏 → 取监听快照 →
 * 调 paint → 按节流间隔抽读数。本 hook 把骨架收敛为一处，
 * 各 Sheet 只提供 paint 回调与可选的 readout 采样函数。
 *
 * paint 在每帧调用（画布尺寸 ≥8px 时）；sampleReadout 在
 * READOUT_INTERVAL_MS 节流后调用，其返回值通过返回的 setReadout
 * 之外的方式不更新——本 hook 自带 readout 状态并返回，见下。
 */
import { useEffect, useRef, useState } from 'react';
import { useLiveCanvas } from './useLiveCanvas';

/** 读数刷新间隔（ms）：约 8Hz，避免 setState 过频 */
const READOUT_INTERVAL_MS = 120;

export interface LiveSheetLoopOptions<R> {
  /**
   * 每帧绘制回调。ctx 已完成 DPR 变换并清屏，坐标系为 CSS 像素。
   * 返回 void；异常由调用方保证不抛（与原实现一致，画笔内部自兜底）。
   */
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** 节流后的读数采样（可选，如不需要读数则省略） */
  sampleReadout?: () => R;
  /** 读数比较：返回 true 表示值未变化、跳过 setState（可选，默认总是更新） */
  isEqual?: (a: R, b: R | null) => boolean;
}

/**
 * 返回 attachCanvas 供 <canvas ref> 使用；readout 为节流采样的最新读数。
 * deps 变化时循环自动重建（与原各 Sheet 的 effect 依赖一致）。
 */
export function useLiveSheetLoop<R>({ paint, sampleReadout, isEqual }: LiveSheetLoopOptions<R>) {
  const { canvasRef, attachCanvas, sizeRef, dprRef } = useLiveCanvas();
  const [readout, setReadout] = useState<R | null>(null);
  // paint / sampleReadout / isEqual 经 ref 透传：调用方无需 useCallback，
  // 重建循环的依赖只由 deps 参数控制。
  // 用 effect 同步最新回调（不在渲染期写 ref），下一帧 rAF 读到的即本次渲染的值
  const cbRef = useRef({ paint, sampleReadout, isEqual });
  useEffect(() => {
    cbRef.current = { paint, sampleReadout, isEqual };
  });

  useEffect(() => {
    let raf = 0;
    let lastReadout = 0;
    let prev: R | null = null;
    const loop = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const { w, h } = sizeRef.current;
        if (w >= 8 && h >= 8) {
          const dpr = dprRef.current;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          cbRef.current.paint(ctx, w, h);
          const sample = cbRef.current.sampleReadout;
          if (sample && now - lastReadout > READOUT_INTERVAL_MS) {
            lastReadout = now;
            const next = sample();
            const same = cbRef.current.isEqual?.(next, prev) ?? false;
            if (!same) {
              prev = next;
              setReadout(next);
            }
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // 依赖仅含 ref 对象与 canvas 状态；行为变化经 deps 参数或 cbRef 透传
  }, [canvasRef, sizeRef, dprRef]);

  return { attachCanvas, readout };
}
