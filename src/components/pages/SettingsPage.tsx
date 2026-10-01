/**
 * 设置页面
 * - 外观：主题（深浅）、语言、莫奈取色主题色（预设 + 自定义色相）、网格辅助线
 * - 录音：麦克风设备、最长录音时长、结束后自动进入分析
 * - 训练：训练靶标（目标音高区间 + 达成率）、基线记录
 * - 数据管理：历史记录导出 / 导入 / 清空（导出为 IndexedDB 全量）
 * - 实验性功能：设置的子页面（无描述行），内含 GitHub 云备份（Device Flow）
 * - 关于
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ElementType, ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Palette, Mic, DatabaseBackup, Info, Download, Upload, Trash2, Eraser, Sparkles,
  BookOpen, ChevronRight, Smartphone, FileSpreadsheet, Archive, Cloud,
  Link2, Unlink, CloudUpload, CloudDownload, FlaskConical, Target, ArrowLeft,
  SlidersHorizontal, HardDriveDownload, FolderOpen, ShieldCheck,
  Ruler, FileAudio, LocateFixed, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { applyTheme } from '@/lib/theme/monet';
import { createDemoRecord } from '@/lib/audio/demo';
import { DEFAULT_BAND_BOUNDS } from '@/constants';
import { analyzeAudioFile, importErrorKey } from '@/lib/audio/importAudio';
import { downloadText, recordsToSummaryCsv } from '@/lib/export/csv';
import { exportFullBackup, importFullBackup } from '@/lib/export/backup';
import {
  pickAutoBackupFolder, getAutoBackupState,
  requestAutoBackupPermission, runAutoBackupNow, maybeAutoBackup,
  type AutoBackupState,
} from '@/lib/backup/local';
import { idbGetAllAudio } from '@/lib/storage/idb';
import {
  requestDeviceCode, waitForToken, completeConnection, disconnectGithub,
  getStoredLogin, getLastPush, pushBackup, pullBackup, DEFAULT_REPO,
  type DeviceCodeInfo,
} from '@/lib/backup/github';
import { usePwaInstall, promptInstall } from '@/lib/pwa';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { LOCALES, localeTag } from '@/i18n';
import type { AppSettings, Locale, ThemeMode } from '@/types';
import { VowelLiveSheet } from './VowelLiveSheet';
import { cn } from '@/lib/utils';

const DOC_BASE_URL = 'https://github.com/theforeveriris/simple-voice-tools/blob/main/documentation';
const DOC_ENTRIES: { titleKey: 'settings.docYinTitle' | 'settings.docLpcTitle' | 'settings.docEnergyTitle' | 'settings.docCppsTitle' | 'settings.docDevTitle'; descKey: 'settings.docYinDesc' | 'settings.docLpcDesc' | 'settings.docEnergyDesc' | 'settings.docCppsDesc' | 'settings.docDevDesc'; file: string }[] = [
  { titleKey: 'settings.docYinTitle', descKey: 'settings.docYinDesc', file: 'ALGORITHM-YIN.md' },
  { titleKey: 'settings.docLpcTitle', descKey: 'settings.docLpcDesc', file: 'ALGORITHM-FORMANT-LPC.md' },
  { titleKey: 'settings.docEnergyTitle', descKey: 'settings.docEnergyDesc', file: 'ALGORITHM-ENERGY.md' },
  { titleKey: 'settings.docCppsTitle', descKey: 'settings.docCppsDesc', file: 'ALGORITHM-CPPS.md' },
  { titleKey: 'settings.docDevTitle', descKey: 'settings.docDevDesc', file: 'DEVELOPMENT.md' },
];
import {
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';

function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: ElementType;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[22px] bg-card p-5 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon size={15} className="text-accent" />
        {title}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  desc,
  children,
  stacked,
}: {
  label: string;
  desc?: string;
  children?: ReactNode;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="py-2">
        <p className="text-sm font-medium text-ink">{label}</p>
        {desc && <p className="mt-0.5 text-[11px] text-ink-2">{desc}</p>}
        <div className="mt-2">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-black/[0.04] py-2 first:border-t-0">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {desc && <p className="mt-0.5 text-[11px] text-ink-2">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function fmtBytes(n: number): string {
  if (!isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[u]}`;
}

/** 存储用量卡片：浏览器配额占用、音频体积与持久化存储状态 */
function StorageUsage() {
  const [info, setInfo] = useState<{ usage: number; quota: number; audioBytes: number; audioCount: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  const refresh = () => {
    void (async () => {
      let usage = 0;
      let quota = 0;
      try {
        const est = await navigator.storage?.estimate?.();
        usage = est?.usage ?? 0;
        quota = est?.quota ?? 0;
      } catch {
        /* ignore */
      }
      let audioBytes = 0;
      let audioCount = 0;
      try {
        const all = await idbGetAllAudio<{ blob: Blob }>();
        for (const e of all) {
          audioBytes += e.blob.size;
          audioCount++;
        }
      } catch {
        /* ignore */
      }
      setInfo({ usage, quota, audioBytes, audioCount });
      try {
        setPersisted((await navigator.storage?.persisted?.()) ?? null);
      } catch {
        setPersisted(null);
      }
    })();
  };

  useEffect(refresh, []);

  const requestPersist = async () => {
    try {
      const granted = (await navigator.storage?.persist?.()) ?? false;
      if (granted) toast.success(t('toast.persistGranted'));
      else toast.info(t('toast.persistDenied'));
    } catch {
      toast.error(t('toast.persistFail'));
    }
    refresh();
  };

  return (
    <div className="py-2.5">
      <p className="text-sm font-medium text-ink">{t('settings.storageUsage')}</p>
      {!info ? (
        <p className="mt-2 text-xs text-ink-2">{t('settings.storageCounting')}</p>
      ) : (
        <div className="mt-2.5 rounded-2xl bg-surface-hi/60 px-3.5 py-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-ink-2">{t('settings.storageTotal')}</span>
            <span className="font-semibold tabular-nums text-ink">
              {fmtBytes(info.usage)}
              {info.quota > 0 && <span className="font-normal text-ink-2"> {t('settings.storageQuota', { quota: fmtBytes(info.quota) })}</span>}
            </span>
          </div>
          {info.quota > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.min(100, (info.usage / info.quota) * 100)}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-[11px] text-ink-2">
            {t('settings.storageAudio', { count: info.audioCount, size: fmtBytes(info.audioBytes) })}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-[11px] leading-snug text-ink-2">
              {t('settings.storagePersisted')}
              {persisted == null ? t('settings.persistedUnknown') : persisted ? t('settings.persistedOn') : t('settings.persistedOff')}
            </span>
            {persisted === false && (
              <button
                onClick={requestPersist}
                className="shrink-0 text-xs font-medium text-accent transition-opacity hover:opacity-70"
              >
                {t('settings.requestPersist')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** GitHub 连接对话框：设备码 → 用户授权 → 轮询令牌（Device Flow 全程在前端完成） */
function ConnectGithubDialog({
  clientId,
  open,
  onOpenChange,
  onConnected,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConnected: (login: string) => void;
}) {
  const [code, setCode] = useState<DeviceCodeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);
  // 回调经由 ref 使用，避免父组件每次渲染生成新引用导致流程重启
  // （渲染期写入 ref 是刻意的，与 SeriesChart.propsRef 同一模式）
  const cbRef = useRef({ onConnected, onOpenChange });
  // eslint-disable-next-line react-hooks/refs
  cbRef.current = { onConnected, onOpenChange };

  useEffect(() => {
    if (!open) {
      cancelRef.current = true;
      return;
    }
    cancelRef.current = false;
    setError(null);
    setCode(null);
    setDone(false);
    if (!clientId) {
      setError(t('settings.ghClientIdMissing'));
      return;
    }
    void (async () => {
      try {
        const info = await requestDeviceCode(clientId);
        if (cancelRef.current) return;
        setCode(info);
        const token = await waitForToken(clientId, info, () => cancelRef.current);
        if (cancelRef.current) return;
        const login = await completeConnection(token);
        if (cancelRef.current) return;
        setDone(true);
        cbRef.current.onConnected(login);
        setTimeout(() => {
          if (!cancelRef.current) cbRef.current.onOpenChange(false);
        }, 800);
      } catch (err) {
        if (!cancelRef.current) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelRef.current = true;
    };
  }, [open, clientId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-0 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink">{t('settings.ghDialogTitle')}</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="rounded-xl bg-red-500/10 px-3.5 py-3 text-xs leading-relaxed text-red-500">{error}</p>
        ) : done ? (
          <p className="py-6 text-center text-sm font-medium text-ink">{t('settings.ghDeviceDone')}</p>
        ) : code ? (
          <div className="flex flex-col items-center gap-3.5 py-1">
            <p className="text-xs text-ink-2">{t('settings.ghDeviceStep')}</p>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(code.userCode).then(() => toast.success(t('toast.copied')));
              }}
              className="rounded-2xl bg-surface-hi px-6 py-3 font-mono text-3xl font-bold tracking-[0.28em] text-ink transition-transform active:scale-95"
              title={t('settings.ghDeviceCopyTitle')}
            >
              {code.userCode}
            </button>
            <a
              href={code.verifyUri}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
            >
              {t('settings.ghDeviceOpen')}
            </a>
            <p className="flex items-center gap-1.5 text-[11px] text-ink-2">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              {t('settings.ghDeviceWaiting')}
            </p>
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-ink-2">{t('settings.ghDeviceRequesting')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPage() {
  useI18n();
  const install = usePwaInstall();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const records = useHistoryStore((s) => s.records);
  const importRecords = useHistoryStore((s) => s.importRecords);
  const clearAll = useHistoryStore((s) => s.clearAll);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const setTab = useStore((s) => s.setTab);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [zipBusy, setZipBusy] = useState(false);
  const [labsOpen, setLabsOpen] = useState(false);
  // 实时元音落点（Labs 子页面入口）
  const [vowelLiveOpen, setVowelLiveOpen] = useState(false);
  // 导入音频离线分析
  const [importBusy, setImportBusy] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [importDragOver, setImportDragOver] = useState(false);
  // GitHub 云备份
  const [ghLogin, setGhLogin] = useState<string | null>(null);
  const [ghChecking, setGhChecking] = useState(true);
  const [ghBusy, setGhBusy] = useState<'push' | 'pull' | null>(null);
  const [ghProgress, setGhProgress] = useState('');
  const [ghLastPush, setGhLastPush] = useState<number | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  // 本地自动备份（实验性）
  const [autoBackup, setAutoBackup] = useState<AutoBackupState | null>(null);

  const refreshAutoBackup = useCallback(() => {
    void getAutoBackupState().then(setAutoBackup);
  }, []);

  useEffect(() => {
    refreshAutoBackup();
  }, [refreshAutoBackup]);

  // 枚举麦克风设备（授权过一次后才能拿到名称）
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
      setMics(devices.filter((d) => d.kind === 'audioinput'));
    }).catch(() => undefined);
  }, []);

  const setHue = (hue: number) => {
    updateSettings({ hue });
    const dark = settings.theme === 'dark'
      || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(hue, dark);
  };

  const update = (patch: Partial<AppSettings>) => updateSettings(patch);

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

  /** 导出全部记录为 JSON（IndexedDB 全量，不受界面截断影响） */
  const exportData = async () => {
    const all = await useHistoryStore.getState().getAllRecords();
    if (all.length === 0) {
      toast.info(t('toast.nothingToExport'));
      return;
    }
    const payload = {
      app: 'simple-voice-tools',
      version: 1,
      exportedAt: new Date().toISOString(),
      records: all,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    a.href = url;
    a.download = `voice-records-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('toast.jsonExported', { n: all.length }));
  };

  /** 从 JSON 文件导入记录 */
  const importData = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as {
          records?: unknown;
        };
        const incoming = Array.isArray(parsed) ? parsed : parsed.records;
        if (!Array.isArray(incoming)) throw new Error('bad format');
        const added = importRecords(incoming as never);
        if (added > 0) toast.success(t('toast.imported', { n: added }));
        else toast.info(t('toast.importedNone'));
      } catch {
        toast.error(t('toast.importFail'));
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
        toast.error(t('toast.zipFailParse'));
      }
    })();
  };

  /* ------------------------------ GitHub 云备份 ------------------------------ */

  const clientId = settings.githubClientId?.trim() ?? '';
  const repoName = settings.githubRepo?.trim() || DEFAULT_REPO;

  useEffect(() => {
    void (async () => {
      try {
        setGhLogin(await getStoredLogin());
        setGhLastPush(await getLastPush());
      } catch {
        /* IndexedDB 不可用：保持未连接 */
      }
      setGhChecking(false);
    })();
  }, []);

  const onGhConnected = useCallback((login: string) => {
    setGhLogin(login);
    toast.success(t('toast.ghConnected', { login }));
  }, []);

  const onGhDisconnect = () => {
    void disconnectGithub().then(() => {
      setGhLogin(null);
      setGhLastPush(null);
      toast.success(t('toast.ghDisconnected'));
    });
  };

  const onGhPush = () => {
    if (ghBusy || !ghLogin) return;
    setGhBusy('push');
    setGhProgress('…');
    pushBackup(clientId, repoName, (done, total, phase) => {
      setGhProgress(total > 1 ? `${phase} ${done}/${total}` : `${phase}…`);
    })
      .then((res) => {
        toast.success(t('toast.ghPushDone', { records: res.records, pushed: res.pushed, skipped: res.skipped }));
        setGhLastPush(Date.now());
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : t('toast.zipFail'));
      })
      .finally(() => {
        setGhBusy(null);
        setGhProgress('');
      });
  };

  const onGhPull = () => {
    if (ghBusy || !ghLogin) return;
    setGhBusy('pull');
    setGhProgress('…');
    pullBackup(clientId, repoName, (done, total, phase) => {
      setGhProgress(total > 1 ? `${phase} ${done}/${total}` : `${phase}…`);
    })
      .then((res) => {
        if (res.records > 0 || res.audio > 0) {
          toast.success(t('toast.ghPullDone', { records: res.records, audio: res.audio }));
        } else {
          toast.info(t('toast.ghPullSame'));
        }
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : t('toast.zipFail'));
      })
      .finally(() => {
        setGhBusy(null);
        setGhProgress('');
      });
  };

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

  /* ------------------------------ 实验性功能（设置的子页面） ------------------------------ */

  // 入口在主视图收起为单行卡片（无描述行）；labsOpen 不持久化，切换页签即回主视图
  if (labsOpen) {
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
              onClick={() => setLabsOpen(false)}
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
          <SettingsSection icon={Cloud} title={t('settings.ghTitle')}>
            <SettingRow stacked label={t('settings.ghClientId')}>
              <input
                value={settings.githubClientId ?? ''}
                onChange={(e) => update({ githubClientId: e.target.value.trim() })}
                placeholder={t('settings.ghClientIdPlaceholder')}
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-xl border border-black/10 bg-surface-hi px-3 py-2 font-mono text-xs text-ink outline-none placeholder:text-ink-2/50 focus:border-accent"
              />
            </SettingRow>
            <SettingRow label={t('settings.ghRepo')}>
              <input
                value={settings.githubRepo ?? ''}
                onChange={(e) => update({ githubRepo: e.target.value.trim() })}
                placeholder={DEFAULT_REPO}
                spellCheck={false}
                autoComplete="off"
                className="w-40 rounded-xl border border-black/10 bg-surface-hi px-3 py-2 font-mono text-xs text-ink outline-none placeholder:text-ink-2/50 focus:border-accent"
              />
            </SettingRow>
            <SettingRow
              label={t('settings.ghStatus')}
              desc={ghChecking ? t('settings.ghChecking') : ghLogin ? t('settings.ghConnected', { login: ghLogin }) : t('settings.ghNotConnected')}
            >
              {ghChecking ? undefined : ghLogin ? (
                <button
                  onClick={onGhDisconnect}
                  className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-ink-2 transition-opacity hover:opacity-70"
                >
                  <Unlink size={14} />
                  {t('common.disconnect')}
                </button>
              ) : (
                <button
                  onClick={() => setConnectOpen(true)}
                  disabled={!clientId}
                  className={cn(
                    'flex items-center gap-1.5 px-1 py-2 text-xs font-medium transition-opacity',
                    clientId ? 'text-accent hover:opacity-70' : 'cursor-default text-ink-2/50',
                  )}
                >
                  <Link2 size={14} />
                  {t('common.connect')}
                </button>
              )}
            </SettingRow>
            <SettingRow
              label={t('settings.ghPush')}
              desc={
                ghBusy === 'push'
                  ? ghProgress || '…'
                  : ghLastPush
                    ? t('settings.ghLastPush', { time: new Date(ghLastPush).toLocaleString(localeTag(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })
                    : undefined
              }
            >
              <button
                onClick={onGhPush}
                disabled={!ghLogin || ghBusy != null}
                className={cn(
                  'flex items-center gap-1.5 px-1 py-2 text-xs font-medium transition-opacity',
                  ghLogin && ghBusy == null ? 'text-accent hover:opacity-70' : 'cursor-default text-ink-2/50',
                )}
              >
                <CloudUpload size={14} />
                {ghBusy === 'push' ? t('settings.ghPushing') : t('settings.ghPushNow')}
              </button>
            </SettingRow>
            <SettingRow
              label={t('settings.ghPull')}
              desc={ghBusy === 'pull' ? ghProgress || '…' : undefined}
            >
              <button
                onClick={onGhPull}
                disabled={!ghLogin || ghBusy != null}
                className={cn(
                  'flex items-center gap-1.5 px-1 py-2 text-xs font-medium transition-opacity',
                  ghLogin && ghBusy == null ? 'text-accent hover:opacity-70' : 'cursor-default text-ink-2/50',
                )}
              >
                <CloudDownload size={14} />
                {ghBusy === 'pull' ? t('settings.ghRestoring') : t('common.restore')}
              </button>
            </SettingRow>
          </SettingsSection>

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

        <ConnectGithubDialog
          clientId={clientId}
          open={connectOpen}
          onOpenChange={setConnectOpen}
          onConnected={onGhConnected}
        />

        {/* 实时元音落点（全屏子页面，从 Labs 或测试页打开） */}
        {vowelLiveOpen && <VowelLiveSheet onClose={() => setVowelLiveOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      {/* 外观 */}
      <SettingsSection icon={Palette} title={t('settings.appearance')}>
        <SettingRow label={t('settings.theme')}>
          <Select
            value={settings.theme}
            onValueChange={(v) => update({ theme: v as ThemeMode })}
          >
            <SelectTrigger className="w-32 border-0 bg-transparent px-0 text-sm shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
              <SelectItem value="system">{t('settings.themeSystem')}</SelectItem>
              <SelectItem value="light">{t('settings.themeLight')}</SelectItem>
              <SelectItem value="dark">{t('settings.themeDark')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label={t('settings.language')}>
          <Select
            value={settings.language}
            onValueChange={(v) => update({ language: v as Locale })}
          >
            <SelectTrigger className="w-52 border-0 bg-transparent px-0 text-sm shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
              {LOCALES.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.label}
                  {l.machine && <span className="ml-1.5 text-[10px] text-ink-2">{t('settings.languageMachine')}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow stacked label={t('settings.hue')}>
          <div className="flex items-center gap-3">
            <Sparkles size={14} className="shrink-0 text-ink-2" />
            <input
              type="range"
              min={0}
              max={360}
              value={settings.hue}
              onChange={(e) => setHue(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-red-400 via-emerald-400 to-violet-500 accent-accent"
              aria-label={t('settings.hue')}
            />
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-2">{settings.hue}°</span>
          </div>
        </SettingRow>
        <SettingRow label={t('settings.showGrid')}>
          <Switch
            checked={settings.showGrid}
            onCheckedChange={(v) => update({ showGrid: v })}
          />
        </SettingRow>
        <SettingRow label={t('settings.syncRange')}>
          <Switch
            checked={settings.syncChartRange}
            onCheckedChange={(v) => update({ syncChartRange: v })}
          />
        </SettingRow>
      </SettingsSection>

      {/* 录音 */}
      <SettingsSection icon={Mic} title={t('settings.recording')}>
        <SettingRow label={t('settings.autoEnter')}>
          <Switch
            checked={settings.autoEnterAnalysis}
            onCheckedChange={(v) => update({ autoEnterAnalysis: v })}
          />
        </SettingRow>
        <SettingRow label={t('settings.audioSave')}>
          <Switch
            checked={settings.audioSave}
            onCheckedChange={(v) => update({ audioSave: v })}
          />
        </SettingRow>
        <SettingRow label={t('settings.maxDuration')}>
          <Select
            value={String(settings.maxDurationSec)}
            onValueChange={(v) => update({ maxDurationSec: Number(v) })}
          >
            <SelectTrigger className="w-28 border-0 bg-transparent px-0 text-sm shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
              <SelectItem value="30">{t('settings.dur30')}</SelectItem>
              <SelectItem value="60">{t('settings.dur60')}</SelectItem>
              <SelectItem value="120">{t('settings.dur120')}</SelectItem>
              <SelectItem value="300">{t('settings.dur300')}</SelectItem>
              <SelectItem value="0">{t('settings.durUnlimited')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label={t('settings.mic')}>
          <Select
            value={settings.micDeviceId || 'default'}
            onValueChange={(v) => update({ micDeviceId: v === 'default' ? '' : v })}
          >
            <SelectTrigger className="w-52 max-w-full overflow-hidden border-0 bg-transparent px-0 text-sm shadow-none [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:truncate">
              <SelectValue placeholder={t('settings.micDefault')} />
            </SelectTrigger>
            <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
              <SelectItem value="default">{t('settings.micDefault')}</SelectItem>
              {mics.map((mic, i) => (
                <SelectItem key={mic.deviceId} value={mic.deviceId}>
                  <span className="max-w-52 truncate">{mic.label || `${t('settings.mic')} ${i + 1}`}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingsSection>

      {/* 训练 */}
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

      {/* 数据管理 */}
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

      {/* 应用（PWA） */}
      <SettingsSection icon={Smartphone} title={t('settings.app')}>
        <SettingRow label={t('settings.install')}>
          <button
            type="button"
            onClick={async () => {
              if (install.canInstall) {
                const outcome = await promptInstall();
                if (outcome === 'dismissed') toast.info(t('toast.installDismissed'));
                else if (outcome === 'unavailable') toast.info(t('toast.installUnavailable'));
              } else {
                toast.info(t('settings.installManualHint'));
              }
            }}
            disabled={install.standalone}
            className={cn(
              'flex items-center gap-1.5 px-1 py-2 text-xs font-medium transition-opacity',
              install.standalone ? 'cursor-default text-ink-2/60' : 'text-accent hover:opacity-70',
            )}
          >
            <Download size={14} />
            {install.standalone ? t('settings.installDone') : install.canInstall ? t('settings.installOneClick') : t('settings.installManual')}
          </button>
        </SettingRow>
      </SettingsSection>

      {/* 关于 */}
      <SettingsSection icon={Info} title={t('settings.about')}>
        <div className="pt-1 text-xs leading-relaxed text-ink-2">
          <p className="text-sm font-semibold text-ink">Simple Voice Tool</p>
          <p className="mt-1">{t('settings.aboutVersion')}</p>
          <p className="mt-1">{t('settings.aboutPrivacy')}</p>
        </div>

        {/* 文档：点击跳转到 GitHub 仓库内对应源文件 */}
        <div className="mt-2 flex flex-col text-left">
          <p className="pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-2">{t('settings.docs')}</p>
          {DOC_ENTRIES.map((doc) => (
            <a
              key={doc.titleKey}
              href={`${DOC_BASE_URL}/${doc.file}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 border-t border-black/[0.04] py-3 text-sm font-medium text-ink transition-colors first:border-t-0 hover:text-accent"
            >
              <span className="flex min-w-0 items-center gap-2 text-left">
                <BookOpen size={14} className="shrink-0 text-accent" />
                <span className="truncate">
                  {t(doc.titleKey)}
                  <span className="ml-2 text-[11px] font-normal text-ink-2">{t(doc.descKey)}</span>
                </span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-ink-2" />
            </a>
          ))}
        </div>
      </SettingsSection>

      <ConnectGithubDialog
        clientId={clientId}
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={onGhConnected}
      />
    </div>
  );
}
