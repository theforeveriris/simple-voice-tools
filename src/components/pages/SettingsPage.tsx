/**
 * 设置页面（组合外壳，各分区实现见 src/components/settings/）
 * - 外观：主题（深浅）、语言、莫奈取色主题色（预设 + 自定义色相）、网格辅助线
 * - 录音：麦克风设备、最长录音时长、结束后自动进入分析
 * - 训练：训练靶标（目标音高区间 + 达成率）、基线记录
 * - 数据管理：历史记录导出 / 导入 / 清空（导出为 IndexedDB 全量）
 * - 实验性功能：设置的子页面（无描述行），内含 GitHub 云备份（Device Flow）
 * - 关于
 */

import { useEffect, useState } from 'react';
import { FlaskConical, ChevronRight } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings } from '@/types';
import { LabsPage } from '@/components/settings/LabsPage';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { RecordingSection } from '@/components/settings/RecordingSection';
import { TrainingSection } from '@/components/settings/TrainingSection';
import { DataSection } from '@/components/settings/DataSection';
import { AppSection, AboutSection } from '@/components/settings/AppAboutSection';

export function SettingsPage() {
  useI18n();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [labsOpen, setLabsOpen] = useState(false);

  // 枚举麦克风设备（授权过一次后才能拿到名称）
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
      setMics(devices.filter((d) => d.kind === 'audioinput'));
    }).catch(() => undefined);
  }, []);

  const update = (patch: Partial<AppSettings>) => updateSettings(patch);

  // 实验性功能（设置的子页面）
  // 入口在主视图收起为单行卡片（无描述行）；labsOpen 不持久化，切换页签即回主视图
  if (labsOpen) {
    return <LabsPage settings={settings} update={update} onBack={() => setLabsOpen(false)} />;
  }

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      <AppearanceSection settings={settings} update={update} />

      <RecordingSection settings={settings} update={update} mics={mics} />

      <TrainingSection settings={settings} update={update} />

      <DataSection />

      {/* 实验性功能（子页面入口） */}
      <button
        onClick={() => setLabsOpen(true)}
        className="flex w-full items-center justify-between rounded-[22px] bg-card px-5 py-4 text-left shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-transform active:scale-[0.99]"
        aria-label={t('settings.labs')}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FlaskConical size={15} className="text-accent" />
          {t('settings.labs')}
        </span>
        <ChevronRight size={15} className="text-ink-2" />
      </button>

      <AppSection />

      <AboutSection />
    </div>
  );
}
