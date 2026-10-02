/**
 * 实时画布的尺寸自适应（DPR 感知）。
 * 画布只在 live 阶段挂载，因此返回回调 ref（attachCanvas）：挂载瞬间同步测量
 * 尺寸并启用 ResizeObserver，后续窗口 / 布局变化继续跟随。rAF 循环经 canvasRef
 * 读取画布、sizeRef 读取 CSS 尺寸；若用 effect 初始化会在挂载时拿不到画布而失效。
 */
import { useCallback, useEffect, useRef } from 'react';

export function useLiveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);
  const roRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback((canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    dprRef.current = window.devicePixelRatio || 1;
    sizeRef.current = { w: rect.width, h: rect.height };
    canvas.width = Math.max(1, Math.round(rect.width * dprRef.current));
    canvas.height = Math.max(1, Math.round(rect.height * dprRef.current));
  }, []);

  /** 回调 ref：传给 <canvas ref={attachCanvas}>，卸载时以 null 调用 */
  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    canvasRef.current = canvas;
    if (!canvas) {
      sizeRef.current = { w: 0, h: 0 };
      return;
    }
    measure(canvas);
    const ro = new ResizeObserver(() => measure(canvas));
    ro.observe(canvas);
    roRef.current = ro;
  }, [measure]);

  useEffect(() => () => roRef.current?.disconnect(), []);

  return { canvasRef, attachCanvas, sizeRef, dprRef };
}
