/**
 * 录音（设置的子页面）
 * 回答「声音怎么采进来」：录音行为（自动进入分析 / 保存音频 / 静音判停 / 最长时长）、
 * 音质与设备（码率 / 增益降噪 / 震动 / 自动回放 / 麦克风选择）。
 * 内容即原「配置 · 录音」整块，页面独立后录音相关项不再与大杂烩混在一起。
 */

import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings } from '@/types';
import { RecordingSection } from './RecordingSection';
import { SettingsSubPage } from './rows';

export function RecordingPage({
  settings,
  update,
  onBack,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  onBack: () => void;
}) {
  useI18n();
  return (
    <SettingsSubPage title={t('settings.recording')} onBack={onBack}>
      <RecordingSection settings={settings} update={update} />
    </SettingsSubPage>
  );
}
