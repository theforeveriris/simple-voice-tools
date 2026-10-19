/**
 * 训练（设置的子页面）
 * 回答「我在练什么、怎么被督促、怎么看练习过程」：
 *   用户画像（训练方向 / 年龄段）→ 训练靶标（目标区间 / 共振峰目标区 / 基线记录）
 *   → 训练建议（建议模式 / 对比时给建议）→ 自定义音区边界
 *   → 实时练习视图（元音落点 / 音高 / 频谱 / 声域图）→ 每日练习提醒
 * 原分散在「配置」（画像 / 靶标 / 提醒）与「实验性功能」（音区边界 / 建议模式 /
 * 实时视图）——这些都已转正，按「训练」这一件事收拢到同一页。
 */

import { useState } from 'react';
import { LocateFixed, AudioWaveform, Waves, LayoutGrid, Radar, Ruler, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_BAND_BOUNDS } from '@/constants';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AdviceMode, AppSettings } from '@/types';
import { VowelLiveSheet } from '@/components/pages/VowelLiveSheet';
import { F0LiveSheet } from '@/components/pages/F0LiveSheet';
import { SpecLiveSheet } from '@/components/pages/SpecLiveSheet';
import { VrpLiveSheet } from '@/components/pages/VrpLiveSheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@/components/ui';
import { cn } from '@/lib/utils';
import { InfoTip } from './InfoTip';
import { ProfileSection } from './ProfileSection';
import { TrainingSection } from './TrainingSection';
import { ReminderSection } from './ReminderSection';
import { SELECT_TRIGGER_CLASS, SettingsSection, SettingRow, SettingsSubPage } from './rows';

