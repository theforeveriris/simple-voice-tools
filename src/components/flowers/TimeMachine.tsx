/**
 * 时间机器（Progress Time-lapse）：两条记录的渐变动画
 * Canvas 逐帧绘制：按进度 p ∈ [0,1] 交叉溶解 A→B（曲线按相对时长对齐、
 * 散点云交叉溶解 + 质心箭头轨迹），右上角日期随进度滚动 + Δ 天数。
 * 控制：播放/暂停、进度条拖动、0.5×/1×/2× 速度；导出用 MediaRecorder
 * 把画布流录成 WebM（canvas.captureStream，纯前端零依赖）。
 * 纯函数帧计算见 drawTimeMachineFrame（可单测的插值与混合逻辑）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Video } from 'lucide-react';
import { toast } from 'sonner';
import { BAND_COLORS, getBandRanges } from '@/constants';
import { chartPalette, vowelXY } from '@/components/charts/chartPainters';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';
import { cn } from '@/lib/utils';

const F_MIN = 50;
const F_MAX = 520;

export type TimeMachineMode = 'pitch' | 'vowel';

/* ---------------- 帧计算（纯函数，可单测） ---------------- */

/** 日期插值：p ∈ [0,1] → 日期时间戳（含 Δ 天数） */
export function dateAtProgress(a: AnalysisRecord, b: AnalysisRecord, p: number): { at: number; deltaDays: number } {
  const at = Math.round(a.createdAt + (b.createdAt - a.createdAt) * p);
  return { at, deltaDays: Math.round((b.createdAt - a.createdAt) / 86_400_000) };
}

/** 序列在归一化时间 x ∈ [0,1] 的取值（线性采样，跨缺口取最近有效值） */
export function sampleSeries(
  s: { t: number[]; f0: (number | null)[] },
  dur: number,
  x: number,
): number | null {
  const target = x * Math.max(0.01, dur);
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < s.t.length; i++) {
    const d = Math.abs(s.t[i] - target);
    if (d < bestDist) {
      bestDist = d;
      best = s.f0[i];
    }
    if (s.t[i] > target && d > bestDist) break;
  }
  return best != null && isFinite(best) ? best : null;
}

/** 帧参数：进度、画布尺寸、模式（绘制所需的最小集合，纯函数入参） */
export interface FrameInput {
  p: number;
  w: number;
  h: number;
  mode: TimeMachineMode;
  seriesA: { t: number[]; f0: (number | null)[]; f1: (number | null)[]; f2: (number | null)[]; rmsDb: number[] };
  seriesB: { t: number[]; f0: (number | null)[]; f1: (number | null)[]; f2: (number | null)[]; rmsDb: number[] };
  durA: number;
  durB: number;
}

/**
 * 绘制一帧：A/B 交叉溶解（A 淡出 = p，B 淡入 = p；中点两者各半）。
 * 曲线模式按各自时长归一化对齐；散点模式同一元音平面交叉溶解。
 */
