/**
 * 设置页面（组合外壳，各分区与子页面实现见 src/components/settings/）
 * 仿历史页：顶部「设置 / 关于」胶囊切换 + 搜索框。
 * - 设置标签：外观 / 配置 / 数据管理 / 实验性功能 入口卡片 + 应用（PWA）
 *   搜索时改为展示匹配的设置项索引，点击直达对应子页面
 * - 关于标签：开发者与贡献者、应用简介、文档（AboutTab）
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { DatabaseBackup, FlaskConical, Info, Palette, Settings2, ChevronRight, Search } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings } from '@/types';
import { LabsPage } from '@/components/settings/LabsPage';
import { DataPage } from '@/components/settings/DataPage';
import { AppearancePage } from '@/components/settings/AppearancePage';
import { ConfigPage } from '@/components/settings/ConfigPage';
import { AboutTab } from '@/components/settings/AboutTab';
import { AppSection } from '@/components/settings/AppAboutSection';
import { cn } from '@/lib/utils';
import type { DictKey } from '@/i18n';

/** 设置项搜索索引：点击结果直达对应子页面 */
type SubPage = 'appearance' | 'config' | 'data' | 'labs';
const SEARCH_INDEX: { page: SubPage; sectionKey: DictKey; labelKey: DictKey }[] = [
  // 外观
  { page: 'appearance', sectionKey: 'settings.theme', labelKey: 'settings.theme' },
  { page: 'appearance', sectionKey: 'settings.theme', labelKey: 'settings.huePreset' },
  { page: 'appearance', sectionKey: 'settings.theme', labelKey: 'settings.hue' },
  { page: 'appearance', sectionKey: 'settings.language', labelKey: 'settings.language' },
  { page: 'appearance', sectionKey: 'settings.chartAids', labelKey: 'settings.showGrid' },
  { page: 'appearance', sectionKey: 'settings.chartAids', labelKey: 'settings.syncRange' },
  { page: 'appearance', sectionKey: 'settings.chartAids', labelKey: 'settings.mobileSpark' },
  // 配置 · 录音
  { page: 'config', sectionKey: 'settings.recording', labelKey: 'settings.autoEnter' },
  { page: 'config', sectionKey: 'settings.recording', labelKey: 'settings.audioSave' },
  { page: 'config', sectionKey: 'settings.recording', labelKey: 'settings.maxDuration' },
  { page: 'config', sectionKey: 'settings.recording', labelKey: 'settings.mic' },
  // 配置 · 训练
  { page: 'config', sectionKey: 'settings.training', labelKey: 'settings.targetEnable' },
  { page: 'config', sectionKey: 'settings.training', labelKey: 'settings.targetRange' },
  { page: 'config', sectionKey: 'settings.training', labelKey: 'settings.baseline' },
  // 数据管理
  { page: 'data', sectionKey: 'settings.storageUsage', labelKey: 'settings.storageUsage' },
  { page: 'data', sectionKey: 'settings.backupRestore', labelKey: 'settings.zipBackup' },
  { page: 'data', sectionKey: 'settings.backupRestore', labelKey: 'settings.zipRestore' },
  { page: 'data', sectionKey: 'settings.backupRestore', labelKey: 'settings.autoBackup' },
  { page: 'data', sectionKey: 'settings.backupRestore', labelKey: 'settings.autoBackupFolder' },
  { page: 'data', sectionKey: 'settings.backupRestore', labelKey: 'settings.autoBackupNow' },
  { page: 'data', sectionKey: 'settings.dataOps', labelKey: 'settings.exportJson' },
  { page: 'data', sectionKey: 'settings.dataOps', labelKey: 'settings.importJson' },
  { page: 'data', sectionKey: 'settings.dataOps', labelKey: 'settings.exportCsv' },
  { page: 'data', sectionKey: 'settings.dataOps', labelKey: 'settings.exportSettings' },
  { page: 'data', sectionKey: 'settings.dataOps', labelKey: 'settings.importSettings' },
  { page: 'data', sectionKey: 'settings.dataOps', labelKey: 'settings.loadDemo' },
  { page: 'data', sectionKey: 'settings.dataOps', labelKey: 'settings.clearAll' },
  // 实验性功能
  { page: 'labs', sectionKey: 'settings.labsToggles', labelKey: 'settings.showSpec' },
  { page: 'labs', sectionKey: 'settings.labsToggles', labelKey: 'settings.liveSpectrum' },
  { page: 'labs', sectionKey: 'settings.labsToggles', labelKey: 'settings.adviceEnable' },
  { page: 'labs', sectionKey: 'settings.bandCustom', labelKey: 'settings.bandBounds' },
  { page: 'labs', sectionKey: 'settings.bandCustom', labelKey: 'settings.bandReset' },
  { page: 'labs', sectionKey: 'vowelLive.title', labelKey: 'vowelLive.title' },
  { page: 'labs', sectionKey: 'settings.importAudio', labelKey: 'settings.importAudio' },
  { page: 'labs', sectionKey: 'settings.ghTitle', labelKey: 'settings.ghClientId' },
  { page: 'labs', sectionKey: 'settings.ghTitle', labelKey: 'settings.ghPush' },
  { page: 'labs', sectionKey: 'settings.ghTitle', labelKey: 'settings.ghPull' },
];

