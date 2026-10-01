/** 训练设置：训练靶标（目标音高区间 + 达成率）、基线记录 */

import { Target } from 'lucide-react';
import { useHistoryStore } from '@/store/useHistoryStore';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { localeTag } from '@/i18n';
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

export function TrainingSection({
  settings,
  update,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}) {
  useI18n();
  const records = useHistoryStore((s) => s.records);

  /* ------------------------------ 训练靶标 ------------------------------ */

  const clampTarget = (v: string, fallback: number): number => {
    const n = Number(v);
    if (!isFinite(n)) return fallback;
    return Math.max(50, Math.min(500, Math.round(n)));
  };

  const setTargetMin = (v: string) => {
    const min = clampTarget(v, settings.targetF0Min);
    update({ targetF0Min: Math.min(min, settings.targetF0Max - 5) });
  };
  const setTargetMax = (v: string) => {
    const max = clampTarget(v, settings.targetF0Max);
    update({ targetF0Max: Math.max(max, settings.targetF0Min + 5) });
  };

  /** 基线选择器可选项（最近 50 条） */
  const baselineOptions = records.slice(0, 50);

  return (
    /* 训练 */
    <SettingsSection icon={Target} title={t('settings.training')}>
      <SettingRow label={t('settings.targetEnable')} desc={t('settings.targetDesc')}>
        <Switch
          checked={settings.targetEnabled}
          onCheckedChange={(v) => update({ targetEnabled: v })}
        />
      </SettingRow>
      {settings.targetEnabled && (
        <SettingRow stacked label={t('settings.targetRange')}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={50}
              max={500}
              value={settings.targetF0Min}
              onChange={(e) => setTargetMin(e.target.value)}
              className="w-24 rounded-xl border border-black/10 bg-surface-hi px-3 py-2 text-center text-sm tabular-nums text-ink outline-none focus:border-accent"
              aria-label={t('settings.targetRange')}
            />
            <span className="text-ink-2">–</span>
            <input
              type="number"
              inputMode="numeric"
              min={50}
              max={500}
              value={settings.targetF0Max}
              onChange={(e) => setTargetMax(e.target.value)}
              className="w-24 rounded-xl border border-black/10 bg-surface-hi px-3 py-2 text-center text-sm tabular-nums text-ink outline-none focus:border-accent"
              aria-label={t('settings.targetRange')}
            />
            <span className="text-xs text-ink-2">Hz</span>
          </div>
        </SettingRow>
      )}
      <SettingRow
        label={t('settings.baseline')}
        desc={t('settings.baselineDesc')}
        stacked
      >
        <Select
          value={settings.baselineRecordId ?? 'none'}
          onValueChange={(v) => update({ baselineRecordId: v === 'none' ? undefined : v })}
        >
          <SelectTrigger className="w-full border border-black/10 bg-surface-hi px-3 text-sm shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
            <SelectItem value="none">{t('settings.baselineNone')}</SelectItem>
            {baselineOptions.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                <span className="max-w-64 truncate">
                  {new Date(r.createdAt).toLocaleString(localeTag(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  {r.stats.avgF0.toFixed(1)} Hz
                  {r.note ? ` · ${r.note}` : ''}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingsSection>
  );
}