export function TrainingPage({
  settings,
  update,
  onBack,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  onBack: () => void;
}) {
  useI18n();

  // 实时练习视图（全屏子页，一次最多一个）
  const [vowelLiveOpen, setVowelLiveOpen] = useState(false);
  const [f0LiveOpen, setF0LiveOpen] = useState(false);
  const [specLiveOpen, setSpecLiveOpen] = useState(false);
  const [vrpLiveOpen, setVrpLiveOpen] = useState(false);

  /* ------------------------------ 自定义音区边界 ------------------------------ */

  const bandBounds = settings.bandBounds ?? DEFAULT_BAND_BOUNDS;

  /** 修改单个边界：与相邻边界互相挤开（最小间距 10Hz），越界时放弃本次修改 */
  const setBandBound = (idx: 0 | 1 | 2 | 3, raw: string) => {
    const v = Math.max(60, Math.min(500, Math.round(Number(raw) || 0)));
    const next = [...bandBounds] as [number, number, number, number];
    next[idx] = v;
    for (let i = idx - 1; i >= 0; i--) if (next[i] >= next[i + 1]) next[i] = next[i + 1] - 10;
    for (let i = idx + 1; i < 4; i++) if (next[i] <= next[i - 1]) next[i] = next[i - 1] + 10;
    if (next[0] < 60 || next[3] > 500) return;
    if (!(next[0] < next[1] && next[1] < next[2] && next[2] < next[3])) return;
    update({ bandBounds: next });
  };

  const resetBandBounds = () => {
    if (!settings.bandBounds) return;
    update({ bandBounds: undefined });
    toast.success(t('toast.bandResetDone'));
  };

  return (
    <SettingsSubPage title={t('settings.training')} onBack={onBack}>
      {/* 用户画像：训练方向 / 年龄段（决定默认靶标与参考区间口径） */}
      <ProfileSection settings={settings} update={update} />

      {/* 训练靶标：目标音高区间 / 共振峰目标区 / 基线记录 */}
      <TrainingSection settings={settings} update={update} />

      {/* 训练建议：生成方式（本地规则 / Lua 脚本 / 大模型）+ 对比时是否给建议 */}
      <SettingsSection icon={Sparkles} title={t('settings.adviceSection')}>
        <SettingRow label={t('settings.adviceMode')}>
          <Select
            value={settings.adviceMode}
            onValueChange={(v) => update({ adviceMode: v as AdviceMode })}
          >
            <SelectTrigger className={SELECT_TRIGGER_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
              <SelectItem value="none">{t('settings.adviceModeNone')}</SelectItem>
              <SelectItem value="rules">{t('settings.adviceModeRules')}</SelectItem>
              <SelectItem value="lua">{t('settings.adviceModeLua')}</SelectItem>
              <SelectItem value="llm">{t('settings.adviceModeLlm')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label={t('settings.adviceOnCompare')} desc={t('settings.adviceOnCompareDesc')}>
          <Switch
            checked={settings.adviceOnCompare}
            onCheckedChange={(v) => update({ adviceOnCompare: v })}
          />
        </SettingRow>
      </SettingsSection>

      {/* 自定义音区边界（适配变声期 / 童声 / 低音女声） */}
      <SettingsSection icon={Ruler} title={t('settings.bandCustom')}>
        <SettingRow stacked label={<InfoTip label={t('settings.bandBounds')} text={t('settings.bandCustomDesc')} />}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {([0, 1, 2, 3] as const).map((idx) => (
              <label key={idx} className="flex flex-col gap-1">
                <span className="text-[10px] text-ink-2">{t(`settings.bandBound${idx}`)}</span>
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={60}
                    max={500}
                    value={bandBounds[idx]}
                    onChange={(e) => setBandBound(idx, e.target.value)}
                    className="w-14 rounded-xl border border-black/10 bg-surface-hi px-2 py-1.5 text-right text-sm tabular-nums text-ink outline-none focus:border-accent"
                    aria-label={t(`settings.bandBound${idx}`)}
                  />
                  <span className="text-[10px] text-ink-2">Hz</span>
                </span>
              </label>
            ))}
          </div>
        </SettingRow>
        <SettingRow label={<InfoTip label={t('settings.bandReset')} text={t('settings.bandResetDesc')} />}>
          <button
            onClick={resetBandBounds}
            disabled={!settings.bandBounds}
            className={cn(
              'flex items-center gap-1.5 px-1 py-2 text-xs font-medium transition-opacity',
              settings.bandBounds ? 'text-accent hover:opacity-70' : 'cursor-default text-ink-2/50',
            )}
          >
            <RotateCcw size={14} />
            {t('settings.bandResetAction')}
          </button>
        </SettingRow>
      </SettingsSection>

      {/* 实时练习视图：录音同时查看元音落点 / 音高 / 频谱 / 声域图 */}
      <SettingsSection icon={Radar} title={t('labs.realtime')}>
        <SettingRow label={<InfoTip label={t('labs.rtVowel')} text={t('labs.rtVowelDesc')} />}>
          <button
            onClick={() => setVowelLiveOpen(true)}
            className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
          >
            <LocateFixed size={14} />
            {t('vowelLive.openAction')}
          </button>
        </SettingRow>
        <SettingRow label={<InfoTip label={t('labs.rtF0')} text={t('labs.rtF0Desc')} />}>
          <button
            onClick={() => setF0LiveOpen(true)}
            className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
          >
            <AudioWaveform size={14} />
            {t('vowelLive.openAction')}
          </button>
        </SettingRow>
        <SettingRow label={<InfoTip label={t('labs.rtSpec')} text={t('labs.rtSpecDesc')} />}>
          <button
            onClick={() => setSpecLiveOpen(true)}
            className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
          >
            <Waves size={14} />
            {t('vowelLive.openAction')}
          </button>
        </SettingRow>
        <SettingRow label={<InfoTip label={t('labs.rtVrp')} text={t('labs.rtVrpDesc')} />}>
          <button
            onClick={() => setVrpLiveOpen(true)}
            className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
          >
            <LayoutGrid size={14} />
            {t('vowelLive.openAction')}
          </button>
        </SettingRow>
      </SettingsSection>

      {/* 每日练习提醒 */}
      <ReminderSection settings={settings} update={update} />

      {/* 实时练习视图全屏子页（一次最多一个） */}
      {vowelLiveOpen && <VowelLiveSheet onClose={() => setVowelLiveOpen(false)} />}
      {f0LiveOpen && <F0LiveSheet onClose={() => setF0LiveOpen(false)} />}
      {specLiveOpen && <SpecLiveSheet onClose={() => setSpecLiveOpen(false)} />}
      {vrpLiveOpen && <VrpLiveSheet onClose={() => setVrpLiveOpen(false)} />}
    </SettingsSubPage>
  );
}
