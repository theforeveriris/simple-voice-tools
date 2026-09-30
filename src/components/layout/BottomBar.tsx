/**
 * 底部悬浮导航栏 + 录音圆球
 *
 * - 苹果式悬浮 Dock：微圆角、无边框、微阴影，四个页签（测试/分析/历史/设置），
 *   选中项有 layoutId 胶囊滑移动效与图标弹性微动效。
 * - 在测试页时：右侧浮出与底栏等高的录音圆球，二者作为整体保持居中
 *   （底栏仅微微左移让出圆球位置）；录音中圆球带呼吸光晕，点击停止。
 * - 短按圆球以当前模式开始录音（记住上次选择，默认朗读引导）；
 *   长按约 0.5s 在圆球上方扇形展开三个模式选项，背景模糊暗化，
 *   点选任意模式立即以该模式开始录音。
 */

import { useEffect, useRef, useState } from 'react';
import type { ElementType, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  SquareTerminal,
  ChartNoAxesColumn,
  History,
  Settings2,
  Play,
  Square,
  BookOpenText,
  AudioLines,
  TrendingUp,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { ViewType, TestMode } from '@/types';
import { MODE_META } from '@/constants';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SPRING = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.9 };

const TABS: { id: ViewType; label: string; icon: ElementType }[] = [
  { id: 'test', label: '测试', icon: SquareTerminal },
  { id: 'analysis', label: '分析', icon: ChartNoAxesColumn },
  { id: 'history', label: '历史', icon: History },
  { id: 'settings', label: '设置', icon: Settings2 },
];

/** 模式选项（扇形排列，自左向右，角度由索引与张角推得） */
const MODE_OPTIONS: { id: TestMode; label: string; icon: ElementType }[] = [
  { id: 'reading', label: '朗读引导', icon: BookOpenText },
  { id: 'sustained', label: '长音测试', icon: AudioLines },
  { id: 'glide', label: '音域滑音', icon: TrendingUp },
];

/** 长按触发时长（ms） */
const LONG_PRESS_MS = 480;
/** 扇形半径（px，自圆球圆心起算） */
const FAN_RADIUS = 118;
/** 常规扇形半张角（度）：三选项关于竖直对称，相邻间隔 = 该值 */
const FAN_SPREAD_DEG = 52;
/** 窄屏收窄后的半张角（间隔稍小，可减小所需旋转量） */
const FAN_SPREAD_COMPACT_DEG = 38;
/** 逆时针旋转上限（度），防止左侧选项低到与圆球同排 */
const FAN_MAX_ROTATE_DEG = 55;

/** 录音计时（圆球上方的悬浮时间提示） */
function RecordTimer() {
  const startedAtRef = useState(() => Date.now())[0];
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef) / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [startedAtRef]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.9 }}
      className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-md bg-ink px-2.5 py-1 text-[11px] font-medium tabular-nums text-card shadow-lg"
    >
      <span className="mr-1.5 inline-block size-1.5 animate-pulse-soft rounded-full bg-red-400 align-middle" />
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </motion.div>
  );
}

/**
 * 模式选择覆盖层
 * 渲染到 body（祖先链上的 transform 动画会使 fixed 相对定位失效），
 * 以圆球圆心为原点、扇形半径排布三个选项。
 */
