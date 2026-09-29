/**
 * 底部悬浮导航栏 + 录音圆球
 *
 * - 苹果式悬浮 Dock：微圆角、无边框、微阴影，四个页签（测试/分析/历史/设置），
 *   选中项有 layoutId 胶囊滑移动效与图标弹性微动效。
 * - 在测试页时：右侧浮出与底栏等高的录音圆球，二者作为整体保持居中
 *   （底栏仅微微左移让出圆球位置）；录音中圆球带呼吸光晕，点击停止。
 */

import { useEffect, useState } from 'react';
import type { ElementType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  SquareTerminal,
  ChartNoAxesColumn,
  History,
  Settings2,
  Play,
  Square,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { ViewType } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SPRING = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.9 };

const TABS: { id: ViewType; label: string; icon: ElementType }[] = [
  { id: 'test', label: '测试', icon: SquareTerminal },
  { id: 'analysis', label: '分析', icon: ChartNoAxesColumn },
  { id: 'history', label: '历史', icon: History },
  { id: 'settings', label: '设置', icon: Settings2 },
];

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

/** 录音圆球：点击开始 / 停止录音 */
function RecordBall() {
  const isRecording = useStore((s) => s.isRecording);
  const startRecording = useStore((s) => s.startRecording);
  const stopRecording = useStore((s) => s.stopRecording);

  const toggle = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      try {
        await startRecording();
      } catch {
        toast.error('无法访问麦克风，请检查浏览器权限设置');
      }
    }
  };

  return (
    <motion.div
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
        onClick={toggle}
        whileHover={{ scale: 1.07 }}
        whileTap={{ scale: 0.9 }}
        animate={isRecording ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={isRecording ? { duration: 1.7, ease: 'easeInOut', repeat: Infinity } : SPRING}
        className="relative grid size-full place-items-center rounded-full bg-accent text-on-accent shadow-[0_8px_22px_-6px_rgb(var(--c-accent-rgb)/0.55),0_3px_10px_rgb(var(--c-accent-rgb)/0.25)]"
        aria-label={isRecording ? '停止录音' : '开始录音'}
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
