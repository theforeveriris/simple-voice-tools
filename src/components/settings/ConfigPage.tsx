/**
 * 配置（设置的子页面，入口为主视图单行卡片）
 * - 录音：自动进入/保存音频/判停/时长/码率/增益/震动/自动回放/麦克风
 * - 训练：训练靶标（目标音高区间 + 达成率）、基线记录
 * - 提醒：每日练习提醒（本地通知）
 * - 图表与回放：实时窗口、音高轴范围、语谱图配色、回放倍速
 * - 通用：启动默认页签、日记周起始日
 */

import { motion } from 'framer-motion';
import { ArrowLeft, Gauge, SlidersHorizontal } from 'lucide-react';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings, SpecColormap, ViewType } from '@/types';
import { NAV, navLabelKey } from './navItems';
import { RecordingSection } from './RecordingSection';
import { TrainingSection } from './TrainingSection';
import { ReminderSection } from './ReminderSection';
import { SettingsSection, SettingRow } from './rows';
import { InfoTip } from './InfoTip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';

export function ConfigPage({
  settings,
  update,
  onBack,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  /** 返回设置主视图（configOpen 由父组件持有，不持久化） */
  onBack: () => void;
}) {
  useI18n();

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
          <p className="text-base font-semibold text-ink">{t('settings.config')}</p>
        </div>

        <RecordingSection settings={settings} update={update} />

        <TrainingSection settings={settings} update={update} />

        <ReminderSection settings={settings} update={update} />

        {/* 图表与回放 */}
        <SettingsSection icon={SlidersHorizontal} title={t('settings.chartPlayback')}>
          <SettingRow label={<InfoTip label={t('settings.liveWindow')} text={t('settings.liveWindowDesc')} />}>
            <Select
              value={String(settings.liveWindowSec)}
              onValueChange={(v) => update({ liveWindowSec: Number(v) })}
            >
              <SelectTrigger className="w-24 border-0 bg-transparent px-0 text-sm shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                <SelectItem value="6">{t('common.sec', { n: 6 })}</SelectItem>
                <SelectItem value="12">{t('common.sec', { n: 12 })}</SelectItem>
                <SelectItem value="20">{t('common.sec', { n: 20 })}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label={<InfoTip label={t('settings.pitchAxis')} text={t('settings.pitchAxisDesc')} />}>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min={30}
                max={200}
                value={settings.pitchAxisMin}
                onChange={(e) => {
                  const min = Math.max(30, Math.min(200, Number(e.target.value) || 50));
                  update({ pitchAxisMin: Math.min(min, settings.pitchAxisMax - 50) });
                }}
                className="w-14 rounded-xl border border-black/10 bg-surface-hi px-2 py-2 text-center text-sm tabular-nums text-ink outline-none focus:border-accent"
                aria-label={t('settings.pitchAxis')}
              />
              <span className="text-ink-2">–</span>
              <input
                type="number"
                inputMode="numeric"
                min={300}
                max={2000}
                value={settings.pitchAxisMax}
                onChange={(e) => {
                  const max = Math.max(300, Math.min(2000, Number(e.target.value) || 520));
                  update({ pitchAxisMax: Math.max(max, settings.pitchAxisMin + 50) });
                }}
                className="w-14 rounded-xl border border-black/10 bg-surface-hi px-2 py-2 text-center text-sm tabular-nums text-ink outline-none focus:border-accent"
                aria-label={t('settings.pitchAxis')}
              />
              <span className="text-xs text-ink-2">Hz</span>
            </div>
          </SettingRow>
          <SettingRow label={<InfoTip label={t('settings.specColormap')} text={t('settings.specColormapDesc')} />}>
            <Select
              value={settings.specColormap}
              onValueChange={(v) => update({ specColormap: v as SpecColormap })}
            >
              <SelectTrigger className="w-36 border-0 bg-transparent px-0 text-sm shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                <SelectItem value="magma">{t('settings.colormapMagma')}</SelectItem>
                <SelectItem value="gray">{t('settings.colormapGray')}</SelectItem>
                <SelectItem value="accent">{t('settings.colormapAccent')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label={t('settings.playbackRateSel')}>
            <Select
              value={String(settings.playbackRate)}
              onValueChange={(v) => update({ playbackRate: Number(v) })}
            >
              <SelectTrigger className="w-24 border-0 bg-transparent px-0 text-sm shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                <SelectItem value="0.5">0.5×</SelectItem>
                <SelectItem value="0.75">0.75×</SelectItem>
                <SelectItem value="1">{t('settings.playbackNormal')}</SelectItem>
                <SelectItem value="1.5">1.5×</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </SettingsSection>

        {/* 通用 */}
        <SettingsSection icon={Gauge} title={t('settings.general')}>
          <SettingRow label={t('settings.startTab')}>
            <Select
              value={settings.startTab}
              onValueChange={(v) => update({ startTab: v as ViewType })}
            >
              <SelectTrigger className="w-24 border-0 bg-transparent px-0 text-sm shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                {NAV.map((n) => (
                  <SelectItem key={n} value={n}>{t(navLabelKey[n])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label={t('settings.diaryWeekStart')}>
            <Select
              value={String(settings.diaryWeekStart)}
              onValueChange={(v) => update({ diaryWeekStart: Number(v) as 0 | 1 })}
            >
              <SelectTrigger className="w-24 border-0 bg-transparent px-0 text-sm shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                <SelectItem value="1">{t('settings.weekMonday')}</SelectItem>
                <SelectItem value="0">{t('settings.weekSunday')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </SettingsSection>
      </motion.div>
    </div>
  );
}
