/**
 * 导入音频离线分析区块（设置 → 实验性功能）
 * 拖拽或点选外部录音 → analyzeAudioFile 离线分析 → 落库并跳转分析页。
 * 自带进度与拖拽高亮状态；从 LabsPage 拆出，与 RecordingSection 等区块同构。
 */

import { useRef, useState } from 'react';
import { FileAudio } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { analyzeAudioFile, importErrorKey } from '@/lib/audio/importAudio';
import { maybeAutoBackup } from '@/lib/backup/local';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings } from '@/types';
import { cn } from '@/lib/utils';
import { SettingsSection, SettingRow } from './rows';
import { InfoTip } from './InfoTip';

export function ImportAudioSection({ settings }: { settings: AppSettings }) {
  useI18n();
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const setTab = useStore((s) => s.setTab);
  const [importBusy, setImportBusy] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [importDragOver, setImportDragOver] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

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
    <SettingsSection icon={FileAudio} title={t('settings.importAudio')}>
      <SettingRow stacked label={<InfoTip label={t('settings.importAudio')} text={t('settings.importAudioDesc')} />}>
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
  );
}