export function drawTimeMachineFrame(ctx: CanvasRenderingContext2D, input: FrameInput): void {
  const { p, w, h, mode, seriesA, seriesB, durA, durB } = input;
  const pal = chartPalette();
  ctx.clearRect(0, 0, w, h);
  const padB = 20;
  const yPitch = (f: number) => h - padB - ((Math.max(F_MIN, Math.min(F_MAX, f)) - F_MIN) / (F_MAX - F_MIN)) * (h - padB);

  if (mode === 'pitch') {
    // 音区背景
    const ranges = getBandRanges();
    for (const band of ['low', 'male', 'transition', 'female', 'high'] as const) {
      const [f0, f1] = ranges[band];
      ctx.fillStyle = BAND_COLORS[band];
      ctx.globalAlpha = band === 'transition' ? 0.05 : 0.1;
      ctx.fillRect(0, yPitch(f1), w, yPitch(f0) - yPitch(f1));
    }
    ctx.globalAlpha = 1;

    // 溶解曲线：先画 A（淡出），再画 B（淡入）；中点处两线半透叠加
    const stroke = (s: typeof seriesA, dur: number, color: string, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let open = false;
      for (let i = 0; i < s.t.length; i++) {
        const f = s.f0[i];
        if (f == null || !isFinite(f)) { open = false; continue; }
        const x = (s.t[i] / Math.max(dur, 0.01)) * w;
        const y = yPitch(f);
        if (open) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        open = true;
      }
      ctx.stroke();
      ctx.restore();
    };
    stroke(seriesA, durA, pal.accent, 1 - p * 0.85);
    stroke(seriesB, durB, pal.accent2, 0.15 + p * 0.85);
  } else {
    // 散点云：元音平面交叉溶解 + 质心箭头轨迹
    const scatter = (s: typeof seriesA, color: string, alpha: number) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      for (let i = 0; i < s.t.length; i++) {
        if (s.f0[i] == null) continue;
        const f1 = s.f1[i];
        const f2 = s.f2[i];
        if (f1 == null || f2 == null) continue;
        const [x, y] = vowelXY(f1, f2, w, h);
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };
    scatter(seriesA, pal.accent, 1 - p * 0.9);
    scatter(seriesB, pal.accent2, 0.1 + p * 0.9);

    // 质心箭头：A 质心 → B 质心（虚线 + 箭头头）
    const centroid = (s: typeof seriesA): [number, number] | null => {
      let sf1 = 0; let sf2 = 0; let n = 0;
      for (let i = 0; i < s.t.length; i++) {
        if (s.f0[i] == null) continue;
        const f1 = s.f1[i];
        const f2 = s.f2[i];
        if (f1 == null || f2 == null) continue;
        sf1 += f1; sf2 += f2; n++;
      }
      if (n === 0) return null;
      return vowelXY(sf1 / n, sf2 / n, w, h);
    };
    const ca = centroid(seriesA);
    const cb = centroid(seriesB);
    if (ca && cb) {
      // 箭头端点随 p 推进（轨迹生长）
      const hx = ca[0] + (cb[0] - ca[0]) * p;
      const hy = ca[1] + (cb[1] - ca[1]) * p;
      ctx.save();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(ca[0], ca[1]);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.setLineDash([]);
      // 箭头头
      const ang = Math.atan2(cb[1] - ca[1], cb[0] - ca[0]);
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(ang) * 9, hy + Math.sin(ang) * 9);
      ctx.lineTo(hx + Math.cos(ang + 2.5) * 8, hy + Math.sin(ang + 2.5) * 8);
      ctx.lineTo(hx + Math.cos(ang - 2.5) * 8, hy + Math.sin(ang - 2.5) * 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // 右上角日期徽章由组件层 drawDateBadge 绘制（保持本函数纯序列依赖）
}

/** 右上角日期徽章：Δ 天 + 随进度滚动的插值日期 */
export function drawDateBadge(
  ctx: CanvasRenderingContext2D,
  aAt: number, bAt: number, p: number,
): void {
  const pal = chartPalette();
  const at = Math.round(aAt + (bAt - aAt) * p);
  const deltaDays = Math.round((bAt - aAt) / 86_400_000);
  const d = new Date(at);
  ctx.save();
  ctx.fillStyle = pal.textMuted;
  ctx.font = '600 13px "Inter Tight", system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`Δ ${deltaDays}d · ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`, 10, 10);
  ctx.restore();
}

/* ---------------- 组件 ---------------- */

const SPEEDS = [0.5, 1, 2] as const;
/** 基准节奏：1× 下一对记录 6 秒（进度 0→1） */
const BASE_DURATION_MS = 6000;

export function TimeMachine({ a, b }: { a: AnalysisRecord; b: AnalysisRecord }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [mode, setMode] = useState<TimeMachineMode>('pitch');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  // 进度 0..1；rAF 按 speed 推进
  const pRef = useRef(0);
  const [pDisplay, setPDisplay] = useState(0);
  const rafRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  /** 录制完成兜底轮询：只在自身回调里 clearInterval 会随卸载永久空转 */
  const recordPollRef = useRef<number | null>(null);

  const draw = useCallback((p: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    if (w < 40 || h < 40) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTimeMachineFrame(ctx, {
      p, w, h, mode,
      seriesA: a.series, seriesB: b.series,
      durA: Math.max(0.01, a.durationSec), durB: Math.max(0.01, b.durationSec),
    });
    drawDateBadge(ctx, a.createdAt, b.createdAt, p);
  }, [a, b, mode]);

  // 尺寸自适应 + 重绘
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      draw(pRef.current);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  // 数据 / 模式变化重绘当前帧
  useEffect(() => { draw(pRef.current); }, [draw]);

  // 卸载清理：停掉兜底轮询与进行中的录制（含画布流轨道）。
  // 否则录制途中离开页面会留下永久空转的 interval 与未停止的 MediaRecorder/流。
  useEffect(() => () => {
    if (recordPollRef.current !== null) {
      window.clearInterval(recordPollRef.current);
      recordPollRef.current = null;
    }
    const mr = recorderRef.current;
    if (mr) {
      mr.onstop = null; // 卸载时丢弃半成品录像，不触发下载
      if (mr.state !== 'inactive') mr.stop();
      mr.stream.getTracks().forEach((tr) => tr.stop());
      recorderRef.current = null;
    }
  }, []);

  // 动画循环
  useEffect(() => {
    if (!playing) {
      lastTsRef.current = null;
      return;
    }
    const loop = (ts: number) => {
      if (lastTsRef.current != null) {
        const dt = ts - lastTsRef.current;
        pRef.current += (dt / BASE_DURATION_MS) * speed;
        if (pRef.current >= 1) {
          pRef.current = 1;
          setPlaying(false);
        }
        setPDisplay(pRef.current);
        draw(pRef.current);
        if (pRef.current >= 1) return;
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(loop);
    };
    // 到尾部后再播放：从头开始
    if (pRef.current >= 1) pRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, draw]);

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value) / 1000;
    pRef.current = Math.max(0, Math.min(1, v));
    setPDisplay(pRef.current);
    setPlaying(false);
    draw(pRef.current);
  };

  const record = () => {
    const canvas = canvasRef.current;
    if (!canvas || recorderRef.current) return;
    try {
      const stream = canvas.captureStream(30);
      const mime = ['video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) {
        toast.error(t('timelapse.recordUnsupported'));
        return;
      }
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const el = document.createElement('a');
        el.href = url;
        el.download = `voice-timelapse-${new Date().toISOString().slice(0, 10)}.webm`;
        el.click();
        URL.revokeObjectURL(url);
      };
      recorderRef.current = mr;
      mr.start();
      pRef.current = 0;
      setPDisplay(0);
      setSpeed(1);
      setPlaying(true);
      toast.success(t('timelapse.recording'));
      // 播完自动停录制（监听 playing 状态变化之外的兜底：进度到 1 由动画循环置 false，
      // 这里用轮询简单兜底）
      const check = window.setInterval(() => {
        if (pRef.current >= 1 || !recorderRef.current) {
          window.clearInterval(check);
          recordPollRef.current = null;
          if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
          recorderRef.current = null;
        }
      }, 300);
      recordPollRef.current = check;
    } catch {
      toast.error(t('timelapse.recordUnsupported'));
      recorderRef.current = null;
    }
  };

  const deltaDays = Math.max(1, Math.round((b.createdAt - a.createdAt) / 86_400_000));
  const interp = dateAtProgress(a, b, pDisplay);
  const d = new Date(interp.at);

  const chip = (active: boolean) =>
    cn(
      'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
      active ? 'bg-card text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
    );

  return (
    <div className="card-surface p-4">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-xs font-medium tracking-wide text-ink-2">{t('timelapse.title')}</span>
        {/* 模式切换 */}
        <div className="flex items-center rounded-full bg-surface-hi p-0.5" role="group" aria-label={t('timelapse.modeLabel')}>
          <button onClick={() => setMode('pitch')} aria-pressed={mode === 'pitch'} className={chip(mode === 'pitch')}>
            {t('timelapse.modePitch')}
          </button>
          <button onClick={() => setMode('vowel')} aria-pressed={mode === 'vowel'} className={chip(mode === 'vowel')}>
            {t('timelapse.modeVowel')}
          </button>
        </div>
      </div>

      <canvas ref={canvasRef} className="block h-[240px] w-full sm:h-[300px]" aria-label={t('timelapse.title')} />

      {/* 播放器：播放/暂停 + 进度条 + 速度 + 录制 */}
      <div className="mt-3 flex items-center gap-2.5">
        <button
          onClick={() => setPlaying((v) => !v)}
          aria-label={playing ? t('common.cancel') : t('timelapse.play')}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-transform active:scale-90"
        >
          {playing ? <Pause size={14} /> : <Play size={14} className="translate-x-[1px]" />}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(pDisplay * 1000)}
          onChange={onScrub}
          aria-label={t('timelapse.scrubAria')}
          className="min-w-0 flex-1 accent-[var(--c-accent)]"
        />
        <div className="flex shrink-0 items-center rounded-full bg-surface-hi p-0.5" role="group" aria-label={t('timelapse.speedLabel')}>
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => setSpeed(s)} aria-pressed={speed === s} className={chip(speed === s)}>
              {s}×
            </button>
          ))}
        </div>
        <button
          onClick={record}
          aria-label={t('timelapse.recordAria')}
          title={t('timelapse.recordAria')}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-ink-2 shadow-[0_1px_4px_rgba(28,25,45,0.06)] transition-colors hover:text-accent"
        >
          <Video size={14} />
        </button>
      </div>
      <p className="mt-1 text-center text-[10px] tabular-nums text-ink-2">
        {t('timelapse.dateLine', {
          delta: deltaDays,
          date: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
        })}
        {' · '}
        A {fmtDate(a.createdAt)} → B {fmtDate(b.createdAt)}
      </p>
    </div>
  );
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
