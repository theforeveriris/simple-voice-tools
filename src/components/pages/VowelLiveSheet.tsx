/**
 * 实时元音落点（实验性，全屏子页面）
 * 复用 vowelSpace 画笔的 live 模式：说话时实时观察自己的 F1/F2
 * 落点在元音空间里的移动轨迹（渐隐残影 + 质心 × + 当前落点光点）。
 * 语言训练 / 发音矫正的即时反馈视图：
 *   - 录音进行中：直接复用录音引擎的实时缓冲；
 *   - 空闲时：进入监听模式（不录音、不生成任何记录），关闭即释放麦克风。
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Mic, X } from 'lucide-react';
import { toast } from 'sonner';
import { recorder } from '@/lib/audio/recorder';
import { paintVowelSpaceLive } from '@/components/charts/chartPainters';
import { useStore } from '@/store/useStore';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';

/** 落点轨迹窗口（秒）：保留最近的移动残影 */
const TRAIL_SEC = 10;
/** 读数刷新间隔（ms）：约 8Hz，避免 setState 过频 */
const READOUT_INTERVAL_MS = 120;

export function VowelLiveSheet({ onClose }: { onClose: () => void }) {
  useI18n();
  // 挂载时若正在录音则直接复用录音数据流，否则处于待开始状态
  const [phase, setPhase] = useState<'idle' | 'live'>(recorder.isRecording() ? 'live' : 'idle');
  const [readout, setReadout] = useState<{ f0: number; f1: number; f2: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);

  // 尺寸自适应：依赖 phase —— idle 阶段画布未渲染，进入 live 后画布才挂载
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      dprRef.current = window.devicePixelRatio || 1;
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = Math.max(1, Math.round(rect.width * dprRef.current));
      canvas.height = Math.max(1, Math.round(rect.height * dprRef.current));
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [phase]);

  // 绘制 + 读数循环（仅 live 阶段）
  useEffect(() => {
    if (phase !== 'live') return;
    let raf = 0;
    let lastReadout = 0;
    const loop = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const { w, h } = sizeRef.current;
        if (w >= 8 && h >= 8) {
          const dpr = dprRef.current;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          const snap = recorder.getLive();
          const t1 = snap.elapsedSec;
          const t0 = Math.max(0, t1 - TRAIL_SEC);
          paintVowelSpaceLive(
            ctx, w, h,
            {
              t: snap.t,
              f0: snap.f0.map((v) => (isFinite(v) ? v : null)),
              rmsDb: snap.rmsDb,
              f1: snap.f1.map((v) => (isFinite(v) ? v : null)),
              f2: snap.f2.map((v) => (isFinite(v) ? v : null)),
            },
            t0, t1, true,
          );
          if (now - lastReadout > READOUT_INTERVAL_MS) {
            lastReadout = now;
            let f0: number | null = null;
            let f1: number | null = null;
            let f2: number | null = null;
            for (let i = snap.t.length - 1; i >= 0; i--) {
              if (f1 == null && isFinite(snap.f1[i])) f1 = snap.f1[i];
              if (f2 == null && isFinite(snap.f2[i])) f2 = snap.f2[i];
              if (isFinite(snap.f0[i]) && snap.f0[i] > 0) {
                f0 = snap.f0[i];
                break;
              }
            }
            setReadout(f0 != null || f1 != null ? { f0: f0 ?? 0, f1: f1 ?? 0, f2: f2 ?? 0 } : null);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // 卸载时结束自己开启的监听模式（录音中的话录音不受影响）
  useEffect(() => {
    return () => {
      if (recorder.isMonitoring()) recorder.stopMonitor();
    };
  }, []);

  const start = async () => {
    try {
      await recorder.startMonitor();
      setPhase('live');
    } catch {
      toast.error(t('toast.micError'));
    }
  };

  const close = () => {
    if (recorder.isMonitoring()) recorder.stopMonitor();
    onClose();
  };

  const isRecording = useStore((s) => s.isRecording);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] overflow-y-auto bg-surface"
    >
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        {/* 页头 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={close}
              aria-label={t('common.back')}
              className="grid size-10 place-items-center rounded-full bg-card text-ink shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-transform active:scale-90"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-base font-semibold tracking-tight text-ink">{t('vowelLive.title')}</h1>
            {isRecording && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-on-accent-soft">
                {t('vowelLive.recordingBadge')}
              </span>
            )}
          </div>
          <button
            onClick={close}
            className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-ink"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        {phase === 'idle' ? (
          <div className="grid min-h-[60vh] place-items-center">
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="max-w-xs text-sm leading-relaxed text-ink-2">{t('vowelLive.hintIdle')}</p>
              <button
                onClick={() => void start()}
                className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-on-accent shadow-lg transition-transform active:scale-95"
              >
                <Mic size={16} />
                {t('vowelLive.start')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 元音空间画布 */}
            <div className="mt-4 rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
              <canvas ref={canvasRef} className="block h-[46vh] min-h-[280px] w-full" aria-label={t('vowelLive.title')} />
              <p className="mt-2 text-center text-[10px] leading-relaxed text-ink-2">{t('vowelLive.hint')}</p>
            </div>

            {/* 实时读数：F0 / F1 / F2 */}
            <div className="mt-3.5 flex items-center justify-center gap-x-8 rounded-[18px] bg-card px-4 py-3 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
              {(
                [
                  ['F0', readout && readout.f0 > 0 ? readout.f0.toFixed(1) : null],
                  ['F1', readout && readout.f1 > 0 ? String(Math.round(readout.f1)) : null],
                  ['F2', readout && readout.f2 > 0 ? String(Math.round(readout.f2)) : null],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="text-center">
                  <p className="text-[10px] font-medium tracking-wide text-ink-2">{label}</p>
                  <p className="text-lg font-semibold tabular-nums text-ink">
                    {value ?? '—'}
                    <span className="ml-0.5 text-[10px] font-normal text-ink-2">Hz</span>
                  </p>
                </div>
              ))}
            </div>
            {readout == null && (
              <p className="mt-2 text-center text-xs text-ink-2">{t('vowelLive.noSignal')}</p>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
