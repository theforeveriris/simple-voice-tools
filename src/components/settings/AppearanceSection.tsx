/** 外观设置：主题（深浅）、语言、莫奈取色主题色（自定义色相）、网格辅助线、图表时间轴同步 */

import { Palette, Sparkles } from 'lucide-react';
import { applyTheme } from '@/lib/theme/monet';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { LOCALES } from '@/i18n';
import type { AppSettings, Locale, ThemeMode } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui';
import { SettingsSection, SettingRow } from './rows';

export function AppearanceSection({
  settings,
  update,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}) {
  useI18n();

  const setHue = (hue: number) => {
    update({ hue });
    const dark = settings.theme === 'dark'
      || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(hue, dark);
  };

  return (
    /* 外观 */
    <SettingsSection icon={Palette} title={t('settings.appearance')}>
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
      <SettingRow stacked label={t('settings.hue')}>
        <div className="flex items-center gap-3">
          <Sparkles size={14} className="shrink-0 text-ink-2" />
          <input
            type="range"
            min={0}
            max={360}
            value={settings.hue}
            onChange={(e) => setHue(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-red-400 via-emerald-400 to-violet-500 accent-accent"
            aria-label={t('settings.hue')}
          />
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-2">{settings.hue}°</span>
        </div>
      </SettingRow>
      <SettingRow label={t('settings.showGrid')}>
        <Switch
          checked={settings.showGrid}
          onCheckedChange={(v) => update({ showGrid: v })}
        />
      </SettingRow>
      <SettingRow label={t('settings.syncRange')}>
        <Switch
          checked={settings.syncChartRange}
          onCheckedChange={(v) => update({ syncChartRange: v })}
        />
      </SettingRow>
      <SettingRow label={t('settings.mobileSpark')}>
        <Switch
          checked={settings.mobileSpark}
          onCheckedChange={(v) => update({ mobileSpark: v })}
        />
      </SettingRow>
    </SettingsSection>
  );
}
