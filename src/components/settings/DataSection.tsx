/**
 * 数据管理：存储用量、ZIP 备份/恢复、JSON 导出/导入、示例数据、清空
 * 导出为 IndexedDB 全量，不受界面截断影响
 */

import { useRef, useState } from 'react';
import { DatabaseBackup, Download, Upload, Trash2, Eraser, Archive, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { createDemoRecord } from '@/lib/audio/demo';
import { downloadText, recordsToSummaryCsv } from '@/lib/export/csv';
import { exportFullBackup, importFullBackup, buildRecordsPayload, parseRecordsPayload } from '@/lib/export/backup';
import { downloadBlob } from '@/lib/file';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui';
import { StorageUsage } from './StorageUsage';
import { SettingsSection, SettingRow } from './rows';

export function DataSection() {
  useI18n();
  const records = useHistoryStore((s) => s.records);
  const importRecords = useHistoryStore((s) => s.importRecords);
  const clearAll = useHistoryStore((s) => s.clearAll);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [zipBusy, setZipBusy] = useState(false);

  /** 导出全部记录的统计摘要 CSV（IndexedDB 全量，不受界面截断影响） */
  const exportSummaryCsv = async () => {
    const all = await useHistoryStore.getState().getAllRecords();
    if (all.length === 0) {
      toast.info(t('toast.nothingToExport'));
      return;
    }
    downloadText(
      `voice-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      recordsToSummaryCsv(all),
    );
    toast.success(t('toast.csvExported', { n: all.length }));
  };

  /** 导出全部记录为 JSON（IndexedDB 全量，不受界面截断影响；与 ZIP/GitHub 备份同一 v2 格式） */
  const exportData = async () => {
    const all = await useHistoryStore.getState().getAllRecords();
    if (all.length === 0) {
      toast.info(t('toast.nothingToExport'));
      return;
    }
    const payload = buildRecordsPayload(all);
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    downloadBlob(
      `voice-records-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`,
      blob,
    );
    toast.success(t('toast.jsonExported', { n: all.length }));
  };

  /** 从 JSON 文件导入记录（v1/v2 与裸数组均接受，格式错误带具体原因） */
  const importData = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { records: incoming } = parseRecordsPayload(String(reader.result));
        const added = importRecords(incoming);
        if (added > 0) toast.success(t('toast.imported', { n: added }));
        else toast.info(t('toast.importedNone'));
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : t('toast.importFail'));
      }
    };
    reader.readAsText(file);
  };

  /** 导出完整备份 ZIP（记录 + 音频） */
  const exportZip = async () => {
    if (zipBusy) return;
    setZipBusy(true);
    try {
      const res = await exportFullBackup();
      if (res.records === 0) toast.info(t('toast.nothingToExport'));
      else toast.success(t('toast.zipDone', { records: res.records, audio: res.audio }));
    } catch (err) {
      console.error(err);
      toast.error(t('toast.zipFail'));
    } finally {
      setZipBusy(false);
    }
  };

  /** 从 ZIP 备份恢复 */
  const importZip = (file: File) => {
    void (async () => {
      try {
        const res = await importFullBackup(file);
        if (res.records > 0) toast.success(t('toast.zipRestored', { records: res.records, audio: res.audio }));
        else if (res.audio > 0) toast.info(t('toast.zipRestoredAudioOnly', { audio: res.audio }));
        else toast.info(t('toast.zipSame'));
      } catch (err) {
        console.error(err);
        // 版本过新 / 格式错误等已有本地化文案的具体错误直接展示
        toast.error(err instanceof Error && err.message ? err.message : t('toast.zipFailParse'));
      }
    })();
  };

  return (
    /* 数据管理 */
    <SettingsSection icon={DatabaseBackup} title={t('settings.data')}>
      <StorageUsage />
      <SettingRow label={t('settings.zipBackup')}>
        <button
          onClick={exportZip}
          disabled={zipBusy}
          className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
        >
          <Archive size={14} />
          {zipBusy ? t('settings.zipPacking') : t('common.export')}
        </button>
      </SettingRow>
      <SettingRow label={t('settings.zipRestore')}>
        <button
          onClick={() => zipInputRef.current?.click()}
          className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          <Upload size={14} />
          {t('common.restore')}
        </button>
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importZip(file);
            e.target.value = '';
          }}
        />
      </SettingRow>
      <SettingRow label={t('settings.exportJson')}>
        <button
          onClick={exportData}
          className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          <Download size={14} />
          {t('common.export')}
        </button>
      </SettingRow>
      <SettingRow label={t('settings.exportCsv')}>
        <button
          onClick={exportSummaryCsv}
          className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          <FileSpreadsheet size={14} />
          {t('common.export')}
        </button>
      </SettingRow>
      <SettingRow label={t('settings.importJson')}>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          <Upload size={14} />
          {t('common.import')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importData(file);
            e.target.value = '';
          }}
        />
      </SettingRow>
      <SettingRow label={t('settings.loadDemo')}>
        <button
          onClick={() => {
            const demo = createDemoRecord();
            useHistoryStore.getState().addRecord(demo);
            setCurrentAnalysis(demo);
            toast.success(t('toast.demoLoaded'));
          }}
          className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-ink-2 transition-opacity hover:opacity-70"
        >
          <Eraser size={14} />
          {t('settings.loadDemoAction')}
        </button>
      </SettingRow>
      <SettingRow label={t('settings.clearAll')}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-red-500 transition-opacity hover:opacity-70">
              <Trash2 size={14} />
              {t('settings.clearAllAction')}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-3xl border-0 bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-ink">{t('settings.clearTitle')}</AlertDialogTitle>
              <AlertDialogDescription className="text-ink-2">
                {t('settings.clearDesc', { n: records.length })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-none border-0 bg-transparent text-sm font-medium text-ink-2 shadow-none">{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  clearAll();
                  setCurrentAnalysis(null);
                  toast.success(t('settings.clearDone'));
                }}
                className="rounded-none bg-red-500 text-sm text-white hover:bg-red-500/90"
              >
                {t('settings.clearConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SettingRow>
    </SettingsSection>
  );
}
