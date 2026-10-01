/**
 * 实时练习子页的公共外壳（实验性 · 实时功能）
 * 全屏覆盖层 + 页头 + 空闲/监听两态与麦克风监听生命周期：
 *   - 录音进行中挂载：直接复用录音引擎的数据流（只读，不影响录音）；
 *   - 空闲挂载：点击开始进入监听模式（不录音、不生成任何记录），关闭即释放麦克风。
 * 子组件只负责 live 阶段的画布与读数（useLiveCanvas 提供尺寸自适应）。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Mic, X } from 'lucide-react';
import { toast } from 'sonner';
import { recorder } from '@/lib/audio/recorder';
import { useStore } from '@/store/useStore';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';

/** 实时画布的尺寸自适应（DPR 感知）；enabled 对应画布实际挂载的阶段 */
export function useLiveCanvas(enabled: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      dprRef.current = window.devicePixelRatio || 1;
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = Math.max(1, Math.round(rect.width * dprRef.current));
      canvas.height = Math.max(1, Math.round(rect.height * dprRef.current));
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [enabled]);
  return { canvasRef, sizeRef, dprRef };
}

export function LiveSheetFrame({
  title,
  idleHint,
  startLabel,
  toolbar,
  onClose,
  children,
}: {
  title: string;
  idleHint: string;
  startLabel: string;
  /** live 阶段页头下方的工具行（可选，如音高轨迹开关） */
  toolbar?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useI18n();
  // 挂载时若正在录音则直接复用录音数据流，否则处于待开始状态
  const [phase, setPhase] = useState<'idle' | 'live'>(recorder.isRecording() ? 'live' : 'idle');
  const isRecording = useStore((s) => s.isRecording);

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
            <h1 className="text-base font-semibold tracking-tight text-ink">{title}</h1>
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
              <p className="max-w-xs text-sm leading-relaxed text-ink-2">{idleHint}</p>
              <button
                onClick={() => void start()}
                className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-on-accent shadow-lg transition-transform active:scale-95"
              >
                <Mic size={16} />
                {startLabel}
              </button>
            </div>
          </div>
        ) : (
          <>
            {toolbar}
            {children}
          </>
        )}
      </div>
    </motion.div>
  );
}