function ModeFanSelector({
  center,
  onClose,
  onChoose,
}: {
  center: { x: number; y: number };
  onClose: () => void;
  onChoose: (mode: TestMode) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      {/* 背景模糊暗化，点击取消 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="absolute inset-0 bg-ink/25 backdrop-blur-md"
      />
      {MODE_OPTIONS.map((opt, i) => {
        // 窄屏（手机竖屏）时圆球贴近右缘：间隔稍收窄 + 整体逆时针旋转，
        // 旋转量按圆球右侧剩余空间求解，选项始终保持等距，
        // 且都分布在以圆球为圆心的同一弧上（旋转不脱离圆球，平移/逐个钳制会变形）
        const vw = window.innerWidth;
        const fanMargin = 56; // 圆钮半径 + 标签半宽
        const roomRight = vw - fanMargin - center.x;
        let spread = FAN_SPREAD_DEG;
        let rotateDeg = 0;
        if (roomRight < Math.sin((FAN_SPREAD_DEG * Math.PI) / 180) * FAN_RADIUS) {
          spread = FAN_SPREAD_COMPACT_DEG;
          const ratio = Math.max(-1, Math.min(1, roomRight / FAN_RADIUS));
          rotateDeg = Math.min(
            FAN_MAX_ROTATE_DEG,
            Math.max(0, spread - (Math.asin(ratio) * 180) / Math.PI),
          );
        }
        const rad = (((i - 1) * spread - rotateDeg) * Math.PI) / 180;
        const dx = Math.sin(rad) * FAN_RADIUS;
        const dy = -Math.cos(rad) * FAN_RADIUS;
        const Icon = opt.icon;
        return (
          <motion.div
            key={opt.id}
            className="absolute"
            style={{ left: center.x, top: center.y }}
            initial={{ x: 0, y: 0, scale: 0.2, opacity: 0 }}
            animate={{ x: dx, y: dy, scale: 1, opacity: 1 }}
            exit={{ x: 0, y: 0, scale: 0.2, opacity: 0, transition: { duration: 0.14 } }}
            transition={{ type: 'spring', stiffness: 430, damping: 24, delay: i * 0.05 }}
          >
            <button
              onClick={() => onChoose(opt.id)}
              className="flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
              aria-label={`${opt.label}：${MODE_META[opt.id].desc}`}
            >
              <motion.span
                whileTap={{ scale: 0.88 }}
                className="grid size-14 place-items-center rounded-full bg-card shadow-[0_10px_30px_-6px_rgba(28,25,45,0.3),0_3px_10px_rgba(28,25,45,0.12)]"
              >
                <Icon size={22} strokeWidth={2} className="text-accent" />
              </motion.span>
              <span className="whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[10px] font-medium text-card shadow">
                {opt.label}
              </span>
            </button>
          </motion.div>
        );
      })}
      {/* 取消提示 */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ delay: 0.25 }}
        className="absolute inset-x-0 top-7 text-center text-xs text-white/90"
      >
        点击空白处取消
      </motion.p>
    </div>,
    document.body,
  );
}

