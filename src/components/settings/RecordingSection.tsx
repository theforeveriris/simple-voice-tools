/** 录音设置：自动进入分析、保存音频、时长、麦克风、增益/码率/震动/自动回放/判停 */

import { useEffect, useState } from 'react';
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
import { InfoTip } from './InfoTip';

export function RecordingSection({
  settings,
  update,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}) {
  useI18n();
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);

  // 枚举麦克风设备（授权过一次后才能拿到名称）。未授权时浏览器返回的
  // 默认设备 deviceId 为空字符串——Radix SelectItem 禁止空 value（会直接抛错，
  // 见 v0.8.4），且这些设备本就无法具体选择，过滤后仅保留「系统默认」一项
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
      setMics(devices.filter((d) => d.kind === 'audioinput' && d.deviceId));
    }).catch(() => undefined);
  }, []);

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
      <SettingRow label={<InfoTip label={t('settings.silenceStop')} text={t('settings.silenceStopDesc')} />}>
        <Select
          value={String(settings.silenceStopSec)}
          onValueChange={(v) => update({ silenceStopSec: Number(v) })}
        >
          <SelectTrigger className="w-24 border-0 bg-transparent px-0 text-sm shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
            <SelectItem value="0.5">{t('common.sec', { n: '0.5' })}</SelectItem>
            <SelectItem value="1">{t('common.sec', { n: 1 })}</SelectItem>
            <SelectItem value="2">{t('common.sec', { n: 2 })}</SelectItem>
          </SelectContent>
        </Select>
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
      <SettingRow label={<InfoTip label={t('settings.audioBitrate')} text={t('settings.audioBitrateDesc')} />}>
        <Select
          value={String(settings.audioBitrateKbps)}
          onValueChange={(v) => update({ audioBitrateKbps: Number(v) })}
        >
          <SelectTrigger className="w-24 border-0 bg-transparent px-0 text-sm shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
            <SelectItem value="96">{t('settings.bitrateKbps', { n: 96 })}</SelectItem>
            <SelectItem value="128">{t('settings.bitrateKbps', { n: 128 })}</SelectItem>
            <SelectItem value="256">{t('settings.bitrateKbps', { n: 256 })}</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow label={<InfoTip label={t('settings.micEnhance')} text={t('settings.micEnhanceDesc')} />}>
        <Switch
          checked={settings.micEnhance}
          onCheckedChange={(v) => update({ micEnhance: v })}
        />
      </SettingRow>
      <SettingRow label={<InfoTip label={t('settings.haptics')} text={t('settings.hapticsDesc')} />}>
        <Switch
          checked={settings.haptics}
          onCheckedChange={(v) => update({ haptics: v })}
        />
      </SettingRow>
      <SettingRow label={<InfoTip label={t('settings.autoReplay')} text={t('settings.autoReplayDesc')} />}>
        <Switch
          checked={settings.autoReplay}
          onCheckedChange={(v) => update({ autoReplay: v })}
        />
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
