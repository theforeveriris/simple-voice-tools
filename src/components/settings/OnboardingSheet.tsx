/**
 * 首次打开引导（Onboarding）
 * 全屏覆盖层（z 高于底部导航与原生启动页），只在「未完成引导」时显示一次。
 * 步骤：训练方向 → 年龄段 → 界面语言 → 主题外观。
 *
 * 设计要点：
 * - 复用 useStore.updateSettings：用户每改一项就立即落库，让主题 / 语言切换
 *   在引导过程中即时生效（所见即所得）。
 * - 训练方向同时会按 GOAL_TARGET_DEFAULTS 重新铺底训练靶标与共振峰中心
 *   （参见 ProfileSection.applyGoalDefaults），首次设置更有意义。
 * - 关闭：点「开始 / 跳过」设置 `svt:onboarded` 标记后卸载，标记位于
 *   localStorage 中而非 settings（避免导入旧 settings 时被重置）。
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronLeft, Languages, Palette, Sparkles, UserCircle2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import {
  AGE_GROUPS, GOAL_TARGET_DEFAULTS, USER_GOALS,
} from '@/constants';
import type { AgeGroup, AppSettings, UserGoal } from '@/types';
import { LOCALES } from '@/i18n';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { ThemePickerBody } from './ThemePicker';

/** 完成标记键（与 svt:update-seen 等已有的 lv 顶键同风格，区别于 zustand persist 命名空间） */
const ONBOARDED_KEY = 'svt:onboarded';

/** 步骤枚举（顺序与显示一一对应） */
const STEPS = ['goal', 'age', 'language', 'appearance'] as const;
type Step = typeof STEPS[number];

/** 顶部步骤指示器：圆点 + 文案 */
function StepHeader({ step, total, stepKey }: { step: number; total: number; stepKey: Step }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i <= step ? 'bg-accent' : 'bg-surface-hi',
            )}
          />
        ))}
      </div>
      <p className="text-[11px] font-medium tabular-nums text-ink-2">
        {t('onboard.stepOf', { n: step + 1, total })} · {t(`onboard.step.${stepKey}`)}
      </p>
    </div>
  );
}

/** 大型选项卡（两/三/四列网格，active 态 ring） */
function ChoiceCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-col gap-1.5 rounded-2xl bg-card p-4 text-left shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-transform active:scale-[0.98]',
        active && 'ring-2 ring-accent',
      )}
    >
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className="text-[11px] leading-relaxed text-ink-2">{desc}</span>
    </button>
  );
}

