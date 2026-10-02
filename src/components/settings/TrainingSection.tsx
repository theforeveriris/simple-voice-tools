/** 训练设置：训练靶标（目标音高区间 + 达成率）、共振峰目标区（元音散点）、基线记录 */

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
import { InfoTip } from './InfoTip';

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

  /* ------------------------------ 共振峰目标区 ------------------------------ */

  const clampF1 = (v: string): number => {
    const n = Number(v);
    if (!isFinite(n)) return settings.formantTargetF1;
    return Math.max(200, Math.min(1100, Math.round(n)));
  };
  const clampF2 = (v: string): number => {
    const n = Number(v);
    if (!isFinite(n)) return settings.formantTargetF2;
    return Math.max(500, Math.min(3400, Math.round(n)));
  };
  const clampRadius = (v: string): number => {
    const n = Number(v);
    if (!isFinite(n)) return settings.formantTargetRadius;
    return Math.max(50, Math.min(800, Math.round(n)));
  };
  const numCls =
    'w-16 rounded-xl border border-black/10 bg-surface-hi px-2 py-2 text-center text-sm tabular-nums text-ink outline-none focus:border-accent';

  /** 基线选择器可选项（最近 50 条） */
  const baselineOptions = records.slice(0, 50);

  return (
    /* 训练 */
    <SettingsSection icon={Target} title={t('settings.training')}>
      <SettingRow label={<InfoTip label={t('settings.targetEnable')} text={t('settings.targetDesc')} />}>
        <Switch
          checked={settings.targetEnabled}
          onCheckedChange={(v) => update({ targetEnabled: v })}
        />
      </SettingRow>
      {settings.targetEnabled && (
        <SettingRow label={t('settings.targetRange')}>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={50}
              max={500}
              value={settings.targetF0Min}
              onChange={(e) => setTargetMin(e.target.value)}
              className="w-14 rounded-xl border border-black/10 bg-surface-hi px-2 py-2 text-center text-sm tabular-nums text-ink outline-none focus:border-accent"
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
              className="w-14 rounded-xl border border-black/10 bg-surface-hi px-2 py-2 text-center text-sm tabular-nums text-ink outline-none focus:border-accent"
              aria-label={t('settings.targetRange')}
            />
          </div>
        </SettingRow>
      )}
      {/* 共振峰目标区：元音散点叠加目标矩形 + 命中率 */}
      <SettingRow label={<InfoTip label={t('settings.formantTargetEnable')} text={t('settings.formantTargetDesc')} />}>
        <Switch
          checked={settings.formantTargetEnabled}
          onCheckedChange={(v) => update({ formantTargetEnabled: v })}
        />
      </SettingRow>
      {settings.formantTargetEnabled && (
        <>
          <SettingRow label={t('settings.formantTargetCenter')}>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-ink-2">F1</span>
              <input
                type="number"
                inputMode="numeric"
                min={200}
                max={1100}
                value={settings.formantTargetF1}
                onChange={(e) => update({ formantTargetF1: clampF1(e.target.value) })}
                className={numCls}
                aria-label="F1"
              />
              <span className="text-[10px] text-ink-2">F2</span>
              <input
                type="number"
                inputMode="numeric"
                min={500}
                max={3400}
                value={settings.formantTargetF2}
                onChange={(e) => update({ formantTargetF2: clampF2(e.target.value) })}
                className={numCls}
                aria-label="F2"
              />
            </div>
          </SettingRow>
          <SettingRow label={t('settings.formantTargetRadius')}>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-ink-2">±</span>
              <input
                type="number"
                inputMode="numeric"
                min={50}
                max={800}
                step={10}
                value={settings.formantTargetRadius}
                onChange={(e) => update({ formantTargetRadius: clampRadius(e.target.value) })}
                className={numCls}
                aria-label={t('settings.formantTargetRadius')}
              />
              <span className="text-[10px] text-ink-2">Hz</span>
            </div>
          </SettingRow>
        </>
      )}
      <SettingRow
        label={<InfoTip label={t('settings.baseline')} text={t('settings.baselineDesc')} />}
      >
        <Select
          value={settings.baselineRecordId ?? 'none'}
          onValueChange={(v) => update({ baselineRecordId: v === 'none' ? undefined : v })}
        >
          <SelectTrigger className="w-44 border border-black/10 bg-surface-hi px-3 text-sm shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
            <SelectItem value="none">{t('settings.baselineNone')}</SelectItem>
            {baselineOptions.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                <span className="max-w-52 truncate">
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
