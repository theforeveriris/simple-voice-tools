/**
 * 数据管理（设置的子页面，入口为主视图单行卡片）
 * - 存储用量：浏览器配额占用、音频体积与持久化存储状态
 * - 备份与恢复：ZIP 完整备份/恢复、本地自动备份（File System Access API）
 * - 数据操作：记录 JSON/CSV 导出导入、配置导出导入、示例数据、清空
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Download, Upload, Trash2, Eraser, Archive, FileSpreadsheet,
  DatabaseBackup, HardDrive, FolderOpen, ShieldCheck, CloudUpload,
  Cloud, CloudDownload, PlugZap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { createDemoRecord } from '@/lib/audio/demo';
import { downloadText, recordsToSummaryCsv } from '@/lib/export/csv';
import { exportFullBackup, importFullBackup, buildRecordsPayload, parseRecordsPayload } from '@/lib/export/backup';
import { buildSettingsPayload, parseSettingsPayload } from '@/lib/export/settings';
import { downloadBlob } from '@/lib/file';
import {
  pickAutoBackupFolder, getAutoBackupState,
  requestAutoBackupPermission, runAutoBackupNow,
  type AutoBackupState,
} from '@/lib/backup/local';
import {
  getWebdavConfig, saveWebdavConfig, getWebdavLastPush,
  testWebdav, pushWebdavBackup, pullWebdavBackup, type WebdavConfig,
} from '@/lib/backup/webdav';
import {
  isBackupEncryptionEnabled, isBackupEncryptionUnlocked, BackupLockedError,
} from '@/lib/backup/crypto';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { localeTag } from '@/i18n';
import type { AppSettings } from '@/types';
import { cn } from '@/lib/utils';
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
import { InfoTip } from './InfoTip';
import { PrivacyPanel } from './PrivacyPanel';
import { BackupEncryptionSection } from './BackupEncryptionSection';
import { BackupPassphraseDialog } from './BackupPassphraseDialog';

export function DataPage({
  settings,
  update,
  onBack,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  /** 返回设置主视图（dataOpen 由父组件持有，不持久化） */
  onBack: () => void;
}) {
  useI18n();
  const records = useHistoryStore((s) => s.records);
  const importRecords = useHistoryStore((s) => s.importRecords);
  const clearAll = useHistoryStore((s) => s.clearAll);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const recordsInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const settingsInputRef = useRef<HTMLInputElement>(null);
  const [zipBusy, setZipBusy] = useState(false);
  // 本地自动备份（File System Access API）
  const [autoBackup, setAutoBackup] = useState<AutoBackupState | null>(null);
  // WebDAV 同步：凭据存 IndexedDB kv，输入完成后在测试/上传/恢复时一并保存
  const [webdav, setWebdav] = useState<WebdavConfig>({ url: '', username: '', password: '' });
  const [webdavLoaded, setWebdavLoaded] = useState(false);
  const [webdavBusy, setWebdavBusy] = useState<'test' | 'push' | 'pull' | null>(null);
  const [webdavLast, setWebdavLast] = useState<number | null>(null);
  // 云备份加密：会话未解锁时先弹口令框，成功后继续被挂起的推/拉动作
  const [passOpen, setPassOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  /** 云备份操作前置：加密开启且未解锁 → 弹口令框；解锁成功后执行挂起动作 */
  const ensureUnlockedThen = (action: () => void) => {
    void (async () => {
      if ((await isBackupEncryptionEnabled()) && !isBackupEncryptionUnlocked()) {
        pendingActionRef.current = action;
        setPassOpen(true);
        return;
      }
      action();
    })();
  };

  const onPassUnlocked = () => {
    const p = pendingActionRef.current;
    pendingActionRef.current = null;
    setPassOpen(false);
    p?.();
  };

  useEffect(() => {
    void (async () => {
      try {
        const [cfg, last] = await Promise.all([getWebdavConfig(), getWebdavLastPush()]);
        if (cfg) setWebdav(cfg);
        setWebdavLast(last);
      } finally {
        setWebdavLoaded(true);
      }
    })();
  }, []);

  /** 保存当前输入并执行 WebDAV 操作（错误带本地化文案时直接展示） */
  const runWebdav = (kind: 'test' | 'push' | 'pull') => {
    if (webdavBusy) return;
    if (!webdav.url.trim()) {
      toast.error(t('webdav.errConfig'));
      return;
    }
    setWebdavBusy(kind);
    void (async () => {
      const cfg = { ...webdav, url: webdav.url.trim() };
      try {
        if (kind === 'test') {
          await testWebdav(cfg);
          toast.success(t('toast.webdavTestOk'));
        } else if (kind === 'push') {
          const res = await pushWebdavBackup(cfg);
          setWebdavLast(Date.now());
          toast.success(t('toast.webdavPushDone', { records: res.records, audio: res.audio }));
        } else {
          const res = await pullWebdavBackup(cfg);
          if (res.records > 0 || res.audio > 0) {
            toast.success(t('toast.webdavPullDone', { records: res.records, audio: res.audio }));
          } else {
            toast.info(t('toast.webdavPullSame'));
          }
        }
        await saveWebdavConfig(cfg);
      } catch (err) {
        // 推/拉中撞上未解锁的加密包：弹口令框，解锁后重试原操作（恢复按 id 去重，可安全重跑）
        if (err instanceof BackupLockedError) {
          pendingActionRef.current = () => runWebdav(kind);
          setPassOpen(true);
          return;
        }
        toast.error(err instanceof Error && err.message ? err.message : t('toast.webdavFail'));
      } finally {
        setWebdavBusy(null);
      }
    })();
  };

  const refreshAutoBackup = useCallback(() => {
    void getAutoBackupState().then(setAutoBackup);
  }, []);

  useEffect(() => {
    refreshAutoBackup();
  }, [refreshAutoBackup]);

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

  /** 导出当前设置（配置）为 JSON */
  const exportSettings = () => {
    const payload = buildSettingsPayload(settings);
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    downloadBlob(
      `voice-settings-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`,
      new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    );
    toast.success(t('toast.settingsExported'));
  };

  /** 从 JSON 文件导入设置（白名单 + 类型校验，未知字段忽略） */
  const importSettings = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const patch = parseSettingsPayload(String(reader.result));
        update(patch);
        toast.success(t('toast.settingsImported'));
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : t('toast.settingsImportFail'));
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
          <p className="text-base font-semibold text-ink">{t('settings.data')}</p>
        </div>

        {/* 数据去向（隐私边界 + AI 请求日志） */}
        <PrivacyPanel />

        {/* 存储用量 */}
        <SettingsSection icon={HardDrive} title={t('settings.storageUsage')}>
          <StorageUsage />
        </SettingsSection>

        {/* 备份与恢复 */}
        <SettingsSection icon={Archive} title={t('settings.backupRestore')}>
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

          {/* 本地自动备份（File System Access API，自实验性功能移入） */}
          {!autoBackup?.supported ? (
            <SettingRow label={t('settings.autoBackup')} desc={t('settings.autoBackupUnsupported')} />
          ) : (
            <>
              <SettingRow
                label={
                  /* 说明收在浮窗里：点「备份文件夹」右侧的信息图标显示 */
                  <InfoTip label={t('settings.autoBackupFolder')} text={t('settings.autoBackupDesc')} />
                }
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

        {/* 云备份加密（GitHub / WebDAV 上传内容 AES-GCM 加密） */}
        <BackupEncryptionSection />

        {/* WebDAV 同步（自托管网盘 / NAS） */}
        <SettingsSection icon={Cloud} title={t('settings.webdav')}>
          <SettingRow
            label={<InfoTip label={t('settings.webdavUrl')} text={t('settings.webdavHint')} />}
            stacked
          >
            <input
              value={webdav.url}
              onChange={(e) => setWebdav((c) => ({ ...c, url: e.target.value }))}
              placeholder="https://dav.jianguoyun.com/dav/"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-xl border border-black/10 bg-surface-hi px-3 py-2 font-mono text-xs text-ink outline-none placeholder:text-ink-2/50 focus:border-accent"
            />
          </SettingRow>
          <SettingRow label={t('settings.webdavUser')}>
            <input
              value={webdav.username}
              onChange={(e) => setWebdav((c) => ({ ...c, username: e.target.value }))}
              autoComplete="off"
              className="w-44 rounded-xl border border-black/10 bg-surface-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </SettingRow>
          <SettingRow label={t('settings.webdavPass')}>
            <input
              type="password"
              value={webdav.password}
              onChange={(e) => setWebdav((c) => ({ ...c, password: e.target.value }))}
              autoComplete="new-password"
              className="w-44 rounded-xl border border-black/10 bg-surface-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </SettingRow>
          <SettingRow
            label={t('settings.webdavTest')}
            desc={webdavLast
              ? t('settings.webdavLast', { time: new Date(webdavLast).toLocaleString(localeTag(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })
              : undefined}
          >
            <button
              onClick={() => runWebdav('test')}
              disabled={webdavBusy != null || !webdavLoaded}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
            >
              <PlugZap size={14} />
              {webdavBusy === 'test' ? t('settings.webdavTesting') : t('settings.webdavTest')}
            </button>
          </SettingRow>
          <SettingRow label={t('settings.webdavPush')}>
            <button
              onClick={() => ensureUnlockedThen(() => runWebdav('push'))}
              disabled={webdavBusy != null || !webdavLoaded}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
            >
              <CloudUpload size={14} />
              {webdavBusy === 'push' ? t('settings.webdavPushing') : t('settings.webdavPush')}
            </button>
          </SettingRow>
          <SettingRow label={t('settings.webdavPull')}>
            <button
              onClick={() => ensureUnlockedThen(() => runWebdav('pull'))}
              disabled={webdavBusy != null || !webdavLoaded}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
            >
              <CloudDownload size={14} />
              {webdavBusy === 'pull' ? t('settings.webdavRestoring') : t('settings.webdavPull')}
            </button>
          </SettingRow>
        </SettingsSection>

        {/* 数据操作 */}
        <SettingsSection icon={DatabaseBackup} title={t('settings.dataOps')}>
          <SettingRow label={t('settings.exportJson')}>
            <button
              onClick={exportData}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              <Download size={14} />
              {t('common.export')}
            </button>
          </SettingRow>
          <SettingRow label={t('settings.importJson')}>
            <button
              onClick={() => recordsInputRef.current?.click()}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              <Upload size={14} />
              {t('common.import')}
            </button>
            <input
              ref={recordsInputRef}
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
          <SettingRow label={t('settings.exportCsv')}>
            <button
              onClick={exportSummaryCsv}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              <FileSpreadsheet size={14} />
              {t('common.export')}
            </button>
          </SettingRow>
          <SettingRow label={t('settings.exportSettings')}>
            <button
              onClick={exportSettings}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              <Download size={14} />
              {t('common.export')}
            </button>
          </SettingRow>
          <SettingRow label={t('settings.importSettings')}>
            <button
              onClick={() => settingsInputRef.current?.click()}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              <Upload size={14} />
              {t('common.import')}
            </button>
            <input
              ref={settingsInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importSettings(file);
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

        {/* 云备份加密口令对话框（推/拉撞上锁定态时弹出） */}
        <BackupPassphraseDialog
          mode="unlock"
          open={passOpen}
          onOpenChange={(v) => {
            setPassOpen(v);
            if (!v) pendingActionRef.current = null;
          }}
          onDone={onPassUnlocked}
        />
      </motion.div>
    </div>
  );
}
