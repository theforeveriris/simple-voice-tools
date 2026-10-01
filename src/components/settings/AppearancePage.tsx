/**
 * 外观（设置的子页面，入口为主视图单行卡片）
 * - 主题：深浅模式、预设配色、主题色（滑条与标签同行；预设非莫奈时滑条停用）
 * - 语言：界面语言选择
 * - 图表辅助选项：网格辅助线、时间轴联动、移动端迷你基频（各带 Info 说明浮窗）
 */

import { motion } from 'framer-motion';
import { ArrowLeft, Palette, Languages, SlidersHorizontal } from 'lucide-react';
import { applyTheme, presetSpec } from '@/lib/theme/monet';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { LOCALES } from '@/i18n';
import type { AppSettings, HuePreset, Locale, ThemeMode } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { SettingsSection, SettingRow } from './rows';
import { InfoTip } from './InfoTip';

export function AppearancePage({
  settings,
  update,
  onBack,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  /** 返回设置主视图（appearanceOpen 由父组件持有，不持久化） */
  onBack: () => void;
}) {
  useI18n();

  const dark = settings.theme === 'dark'
    || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const preset = settings.huePreset ?? 'monet';

  /** 按当前设置立即重放色板（预设/色相变更共用） */
  const applyPreset = (next: Partial<AppSettings>) => {
    update(next);
    const merged = { ...settings, ...next };
    const p = presetSpec(merged.huePreset, merged.hue);
    applyTheme(p.hue, dark, p.accentHue, p.spec);
  };

  const setHue = (hue: number) => applyPreset({ hue });
  const setPreset = (p: HuePreset) => applyPreset({ huePreset: p });

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
        className="flex flex-col gap-3.5"
      >
        {/* 子页面头：返回 + 标题 */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label={t('common.back')}
            className="grid size-10 place-items-center rounded-full bg-card text-ink shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-transform active:scale-90"
          >
            <ArrowLeft size={18} />
          </button>
          <p className="text-base font-semibold text-ink">{t('settings.appearance')}</p>
        </div>

        {/* 主题（深浅模式 + 预设配色 + 主题色，原两区块合并） */}
        <SettingsSection icon={Palette} title={t('settings.theme')}>
          <SettingRow label={t('settings.theme')}>
            <Select
              value={settings.theme}
              onValueChange={(v) => update({ theme: v as ThemeMode })}
            >
              <SelectTrigger className="w-32 border-0 bg-transparent px-0 text-sm shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                <SelectItem value="system">{t('settings.themeSystem')}</SelectItem>
                <SelectItem value="light">{t('settings.themeLight')}</SelectItem>
                <SelectItem value="dark">{t('settings.themeDark')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label={t('settings.huePreset')}>
            <Select
              value={preset}
              onValueChange={(v) => setPreset(v as HuePreset)}
            >
              <SelectTrigger className="w-44 border-0 bg-transparent px-0 text-sm shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                <SelectItem value="monet">{t('settings.presetMonet')}</SelectItem>
                <SelectItem value="transPride">{t('settings.presetTrans')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow
            label={t('settings.hue')}
            /* 非莫奈预设时色板由预设决定，色相滑条停用 */
          >
            <div className={cn('flex items-center gap-2.5', preset !== 'monet' && 'opacity-40')}>
              <input
                type="range"
                min={0}
                max={360}
                value={settings.hue}
                onChange={(e) => setHue(Number(e.target.value))}
                disabled={preset !== 'monet'}
                className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-gradient-to-r from-red-400 via-emerald-400 to-violet-500 accent-accent disabled:cursor-default"
                aria-label={t('settings.hue')}
              />
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-2">{settings.hue}°</span>
            </div>
          </SettingRow>
        </SettingsSection>

        {/* 语言 */}
        <SettingsSection icon={Languages} title={t('settings.language')}>
          <SettingRow label={t('settings.language')}>
            <Select
              value={settings.language}
              onValueChange={(v) => update({ language: v as Locale })}
            >
              <SelectTrigger className="w-52 border-0 bg-transparent px-0 text-sm shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                {LOCALES.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.label}
                    {l.machine && <span className="ml-1.5 text-[10px] text-ink-2">{t('settings.languageMachine')}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        </SettingsSection>

        {/* 图表辅助选项 */}
        <SettingsSection icon={SlidersHorizontal} title={t('settings.chartAids')}>
          <SettingRow label={<InfoTip label={t('settings.showGrid')} text={t('settings.showGridDesc')} />}>
            <Switch
              checked={settings.showGrid}
              onCheckedChange={(v) => update({ showGrid: v })}
            />
          </SettingRow>
          <SettingRow label={<InfoTip label={t('settings.syncRange')} text={t('settings.syncRangeDesc')} />}>
            <Switch
              checked={settings.syncChartRange}
              onCheckedChange={(v) => update({ syncChartRange: v })}
            />
          </SettingRow>
          <SettingRow label={<InfoTip label={t('settings.mobileSpark')} text={t('settings.mobileSparkDesc')} />}>
            <Switch
              checked={settings.mobileSpark}
              onCheckedChange={(v) => update({ mobileSpark: v })}
            />
          </SettingRow>
        </SettingsSection>
      </motion.div>
    </div>
  );
}
