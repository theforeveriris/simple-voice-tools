/**
 * 实时练习子页的公共外壳（实验性 · 实时功能）
 * 全屏覆盖层 + 页头 + 空闲/监听两态与麦克风监听生命周期：
 *   - 录音进行中挂载：直接复用录音引擎的数据流（只读，不影响录音）；
 *   - 空闲挂载：点击开始进入监听模式（不录音、不生成任何记录），关闭即释放麦克风。
 * 子组件只负责 live 阶段的画布与读数（尺寸自适应见 hooks/useLiveCanvas）。
 */

import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Mic, X } from 'lucide-react';
import { toast } from 'sonner';
import { recorder } from '@/lib/audio/recorder';
import { useStore } from '@/store/useStore';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';

/**
 * 实时画布的尺寸自适应（DPR 感知）。
 * 画布只在 live 阶段挂载，因此返回回调 ref（attachCanvas）：挂载瞬间同步测量
 * 尺寸并启用 ResizeObserver，后续窗口 / 布局变化继续跟随。rAF 循环经 canvasRef
 * 读取画布、sizeRef 读取 CSS 尺寸；若用 effect 初始化会在挂载时拿不到画布而失效。
 */
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
      data-noswipe className="fixed inset-0 z-[60] overflow-y-auto bg-surface"
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
