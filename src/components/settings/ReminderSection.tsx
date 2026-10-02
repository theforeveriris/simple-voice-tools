/**
 * 练习提醒设置区块（配置子页面 · 训练之后）
 * 每日本地通知：开关（启用时申请通知权限）+ 时间 + 权限状态 + 测试通知。
 * 平台限制：应用被完全杀死后无法唤醒，提醒仅在应用打开/后台运行时生效。
 */

import { useState } from 'react';
import { AlarmClock, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import {
  reminderPermission, requestReminderPermission, showPracticeReminder,
} from '@/lib/reminder';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings } from '@/types';
import { SettingsSection, SettingRow } from './rows';
import { InfoTip } from './InfoTip';
import { Switch } from '@/components/ui';

/** 通知权限状态文案 */
function permLabel(p: NotificationPermission | 'unsupported'): string {
  if (p === 'granted') return t('settings.reminderPermGranted');
  if (p === 'denied') return t('settings.reminderPermDenied');
  if (p === 'unsupported') return t('settings.reminderPermUnsupported');
  return t('settings.reminderPermDefault');
}

export function ReminderSection({
  settings,
  update,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}) {
  useI18n();
  // 权限状态非响应式（无事件），读写时刷新一次
  const [, force] = useState(0);
  const perm = reminderPermission();

  const onToggle = (v: boolean) => {
    update({ practiceReminderEnabled: v });
    if (v) {
      void requestReminderPermission().then((p) => {
        force((x) => x + 1);
        if (p === 'denied') toast.error(t('toast.reminderDenied'));
      });
    }
  };

  const onTest = () => {
    void requestReminderPermission().then((p) => {
      force((x) => x + 1);
      if (p === 'granted') {
        showPracticeReminder();
        toast.success(t('toast.reminderTestOk'));
      } else if (p === 'denied') {
        toast.error(t('toast.reminderDenied'));
      }
    });
  };

  return (
    <SettingsSection icon={AlarmClock} title={t('settings.reminderSection')}>
      <SettingRow label={<InfoTip label={t('settings.reminderEnable')} text={t('settings.reminderEnableDesc')} />}>
        <Switch checked={settings.practiceReminderEnabled} onCheckedChange={onToggle} />
      </SettingRow>
      <SettingRow label={t('settings.reminderTime')}>
        <input
          type="time"
          value={settings.practiceReminderTime}
          onChange={(e) => update({ practiceReminderTime: e.target.value || '20:00' })}
          className="rounded-xl border border-black/10 bg-surface-hi px-2.5 py-2 text-sm tabular-nums text-ink outline-none focus:border-accent"
          aria-label={t('settings.reminderTime')}
        />
      </SettingRow>
      <SettingRow label={<InfoTip label={t('settings.reminderPermission')} text={t('settings.reminderPermDesc')} />}>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-2">{permLabel(perm)}</span>
          <button
            onClick={onTest}
            className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
          >
            <BellRing size={13} />
            {t('settings.reminderTest')}
          </button>
        </div>
      </SettingRow>
    </SettingsSection>
  );
}
