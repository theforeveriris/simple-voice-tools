/**
 * 用户画像（配置的子区块，ConfigPage 引入）
 * - 训练方向：女性化 / 男性化 / 其他；
 *   切换方向会按 GOAL_TARGET_DEFAULTS 重新铺底训练靶标与共振峰靶标中心
 *   （「其他」铺底为 120–220 Hz 中性宽靶）。已有手动调整的靶标
 *   在切换训练方向时仍会同步更新为对应默认——明确重置为合理起点比保留
 *   与新方向矛盾的旧值更安全。
 * - 年龄段：决定实验性功能「自定义音区边界」未自定义时按 AGE_BAND_PRESETS 派生默认值，
 *   并把年龄显式传给大模型分析标准（影响参考基频 / 共振峰范围）。
 */

import { UserCircle2 } from 'lucide-react';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AgeGroup, AppSettings, UserGoal } from '@/types';
import { AGE_GROUPS, GOAL_TARGET_DEFAULTS, USER_GOALS } from '@/constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { SettingsSection, SettingRow } from './rows';
import { InfoTip } from './InfoTip';

/** 切换训练方向：同步更新训练靶标（目标 F0 区间 + 共振峰靶标中心） */
function applyGoalDefaults(goal: UserGoal, update: (patch: Partial<AppSettings>) => void): void {
  const d = GOAL_TARGET_DEFAULTS[goal];
  update({
    userGoal: goal,
    targetF0Min: d.targetF0Min,
    targetF0Max: d.targetF0Max,
    formantTargetF1: d.formantTargetF1,
    formantTargetF2: d.formantTargetF2,
  });
}

export function ProfileSection({
  settings,
  update,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}) {
  useI18n();
  return (
    <SettingsSection icon={UserCircle2} title={t('settings.profile')}>
      <SettingRow
        label={<InfoTip label={t('settings.userGoal')} text={t('settings.userGoalDesc')} />}
      >
        <Select
          value={settings.userGoal}
          onValueChange={(v) => applyGoalDefaults(v as UserGoal, update)}
        >
          <SelectTrigger className="w-36 border-0 bg-transparent px-0 text-sm shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
            {USER_GOALS.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {t(g.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      {/* 训练方向说明：长版描述放一行下方，便于初次理解 MtF / FtM / 其他 的口径 */}
      <SettingRow stacked label={<span className="sr-only">{t('settings.userGoalDesc')}</span>}>
        <p className="text-[11px] leading-relaxed text-ink-2">
          {t(USER_GOALS.find((g) => g.id === settings.userGoal)?.descKey ?? 'settings.goalOtherDesc')}
        </p>
      </SettingRow>
      <SettingRow
        label={<InfoTip label={t('settings.ageGroup')} text={t('settings.ageGroupDesc')} />}
      >
        <Select
          value={settings.ageGroup}
          onValueChange={(v) => update({ ageGroup: v as AgeGroup })}
        >
          <SelectTrigger className="w-36 border-0 bg-transparent px-0 text-sm shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
            {AGE_GROUPS.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {t(a.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow stacked label={<span className="sr-only">{t('settings.ageGroupDesc')}</span>}>
        <p className="text-[11px] leading-relaxed text-ink-2">
          {t(AGE_GROUPS.find((a) => a.id === settings.ageGroup)?.descKey ?? 'settings.ageAdultDesc')}
        </p>
      </SettingRow>
    </SettingsSection>
  );
}
