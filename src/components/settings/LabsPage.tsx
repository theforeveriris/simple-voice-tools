/**
 * 实验性功能（设置的子页面）
 * - 功能开关（语谱图 / 实时频谱 / 训练建议）
 * - 自定义音区边界（实验性）
 * - 实时元音落点
 * - 导入音频离线分析
 * - GitHub 云备份（Device Flow）
 * - 本地自动备份（File System Access API）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, SlidersHorizontal, Ruler, RotateCcw, LocateFixed, FileAudio,
  FolderOpen, ShieldCheck, CloudUpload, HardDriveDownload,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { DEFAULT_BAND_BOUNDS } from '@/constants';
import { analyzeAudioFile, importErrorKey } from '@/lib/audio/importAudio';
import {
  pickAutoBackupFolder, getAutoBackupState,
  requestAutoBackupPermission, runAutoBackupNow, maybeAutoBackup,
  type AutoBackupState,
} from '@/lib/backup/local';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { localeTag } from '@/i18n';
import type { AppSettings } from '@/types';
import { VowelLiveSheet } from '@/components/pages/VowelLiveSheet';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui';
import { SettingsSection, SettingRow } from './rows';
import { GithubBackupSection } from './GithubBackupSection';

export function LabsPage({
  settings,
  update,
  onBack,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  /** 返回设置主视图（labsOpen 由父组件持有，不持久化） */
  onBack: () => void;
}) {
  useI18n();
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const setTab = useStore((s) => s.setTab);

  // 实时元音落点（Labs 子页面入口）
  const [vowelLiveOpen, setVowelLiveOpen] = useState(false);
  // 导入音频离线分析
  const [importBusy, setImportBusy] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [importDragOver, setImportDragOver] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);
  // 本地自动备份（实验性）
  const [autoBackup, setAutoBackup] = useState<AutoBackupState | null>(null);

  const refreshAutoBackup = useCallback(() => {
    void getAutoBackupState().then(setAutoBackup);
  }, []);

  useEffect(() => {
    refreshAutoBackup();
  }, [refreshAutoBackup]);

  /* ------------------------------ 自定义音区边界（实验性） ------------------------------ */

  const bandBounds = settings.bandBounds ?? DEFAULT_BAND_BOUNDS;

  /** 修改单个边界：与相邻边界互相挤开（最小间距 10Hz），越界时放弃本次修改 */
  const setBandBound = (idx: 0 | 1 | 2 | 3, raw: string) => {
    const v = Math.max(60, Math.min(500, Math.round(Number(raw) || 0)));
    const next = [...bandBounds] as [number, number, number, number];
    next[idx] = v;
    for (let i = idx - 1; i >= 0; i--) if (next[i] >= next[i + 1]) next[i] = next[i + 1] - 10;
    for (let i = idx + 1; i < 4; i++) if (next[i] <= next[i - 1]) next[i] = next[i - 1] + 10;
    if (next[0] < 60 || next[3] > 500) return;
    if (!(next[0] < next[1] && next[1] < next[2] && next[2] < next[3])) return;
    update({ bandBounds: next });
  };

  const resetBandBounds = () => {
    if (!settings.bandBounds) return;
    update({ bandBounds: undefined });
    toast.success(t('toast.bandResetDone'));
  };

  /* ------------------------------ 导入音频离线分析（实验性） ------------------------------ */

  const runAudioImport = (file: File) => {
    if (importBusy) return;
    setImportBusy(true);
    setImportPct(0);
    void (async () => {
      try {
        const { record, audio, truncated } = await analyzeAudioFile(file, {
          targetRange: settings.targetEnabled ? [settings.targetF0Min, settings.targetF0Max] : null,
          saveAudio: settings.audioSave,
          onProgress: setImportPct,
        });
        useHistoryStore.getState().addRecord(record, audio ?? undefined);
        setCurrentAnalysis(record);
        setTab('analysis');
        void maybeAutoBackup('record');
        toast.success(truncated ? t('toast.importAudioTruncated') : t('toast.importAudioDone'));
      } catch (err) {
        toast.error(t(importErrorKey(err)));
      } finally {
        setImportBusy(false);
      }
    })();
  };

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
          <p className="text-base font-semibold text-ink">{t('settings.labs')}</p>
        </div>

        {/* 功能开关 */}
        <SettingsSection icon={SlidersHorizontal} title={t('settings.labsToggles')}>
          <SettingRow label={t('settings.showSpec')}>
            <Switch
              checked={settings.showSpectrogram}
              onCheckedChange={(v) => update({ showSpectrogram: v })}
            />
          </SettingRow>
          <SettingRow label={t('settings.liveSpectrum')}>
            <Switch
              checked={settings.liveSpectrum}
              onCheckedChange={(v) => update({ liveSpectrum: v })}
            />
          </SettingRow>
          <SettingRow label={t('settings.adviceEnable')}>
            <Switch
              checked={settings.adviceEnabled}
              onCheckedChange={(v) => update({ adviceEnabled: v })}
            />
          </SettingRow>
        </SettingsSection>

        {/* 自定义音区边界 */}
        <SettingsSection icon={Ruler} title={t('settings.bandCustom')}>
          <SettingRow stacked label={t('settings.bandBounds')} desc={t('settings.bandCustomDesc')}>
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              {([0, 1, 2, 3] as const).map((idx) => (
                <label key={idx} className="flex flex-col gap-1">
                  <span className="text-[10px] text-ink-2">{t(`settings.bandBound${idx}`)}</span>
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={60}
                      max={500}
                      value={bandBounds[idx]}
                      onChange={(e) => setBandBound(idx, e.target.value)}
                      className="w-20 rounded-xl border border-black/10 bg-surface-hi px-2.5 py-2 text-center text-sm tabular-nums text-ink outline-none focus:border-accent"
                      aria-label={t(`settings.bandBound${idx}`)}
                    />
                    <span className="text-[10px] text-ink-2">Hz</span>
                  </span>
                </label>
              ))}
            </div>
          </SettingRow>
          <SettingRow label={t('settings.bandReset')} desc={t('settings.bandResetDesc')}>
            <button
              onClick={resetBandBounds}
              disabled={!settings.bandBounds}
              className={cn(
                'flex items-center gap-1.5 px-1 py-2 text-xs font-medium transition-opacity',
                settings.bandBounds ? 'text-accent hover:opacity-70' : 'cursor-default text-ink-2/50',
              )}
            >
              <RotateCcw size={14} />
              {t('settings.bandResetAction')}
            </button>
          </SettingRow>
        </SettingsSection>

        {/* 实时元音落点 */}
        <SettingsSection icon={LocateFixed} title={t('vowelLive.title')}>
          <SettingRow stacked label={t('vowelLive.title')} desc={t('vowelLive.labsDesc')}>
            <button
              onClick={() => setVowelLiveOpen(true)}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              <LocateFixed size={14} />
              {t('vowelLive.openAction')}
            </button>
          </SettingRow>
        </SettingsSection>

        {/* 导入音频离线分析 */}
        <SettingsSection icon={FileAudio} title={t('settings.importAudio')}>
          <SettingRow stacked label={t('settings.importAudio')} desc={t('settings.importAudioDesc')}>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setImportDragOver(true);
              }}
              onDragLeave={() => setImportDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setImportDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) runAudioImport(file);
              }}
              className={cn(
                'flex flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors',
                importDragOver ? 'border-accent bg-accent-soft/40' : 'border-black/10 bg-surface-hi/40',
              )}
            >
              <button
                onClick={() => audioInputRef.current?.click()}
                disabled={importBusy}
                className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {importBusy
                  ? `${t('importAudio.processing')} ${Math.round(importPct * 100)}%`
                  : t('settings.importAudioPick')}
              </button>
              <p className="text-[10px] text-ink-2">{t('settings.importAudioHint')}</p>
            </div>
          </SettingRow>
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,.amr,.3gp,.m4a,.aac"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) runAudioImport(file);
              e.target.value = '';
            }}
          />
        </SettingsSection>

        {/* GitHub 云备份 */}
        <GithubBackupSection settings={settings} update={update} />

        {/* 本地自动备份（File System Access API） */}
        <SettingsSection icon={HardDriveDownload} title={t('settings.autoBackup')}>
          {!autoBackup?.supported ? (
            <SettingRow label={t('settings.autoBackup')} desc={t('settings.autoBackupUnsupported')} />
          ) : (
            <>
              <SettingRow
                label={t('settings.autoBackupFolder')}
                desc={t('settings.autoBackupDesc')}
                stacked
              >
                <button
                  onClick={() => {
                    void pickAutoBackupFolder().then((ok) => {
                      if (ok) refreshAutoBackup();
                    });
                  }}
                  className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
                >
                  <FolderOpen size={14} />
                  {autoBackup.hasHandle ? t('settings.autoBackupRepick') : t('settings.autoBackupPick')}
                </button>
              </SettingRow>
              {autoBackup.hasHandle && (
                <>
                  <SettingRow
                    label={t('settings.autoBackupStatus')}
                    desc={autoBackup.permission === 'granted' ? t('settings.autoBackupOn') : t('settings.autoBackupNeedAuth')}
                  >
                    {autoBackup.permission !== 'granted' ? (
                      <button
                        onClick={() => {
                          void requestAutoBackupPermission().then((ok) => {
                            if (ok) refreshAutoBackup();
                          });
                        }}
                        className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
                      >
                        <ShieldCheck size={14} />
                        {t('settings.autoBackupReauth')}
                      </button>
                    ) : undefined}
                  </SettingRow>
                  <SettingRow
                    label={t('settings.autoBackupNow')}
                    desc={autoBackup.lastTs
                      ? t('settings.autoBackupLast', { time: new Date(autoBackup.lastTs).toLocaleString(localeTag(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })
                      : undefined}
                  >
                    <button
                      onClick={() => {
                        void runAutoBackupNow().then(refreshAutoBackup);
                      }}
                      disabled={autoBackup.permission !== 'granted'}
                      className={cn(
                        'flex items-center gap-1.5 px-1 py-2 text-xs font-medium transition-opacity',
                        autoBackup.permission === 'granted' ? 'text-accent hover:opacity-70' : 'cursor-default text-ink-2/50',
                      )}
                    >
                      <CloudUpload size={14} />
                      {t('common.export')}
                    </button>
                  </SettingRow>
                </>
              )}
            </>
          )}
        </SettingsSection>
      </motion.div>

      {/* 实时元音落点（全屏子页面，从 Labs 或测试页打开） */}
      {vowelLiveOpen && <VowelLiveSheet onClose={() => setVowelLiveOpen(false)} />}
    </div>
  );
}