export function OnboardingSheet() {
  useI18n();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [step, setStep] = useState(0);
  // 首帧同步读取 localStorage：未标记 → 直接显示，避免 effect 同步 setState 触发级联渲染
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(ONBOARDED_KEY) !== '1';
  });

  /** 关闭并标记完成（点击开始 / 跳过） */
  const close = () => {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      /* 配额满：仅本会话内不再显示，重启会再次出现——可接受 */
    }
    setShow(false);
  };

  if (!show) return null;

  const total = STEPS.length;
  const isFirst = step === 0;
  const isLast = step === total - 1;
  const stepKey = STEPS[step];

  /** 选择训练方向：铺底目标区间与共振峰中心 */
  const pickGoal = (g: UserGoal) => {
    const d = GOAL_TARGET_DEFAULTS[g];
    updateSettings({
      userGoal: g,
      targetF0Min: d.targetF0Min,
      targetF0Max: d.targetF0Max,
      formantTargetF1: d.formantTargetF1,
      formantTargetF2: d.formantTargetF2,
    });
  };
  const pickAge = (a: AgeGroup) => updateSettings({ ageGroup: a });
  const pickLanguage = (lang: string) => updateSettings({ language: lang as AppSettings['language'] });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-noswipe
      className="fixed inset-0 z-[300] overflow-y-auto bg-surface"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-5 py-8">
        {/* 顶栏：标题（右上角的「跳过」按要求去除；底部「上一步 / 下一步 / 开始」足以控制流程） */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent" />
            <h1 className="text-lg font-semibold tracking-tight text-ink">
              {t('onboard.welcome')}
            </h1>
          </div>
        </div>

        {/* 步骤指示器 */}
        <StepHeader step={step} total={total} stepKey={stepKey} />

        {/* 主卡片：每步内容独立 key 以触发入场动画 */}
        <motion.div
          key={stepKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="flex flex-1 flex-col gap-4 card-surface p-5"
        >
          {stepKey === 'goal' && (
            <>
              <div className="flex items-center gap-2">
                <UserCircle2 size={16} className="text-accent" />
                <p className="text-sm font-semibold text-ink">{t('onboard.goalTitle')}</p>
              </div>
              <p className="text-[12px] leading-relaxed text-ink-2">
                {t('onboard.goalDesc')}
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {USER_GOALS.map((g) => (
                  <ChoiceCard
                    key={g.id}
                    active={settings.userGoal === g.id}
                    onClick={() => pickGoal(g.id)}
                    title={t(g.labelKey)}
                    desc={t(g.descKey)}
                  />
                ))}
              </div>
            </>
          )}

          {stepKey === 'age' && (
            <>
              <div className="flex items-center gap-2">
                <UserCircle2 size={16} className="text-accent" />
                <p className="text-sm font-semibold text-ink">{t('onboard.ageTitle')}</p>
              </div>
              <p className="text-[12px] leading-relaxed text-ink-2">
                {t('onboard.ageDesc')}
              </p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {AGE_GROUPS.map((a) => (
                  <ChoiceCard
                    key={a.id}
                    active={settings.ageGroup === a.id}
                    onClick={() => pickAge(a.id)}
                    title={t(a.labelKey)}
                    desc={t(a.descKey)}
                  />
                ))}
              </div>
            </>
          )}

          {stepKey === 'language' && (
            <>
              <div className="flex items-center gap-2">
                <Languages size={16} className="text-accent" />
                <p className="text-sm font-semibold text-ink">{t('onboard.languageTitle')}</p>
              </div>
              <p className="text-[12px] leading-relaxed text-ink-2">
                {t('onboard.languageDesc')}
              </p>
              <Select value={settings.language} onValueChange={pickLanguage}>
                <SelectTrigger className="w-full border border-black/10 bg-surface-hi px-3 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                  {LOCALES.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                      {l.machine ? ` · ${t('onboard.machine')}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {stepKey === 'appearance' && (
            <>
              <div className="flex items-center gap-2">
                <Palette size={16} className="text-accent" />
                <p className="text-sm font-semibold text-ink">{t('onboard.appearanceTitle')}</p>
              </div>
              <p className="text-[12px] leading-relaxed text-ink-2">
                {t('onboard.appearanceDesc')}
              </p>
              {/* 与 设置 → 外观 的主要主题控件一致：深浅 / 预设卡片 /
                  莫奈三色相 / 骄傲旗与渐变参数 / 自定义图片选图。
                  不含九宫焦点、模糊、压暗、声音染色等微调小项（留在设置里）。 */}
              <ThemePickerBody settings={settings} update={updateSettings} />
            </>
          )}
        </motion.div>

        {/* 底栏：上一步 / 下一步 */}
        <div className="mt-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={isFirst}
            className="flex items-center gap-1 rounded-full bg-card px-4 py-2.5 text-xs font-medium text-ink shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-opacity disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            {t('onboard.prev')}
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={close}
              className="ml-auto flex items-center gap-1 rounded-full bg-accent px-5 py-2.5 text-xs font-semibold text-on-accent shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-opacity hover:opacity-90"
            >
              {t('onboard.finish')}
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
              className="ml-auto flex items-center gap-1 rounded-full bg-accent px-5 py-2.5 text-xs font-semibold text-on-accent shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-opacity hover:opacity-90"
            >
              {t('onboard.next')}
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
