/** 录音设置：结束后自动进入分析、保存音频、最长录音时长、麦克风设备 */

import { Mic } from 'lucide-react';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui';
import { SettingsSection, SettingRow } from './rows';

export function RecordingSection({
  settings,
  update,
  mics,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  /** 已授权枚举的麦克风设备（由父组件统一枚举） */
  mics: MediaDeviceInfo[];
}) {
  useI18n();

  return (
    /* 录音 */
    <SettingsSection icon={Mic} title={t('settings.recording')}>
      <SettingRow label={t('settings.autoEnter')}>
        <Switch
          checked={settings.autoEnterAnalysis}
          onCheckedChange={(v) => update({ autoEnterAnalysis: v })}
        />
      </SettingRow>
      <SettingRow label={t('settings.audioSave')}>
        <Switch
          checked={settings.audioSave}
          onCheckedChange={(v) => update({ audioSave: v })}
        />
      </SettingRow>
      <SettingRow label={t('settings.maxDuration')}>
        <Select
          value={String(settings.maxDurationSec)}
          onValueChange={(v) => update({ maxDurationSec: Number(v) })}
        >
          <SelectTrigger className="w-28 border-0 bg-transparent px-0 text-sm shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
            <SelectItem value="30">{t('settings.dur30')}</SelectItem>
            <SelectItem value="60">{t('settings.dur60')}</SelectItem>
            <SelectItem value="120">{t('settings.dur120')}</SelectItem>
            <SelectItem value="300">{t('settings.dur300')}</SelectItem>
            <SelectItem value="0">{t('settings.durUnlimited')}</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow label={t('settings.mic')}>
        <Select
          value={settings.micDeviceId || 'default'}
          onValueChange={(v) => update({ micDeviceId: v === 'default' ? '' : v })}
        >
          <SelectTrigger className="w-52 max-w-full overflow-hidden border-0 bg-transparent px-0 text-sm shadow-none [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:truncate">
            <SelectValue placeholder={t('settings.micDefault')} />
          </SelectTrigger>
          <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
            <SelectItem value="default">{t('settings.micDefault')}</SelectItem>
            {mics.map((mic, i) => (
              <SelectItem key={mic.deviceId} value={mic.deviceId}>
                <span className="max-w-52 truncate">{mic.label || `${t('settings.mic')} ${i + 1}`}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingsSection>
  );
}
