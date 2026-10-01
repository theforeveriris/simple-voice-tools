/**
 * 实时频谱图（实验性）
 * 从录音引擎的 AnalyserNode 读取频域幅度（getByteFrequencyData），
 * 绘制 0–4kHz 窄带幅度谱，直接可见谐波列与共振峰峰包。
 * 逐帧指数平滑抑制帧间抖动；非录音态画一条基线。
 * 额外 Canvas 的 rAF 有耗电/掉帧成本，因此放在实验性开关之后。
 */

import { useEffect, useRef } from 'react';
import { recorder } from '@/lib/audio/recorder';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

/** 显示的频率上限（Hz）：人声谐波与 F1/F2 集中在此以下 */
const MAX_HZ = 4000;
/** AnalyserNode fftSize（与 recorder.ts 中 timeBuf 长度一致） */
const FFT_SIZE = 4096;
/** 频谱平滑系数：新帧权重（越大越跟手，越小越稳） */
const SMOOTH = 0.35;

interface Palette {
  accent: string;
  accent2: string;
  grid: string;
}

/** 主题色板缓存（app:themechange 时失效，与 chartPainters 同一机制） */
let palette: Palette | null = null;
function getPalette(): Palette {
  if (palette) return palette;
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  palette = {
    accent: v('--c-accent', '#5B5BD6'),
    accent2: v('--c-accent2', '#8B5BD6'),
    grid: v('--c-line', '#E5E3EC'),
  };
  return palette;
}
window.addEventListener('app:themechange', () => {
  palette = null;
});

export function LiveSpectrum({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);
  // 常驻原始缓冲（fftSize/2 上限，按采样率换算实际使用的前 n 个频带）与平滑缓存
  const rawRef = useRef(new Uint8Array(FFT_SIZE / 2));
  const smoothRef = useRef<{ data: Float32Array; n: number } | null>(null);

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
    });
    ro.observe(canvas);

    const draw = () => {
      const ctx = canvas.getContext('2d');
      const { w, h } = sizeRef.current;
      if (!ctx || w < 8 || h < 8) return;
      const dpr = dprRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // 频带数随采样率换算（fftSize 固定 4096，binHz = sampleHz / fftSize）；
      // 非录音态 sampleHz = 0，画基线
      const sampleHz = recorder.getSpectrum(rawRef.current);
      const n = sampleHz > 0
        ? Math.min(rawRef.current.length, Math.ceil(MAX_HZ / (sampleHz / FFT_SIZE)))
        : 0;
      let smooth = smoothRef.current;
      if (!smooth || smooth.n !== n) {
        smooth = { data: new Float32Array(n), n };
        smoothRef.current = smooth;
      }
      const showGrid = useStore.getState().settings.showGrid;
      const colors = getPalette();

      // 网格（横向三等分淡线）
      if (showGrid) {
        ctx.strokeStyle = colors.grid;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
          const y = Math.round((h * i) / 4) + 0.5;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (n > 0) {
        // 指数平滑后画填充谱
        const raw = rawRef.current;
        const data = smooth.data;
        for (let i = 0; i < n; i++) {
          data[i] = data[i] * (1 - SMOOTH) + raw[i] * SMOOTH;
        }
        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, `${colors.accent}55`);
        grad.addColorStop(1, colors.accent);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const y = h - (data[i] / 255) * (h - 2);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        // 峰包描线
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const y = h - (data[i] / 255) * (h - 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = colors.accent2;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        // 非录音态：画一条基线
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h - 0.5);
        ctx.lineTo(w, h - 0.5);
        ctx.stroke();
      }
    };

    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className={cn('block h-full w-full', className)} />;
}