export function SettingsPage() {
  useI18n();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  // 主视图两个标签（仿历史页 列表/趋势 的胶囊切换）
  const [view, setView] = useState<'settings' | 'about'>('settings');
  const [query, setQuery] = useState('');
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [labsOpen, setLabsOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);

  const update = (patch: Partial<AppSettings>) => updateSettings(patch);

  // 子页面（设置标签 → 单行卡片入口）；open 状态不持久化，切换页签即回主视图
  if (appearanceOpen) {
    return <AppearancePage settings={settings} update={update} onBack={() => setAppearanceOpen(false)} />;
  }
  if (configOpen) {
    return <ConfigPage settings={settings} update={update} onBack={() => setConfigOpen(false)} />;
  }
  if (labsOpen) {
    return <LabsPage settings={settings} update={update} onBack={() => setLabsOpen(false)} />;
  }
  if (dataOpen) {
    return <DataPage settings={settings} update={update} onBack={() => setDataOpen(false)} />;
  }

  // 搜索结果（仅在设置标签且输入非空时展示；过滤开销极小，无需 memo——
  // 且不可用 hook：上方子页面分支会提前 return，hooks 必须无条件调用）
  const q = query.trim().toLowerCase();
  const results = q
    ? SEARCH_INDEX.filter((e) => {
        const label = t(e.labelKey).toLowerCase();
        const section = t(e.sectionKey).toLowerCase();
        return label.includes(q) || section.includes(q);
      })
    : [];
  const searching = view === 'settings' && q.length > 0;

  /** 子页面入口卡片（历史页同款圆角卡） */
  const entry = (label: string, icon: typeof Palette, onOpen: () => void) => (
    <button
      onClick={onOpen}
      className="flex w-full items-center justify-between rounded-[22px] bg-card px-5 py-4 text-left shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-transform active:scale-[0.99]"
      aria-label={label}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        {(() => { const Icon = icon; return <Icon size={15} className="text-accent" />; })()}
        {label}
      </span>
      <ChevronRight size={15} className="text-ink-2" />
    </button>
  );

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      {/* 设置 / 关于 切换（仿历史页 列表/趋势 胶囊） */}
      <div className="flex w-fit items-center gap-0.5 rounded-full bg-card p-1 shadow-[0_2px_14px_rgba(28,25,45,0.05)]">
        {(
          [
            { id: 'settings', label: t('settings.tabSettings'), icon: Settings2 },
            { id: 'about', label: t('settings.tabAbout'), icon: Info },
          ] as const
        ).map((tab) => {
          const active = view === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setView(tab.id);
                setQuery('');
              }}
              className="relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium"
              aria-label={t('history.viewAria', { name: tab.label })}
            >
              {active && (
                <motion.span layoutId="settings-view-pill" className="absolute inset-0 rounded-full bg-accent-soft" />
              )}
              <Icon size={13} className={cn('relative z-10', active ? 'text-accent' : 'text-ink-2')} />
              <span className={cn('relative z-10', active ? 'text-accent' : 'text-ink-2')}>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {view === 'about' ? (
        <AboutTab />
      ) : (
        <>
          {/* 搜索（仿历史页搜索框；非空时展示设置项索引结果） */}
          <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2.5 shadow-[0_2px_14px_rgba(28,25,45,0.05)]">
            <Search size={14} className="shrink-0 text-ink-2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('settings.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-2/70"
            />
          </div>

          {searching ? (
            /* 搜索结果：设置项索引，点击直达子页面 */
            results.length === 0 ? (
              <p className="rounded-[22px] bg-card px-5 py-6 text-center text-xs text-ink-2 shadow-[0_2px_14px_rgba(28,25,45,0.05)]">
                {t('history.noMatch', { q: query.trim() })}
              </p>
            ) : (
              <div className="rounded-[22px] bg-card px-5 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
                {results.map((e) => (
                  <button
                    key={`${e.page}.${e.labelKey}`}
                    onClick={() => {
                      setQuery('');
                      if (e.page === 'appearance') setAppearanceOpen(true);
                      else if (e.page === 'config') setConfigOpen(true);
                      else if (e.page === 'data') setDataOpen(true);
                      else setLabsOpen(true);
                    }}
                    className="flex w-full items-center justify-between gap-2 border-t border-black/[0.04] py-3 text-left first:border-t-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{t(e.labelKey)}</span>
                      <span className="block text-[11px] text-ink-2">{t(e.sectionKey)}</span>
                    </span>
                    <ChevronRight size={15} className="shrink-0 text-ink-2" />
                  </button>
                ))}
              </div>
            )
          ) : (
            <>
              {entry(t('settings.appearance'), Palette, () => setAppearanceOpen(true))}
              {entry(t('settings.config'), Settings2, () => setConfigOpen(true))}
              {entry(t('settings.data'), DatabaseBackup, () => setDataOpen(true))}
              {entry(t('settings.labs'), FlaskConical, () => setLabsOpen(true))}

              <AppSection />
            </>
          )}
        </>
      )}
    </div>
  );
}