/** 录音圆球：短按开始（当前模式）/ 停止录音，长按展开模式选择 */
function RecordBall() {
  const isRecording = useStore((s) => s.isRecording);
  const startRecording = useStore((s) => s.startRecording);
  const stopRecording = useStore((s) => s.stopRecording);
  const updateSettings = useStore((s) => s.updateSettings);

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const ballRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const pressOrigin = useRef({ x: 0, y: 0 });

  const openSelector = () => {
    const rect = ballRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCenter({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    setSelectorOpen(true);
    navigator.vibrate?.(12);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (isRecording) return;
    longPressFired.current = false;
    pressOrigin.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = window.setTimeout(openSelector, LONG_PRESS_MS);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (pressTimer.current === null) return;
    const moved = Math.hypot(e.clientX - pressOrigin.current.x, e.clientY - pressOrigin.current.y);
    if (moved > 12) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const onClick = async () => {
    // 长按展开选择器后，抬手的 click 不应触发短按开始
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (isRecording) {
      void stopRecording();
    } else {
      try {
        await startRecording();
      } catch {
        toast.error('无法访问麦克风，请检查浏览器权限设置');
      }
    }
  };

  const chooseMode = async (mode: TestMode) => {
    setSelectorOpen(false);
    updateSettings({ testMode: mode });
    try {
      await startRecording();
    } catch {
      toast.error('无法访问麦克风，请检查浏览器权限设置');
    }
  };

  useEffect(() => clearPress, []);

  return (
    <motion.div
      ref={ballRef}
      initial={{ scale: 0, opacity: 0, y: '-50%' }}
      animate={{ scale: 1, opacity: 1, y: '-50%' }}
      exit={{ scale: 0, opacity: 0, y: '-50%' }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className="pointer-events-auto absolute left-full top-1/2 ml-3 size-14"
    >
      <AnimatePresence>{isRecording && <RecordTimer />}</AnimatePresence>

      {/* 呼吸光晕（录音中） */}
      <AnimatePresence>
        {isRecording && (
          <motion.span
            key="halo"
            initial={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            className="absolute -inset-1.5 rounded-full"
          >
            <motion.span
              className="absolute inset-0 rounded-full bg-accent/35"
              animate={{ scale: [1, 1.55], opacity: [0.55, 0] }}
              transition={{ duration: 1.7, ease: 'easeOut', repeat: Infinity }}
            />
            <motion.span
              className="absolute inset-0 rounded-full bg-accent/25"
              animate={{ scale: [1, 1.9], opacity: [0.4, 0] }}
              transition={{ duration: 1.7, ease: 'easeOut', repeat: Infinity, delay: 0.55 }}
            />
            <motion.span
              className="absolute inset-0 rounded-full ring-2 ring-accent/50"
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 1.7, ease: 'easeInOut', repeat: Infinity }}
            />
          </motion.span>
        )}
      </AnimatePresence>

      <motion.button
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={clearPress}
        onPointerCancel={clearPress}
        onPointerLeave={clearPress}
        onContextMenu={(e) => e.preventDefault()}
        whileHover={{ scale: 1.07 }}
        whileTap={{ scale: 0.9 }}
        animate={isRecording ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={isRecording ? { duration: 1.7, ease: 'easeInOut', repeat: Infinity } : SPRING}
        className="relative grid size-full select-none place-items-center rounded-full bg-accent text-on-accent shadow-[0_8px_22px_-6px_rgb(var(--c-accent-rgb)/0.55),0_3px_10px_rgb(var(--c-accent-rgb)/0.25)]"
        aria-label={isRecording ? '停止录音' : '开始录音（长按选择模式）'}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isRecording ? 'stop' : 'play'}
            initial={{ scale: 0.3, opacity: 0, rotate: -70 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.3, opacity: 0, rotate: 70 }}
            transition={{ duration: 0.16 }}
            className="grid place-items-center"
          >
            {isRecording ? (
              <Square size={17} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={19} fill="currentColor" strokeWidth={0} className="translate-x-[2px]" />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* 模式扇形选择器 */}
      <AnimatePresence>
        {selectorOpen && (
          <ModeFanSelector center={center} onClose={() => setSelectorOpen(false)} onChoose={chooseMode} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * 底部悬浮导航栏
 * 导航栏与录音圆球组成一个居中的整体；离开测试页时圆球收起，
 * 导航栏通过 layout 动画平滑回到正中。
 */
export function BottomBar() {
  const currentTab = useStore((s) => s.currentTab);
  const setTab = useStore((s) => s.setTab);
  const isTest = currentTab === 'test';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-5">
      {/*
        运动模型（全部为 transform，零重排，杜绝"二次移动"）：
        - 小球绝对定位（left-full），永不占文档流，缩放进出不影响布局；
        - 底栏布局宽度只由页签决定，justify-center 使其永远精确居中；
        - 测试页时整个容器用纯 transform 左移 34px（= 小球56px+间距12px 的一半），
          使"底栏 + 小球"组合视觉居中，底栏仅微微左移。
      */}
      <motion.div
        animate={{ x: isTest ? -34 : 0 }}
        transition={SPRING}
        className="pointer-events-auto relative flex items-center"
      >
        <motion.nav
          layout
          transition={SPRING}
          className="flex items-center gap-0.5 rounded-[24px] bg-card/85 p-1.5 shadow-[0_12px_40px_-8px_rgba(28,25,45,0.18),0_3px_12px_rgba(28,25,45,0.06)] backdrop-blur-xl"
        >
          {TABS.map((tab) => {
            const active = currentTab === tab.id;
            const Icon = tab.icon;
            return (
              <motion.button
                key={tab.id}
                layout
                onClick={() => setTab(tab.id)}
                whileTap={{ scale: 0.9 }}
                className="relative flex items-center rounded-2xl px-3.5 py-2.5"
                aria-label={tab.label}
              >
                {/* 选中胶囊（跨页签平滑滑动） */}
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={SPRING}
                    className="absolute inset-0 rounded-2xl bg-accent-soft"
                  />
                )}
                <motion.span
                  className="relative z-10 grid place-items-center"
                  animate={active ? { scale: [1, 1.28, 1] } : { scale: 1 }}
                  transition={{ duration: 0.38, ease: 'easeOut' }}
                >
                  <Icon
                    size={21}
                    strokeWidth={active ? 2.4 : 2}
                    className={cn('transition-colors duration-200', active ? 'text-accent' : 'text-ink-2')}
                  />
                </motion.span>
                {/*
                  标签宽度必须瞬间到位、不做 width 动画：
                  若宽度逐帧展开，底栏的真实布局会每帧重新居中，
                  与 layout FLIP 动画叠加产生"二次移动"。
                  宽度瞬变让小球退场 + 标签挂载合并为一次重排，
                  底栏只做一次纯净的滑动；文字用快速淡入消除突现感。
                */}
                {active && !isTest && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.14 }}
                    className="relative z-10 whitespace-nowrap pl-[7px] text-sm font-medium text-on-accent-soft"
                  >
                    {tab.label}
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </motion.nav>

        {/* 录音圆球：绝对定位在底栏右侧，仅测试页出现，缩放进出零布局影响 */}
        <AnimatePresence>
          {isTest && <RecordBall />}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
