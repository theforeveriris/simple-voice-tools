/**
 * 设置页面
 * - 外观：莫奈取色主题色（预设 + 自定义色相）、图表网格辅助线
 * - 录音：麦克风设备、最长录音时长、结束后自动进入分析
 * - 数据管理：历史记录导出 / 导入 / 清空
 * - 关于
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ElementType, ReactNode } from 'react';
import {
  Palette, Mic, DatabaseBackup, Info, Download, Upload, Trash2, Eraser, Sparkles,
  BookOpen, ChevronRight, Smartphone, FileSpreadsheet, Archive, Cloud,
  Link2, Unlink, CloudUpload, CloudDownload,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { applyTheme } from '@/lib/theme/monet';
import { createDemoRecord } from '@/lib/audio/demo';
import { downloadText, recordsToSummaryCsv } from '@/lib/export/csv';
import { exportFullBackup, importFullBackup } from '@/lib/export/backup';
import { idbGetAllAudio } from '@/lib/storage/idb';
import {
  requestDeviceCode, waitForToken, completeConnection, disconnectGithub,
  getStoredLogin, getLastPush, pushBackup, pullBackup, DEFAULT_REPO,
  type DeviceCodeInfo,
} from '@/lib/backup/github';
import { usePwaInstall, promptInstall } from '@/lib/pwa';
import { THEME_PRESETS } from '@/constants';
import { DocViewer } from '@/components/layout/DocViewer';
import yinDoc from '../../../documentation/ALGORITHM-YIN.md?raw';
import lpcDoc from '../../../documentation/ALGORITHM-FORMANT-LPC.md?raw';
import energyDoc from '../../../documentation/ALGORITHM-ENERGY.md?raw';
import cppsDoc from '../../../documentation/ALGORITHM-CPPS.md?raw';
import devDoc from '../../../documentation/DEVELOPMENT.md?raw';
import type { AppSettings } from '@/types';
import { cn } from '@/lib/utils';

/** 应用内可阅读的文档（Markdown 源文件位于 documentation/） */
const DOC_ENTRIES: { title: string; desc: string; md: string }[] = [
  { title: '算法 · 音高检测（YIN）', desc: '差分函数 · CMND · 抛物线插值', md: yinDoc },
  { title: '算法 · 共振峰提取（LPC）', desc: '预加重 · 抽取 · 求根全链路', md: lpcDoc },
  { title: '算法 · 能量分析（RMS）', desc: '分贝换算 · VAD 门限体系', md: energyDoc },
  { title: '算法 · 倒谱峰突出度（CPPS）', desc: '实倒谱 · 回归线基线 · 时间平滑', md: cppsDoc },
  { title: '开发者文档', desc: '架构 · 数据流 · 主题与动效模型', md: devDoc },
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
      <div className="flex flex-col gap-1">{children}</div>
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
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-black/[0.04] py-2.5 first:border-t-0">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {desc && <p className="mt-0.5 text-[11px] text-ink-2">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

/** 主题色圆点（shrink-0 防止在滚动行内被压成椭圆） */
function Swatch({ hue, active, onClick }: { hue: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="size-9 shrink-0 rounded-full transition-transform hover:scale-110 active:scale-95"
      style={{
        background: `oklch(0.58 0.15 ${hue})`,
        boxShadow: active
          ? '0 0 0 2px var(--c-card), 0 0 0 4px rgb(var(--c-ink-rgb) / 0.35)'
          : '0 1px 4px rgba(0,0,0,0.18)',
      }}
      aria-label={`主题色 ${hue}`}
    />
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
      if (granted) toast.success('已获得持久化存储，浏览器不会自动清理本地数据');
      else toast.info('浏览器暂未授予持久化存储，可尝试将应用安装到桌面/主屏幕后重试');
    } catch {
      toast.error('申请失败');
    }
    refresh();
  };

  return (
    <div className="py-2.5">
      <p className="text-sm font-medium text-ink">存储用量</p>
      {!info ? (
        <p className="mt-2 text-xs text-ink-2">统计中…</p>
      ) : (
        <div className="mt-2.5 rounded-2xl bg-surface-hi/60 px-3.5 py-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-ink-2">总用量</span>
            <span className="font-semibold tabular-nums text-ink">
              {fmtBytes(info.usage)}
              {info.quota > 0 && <span className="font-normal text-ink-2"> / 约 {fmtBytes(info.quota)}</span>}
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
            其中录音音频：<span className="tabular-nums text-ink">{info.audioCount}</span> 段 · {fmtBytes(info.audioBytes)}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-[11px] leading-snug text-ink-2">
              持久化存储：{persisted == null ? '未知' : persisted ? '已开启' : '未开启，空间紧张时浏览器可能清理数据'}
            </span>
            {persisted === false && (
              <button
                onClick={requestPersist}
                className="shrink-0 text-xs font-medium text-accent transition-opacity hover:opacity-70"
              >
                申请开启
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
      setError('请先在上方填写 Client ID');
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
          <DialogTitle className="text-ink">连接 GitHub</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="rounded-xl bg-red-500/10 px-3.5 py-3 text-xs leading-relaxed text-red-500">{error}</p>
        ) : done ? (
          <p className="py-6 text-center text-sm font-medium text-ink">已连接，授权信息仅保存在本机</p>
        ) : code ? (
          <div className="flex flex-col items-center gap-3.5 py-1">
            <p className="text-xs text-ink-2">在打开的 GitHub 页面输入以下代码完成授权</p>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(code.userCode).then(() => toast.success('已复制'));
              }}
              className="rounded-2xl bg-surface-hi px-6 py-3 font-mono text-3xl font-bold tracking-[0.28em] text-ink transition-transform active:scale-95"
              title="点击复制"
            >
              {code.userCode}
            </button>
            <a
              href={code.verifyUri}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
            >
              打开 github.com/login/device
            </a>
            <p className="flex items-center gap-1.5 text-[11px] text-ink-2">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              等待授权中…
            </p>
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-ink-2">正在请求设备码…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPage() {
  const install = usePwaInstall();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const records = useHistoryStore((s) => s.records);
  const importRecords = useHistoryStore((s) => s.importRecords);
  const clearAll = useHistoryStore((s) => s.clearAll);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [zipBusy, setZipBusy] = useState(false);
  // GitHub 云备份
  const [ghLogin, setGhLogin] = useState<string | null>(null);
  const [ghChecking, setGhChecking] = useState(true);
  const [ghBusy, setGhBusy] = useState<'push' | 'pull' | null>(null);
  const [ghProgress, setGhProgress] = useState('');
  const [ghLastPush, setGhLastPush] = useState<number | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  // 枚举麦克风设备（授权过一次后才能拿到名称）
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
      setMics(devices.filter((d) => d.kind === 'audioinput'));
    }).catch(() => undefined);
  }, []);

  const setHue = (hue: number) => {
    updateSettings({ hue });
    applyTheme(hue);
  };

  const update = (patch: Partial<AppSettings>) => updateSettings(patch);

  /** 导出全部记录的统计摘要 CSV */
  const exportSummaryCsv = () => {
    if (records.length === 0) {
      toast.info('暂无历史记录可导出');
      return;
    }
    downloadText(
      `voice-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      recordsToSummaryCsv(records),
    );
    toast.success(`已导出 ${records.length} 条记录的汇总`);
  };

  /** 导出全部记录为 JSON */
  const exportData = () => {
    if (records.length === 0) {
      toast.info('暂无历史记录可导出');
      return;
    }
    const payload = {
      app: 'simple-voice-tools',
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
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
    toast.success(`已导出 ${records.length} 条记录`);
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
        if (added > 0) toast.success(`成功导入 ${added} 条记录`);
        else toast.info('没有新的记录（可能已存在）');
      } catch {
        toast.error('导入失败：文件格式不正确');
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
      if (res.records === 0) toast.info('暂无历史记录可导出');
      else toast.success(`已备份 ${res.records} 条记录、${res.audio} 段音频`);
    } catch (err) {
      console.error(err);
      toast.error('备份打包失败');
    } finally {
      setZipBusy(false);
    }
  };

  /** 从 ZIP 备份恢复 */
  const importZip = (file: File) => {
    void (async () => {
      try {
        const res = await importFullBackup(file);
        if (res.records > 0) toast.success(`已恢复 ${res.records} 条记录，挂载 ${res.audio} 段音频`);
        else if (res.audio > 0) toast.info(`没有新记录，已为已有记录挂载 ${res.audio} 段音频`);
        else toast.info('备份内容与本地数据一致');
      } catch (err) {
        console.error(err);
        toast.error('恢复失败：ZIP 文件无法解析或格式不正确');
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
    toast.success(`已连接 GitHub（${login}）`);
  }, []);

  const onGhDisconnect = () => {
    void disconnectGithub().then(() => {
      setGhLogin(null);
      setGhLastPush(null);
      toast.success('已断开 GitHub 连接');
    });
  };

  const onGhPush = () => {
    if (ghBusy || !ghLogin) return;
    setGhBusy('push');
    setGhProgress('准备中…');
    pushBackup(clientId, repoName, (done, total, phase) => {
      setGhProgress(total > 1 ? `${phase} ${done}/${total}` : `${phase}…`);
    })
      .then((res) => {
        toast.success(`备份完成：${res.records} 条记录（上传 ${res.pushed} 个文件，${res.skipped} 个未变化已跳过）`);
        setGhLastPush(Date.now());
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : '备份失败');
      })
      .finally(() => {
        setGhBusy(null);
        setGhProgress('');
      });
  };

  const onGhPull = () => {
    if (ghBusy || !ghLogin) return;
    setGhBusy('pull');
    setGhProgress('准备中…');
    pullBackup(clientId, repoName, (done, total, phase) => {
      setGhProgress(total > 1 ? `${phase} ${done}/${total}` : `${phase}…`);
    })
      .then((res) => {
        if (res.records > 0 || res.audio > 0) {
          toast.success(`已合并 ${res.records} 条新记录，补齐 ${res.audio} 段音频`);
        } else {
          toast.info('本地数据与云端一致');
        }
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : '恢复失败');
      })
      .finally(() => {
        setGhBusy(null);
        setGhProgress('');
      });
  };

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      {/* 外观 */}
      <SettingsSection icon={Palette} title="外观">
        <SettingRow stacked label="主题色">
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
            {THEME_PRESETS.map((p) => (
              <Swatch key={p.id} hue={p.hue} active={Math.abs(settings.hue - p.hue) < 4} onClick={() => setHue(p.hue)} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Sparkles size={14} className="shrink-0 text-ink-2" />
            <input
              type="range"
              min={0}
              max={360}
              value={settings.hue}
              onChange={(e) => setHue(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-red-400 via-emerald-400 to-violet-500 accent-accent"
              aria-label="自定义色相"
            />
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-2">{settings.hue}°</span>
          </div>
        </SettingRow>
        <SettingRow label="图表网格辅助线">
          <Switch
            checked={settings.showGrid}
            onCheckedChange={(v) => update({ showGrid: v })}
          />
        </SettingRow>
        <SettingRow label="图表时间轴联动">
          <Switch
            checked={settings.syncChartRange}
            onCheckedChange={(v) => update({ syncChartRange: v })}
          />
        </SettingRow>
      </SettingsSection>

      {/* 录音 */}
      <SettingsSection icon={Mic} title="录音">
        <SettingRow label="录音结束后自动进入分析">
          <Switch
            checked={settings.autoEnterAnalysis}
            onCheckedChange={(v) => update({ autoEnterAnalysis: v })}
          />
        </SettingRow>
        <SettingRow label="保存录音音频">
          <Switch
            checked={settings.audioSave}
            onCheckedChange={(v) => update({ audioSave: v })}
          />
        </SettingRow>
        <SettingRow label="最长录音时长">
          <Select
            value={String(settings.maxDurationSec)}
            onValueChange={(v) => update({ maxDurationSec: Number(v) })}
          >
            <SelectTrigger className="w-28 border-0 bg-transparent px-0 text-sm shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
              <SelectItem value="30">30 秒</SelectItem>
              <SelectItem value="60">1 分钟</SelectItem>
              <SelectItem value="120">2 分钟</SelectItem>
              <SelectItem value="300">5 分钟</SelectItem>
              <SelectItem value="0">不限制</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="麦克风设备">
          <Select
            value={settings.micDeviceId || 'default'}
            onValueChange={(v) => update({ micDeviceId: v === 'default' ? '' : v })}
          >
            <SelectTrigger className="w-52 max-w-full overflow-hidden border-0 bg-transparent px-0 text-sm shadow-none [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:truncate">
              <SelectValue placeholder="系统默认" />
            </SelectTrigger>
            <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
              <SelectItem value="default">系统默认</SelectItem>
              {mics.map((mic, i) => (
                <SelectItem key={mic.deviceId} value={mic.deviceId}>
                  <span className="max-w-52 truncate">{mic.label || `麦克风 ${i + 1}`}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingsSection>

      {/* 数据管理 */}
      <SettingsSection icon={DatabaseBackup} title="数据管理">
        <StorageUsage />
        <SettingRow label="完整备份（ZIP）">
          <button
            onClick={exportZip}
            disabled={zipBusy}
            className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
          >
            <Archive size={14} />
            {zipBusy ? '打包中…' : '导出'}
          </button>
        </SettingRow>
        <SettingRow label="从 ZIP 恢复">
          <button
            onClick={() => zipInputRef.current?.click()}
            className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
          >
            <Upload size={14} />
            恢复
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
        <SettingRow label="导出历史记录">
          <button
            onClick={exportData}
            className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
          >
            <Download size={14} />
            导出
          </button>
        </SettingRow>
        <SettingRow label="导出汇总 CSV">
          <button
            onClick={exportSummaryCsv}
            className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
          >
            <FileSpreadsheet size={14} />
            导出
          </button>
        </SettingRow>
        <SettingRow label="导入历史记录">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
          >
            <Upload size={14} />
            导入
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
        <SettingRow label="载入示例数据">
          <button
            onClick={() => {
              const demo = createDemoRecord();
              useHistoryStore.getState().addRecord(demo);
              setCurrentAnalysis(demo);
              toast.success('已载入示例数据，可在历史与分析中查看');
            }}
            className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-ink-2 transition-opacity hover:opacity-70"
          >
            <Eraser size={14} />
            载入
          </button>
        </SettingRow>
        <SettingRow label="清空全部历史记录">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-red-500 transition-opacity hover:opacity-70">
                <Trash2 size={14} />
                清空
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-3xl border-0 bg-card">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-ink">确认清空全部历史记录？</AlertDialogTitle>
                <AlertDialogDescription className="text-ink-2">
                  共 {records.length} 条记录将被永久删除，此操作不可恢复。建议先导出备份。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-none border-0 bg-transparent text-sm font-medium text-ink-2 shadow-none">取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    clearAll();
                    setCurrentAnalysis(null);
                    toast.success('已清空全部历史记录');
                  }}
                  className="rounded-none bg-red-500 text-sm text-white hover:bg-red-500/90"
                >
                  确认清空
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SettingRow>
      </SettingsSection>

      {/* GitHub 云备份 */}
      <SettingsSection icon={Cloud} title="GitHub 云备份">
        <SettingRow stacked label="Client ID">
          <input
            value={settings.githubClientId ?? ''}
            onChange={(e) => update({ githubClientId: e.target.value.trim() })}
            placeholder="例如 Iv23li…（GitHub App）或一串十六进制（OAuth App）"
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-xl border border-black/10 bg-surface-hi px-3 py-2 font-mono text-xs text-ink outline-none placeholder:text-ink-2/50 focus:border-accent"
          />
        </SettingRow>
        <SettingRow label="仓库名">
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
          label="连接状态"
          desc={ghChecking ? '检查中…' : ghLogin ? `已连接 ${ghLogin}` : '未连接'}
        >
          {ghChecking ? undefined : ghLogin ? (
            <button
              onClick={onGhDisconnect}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-ink-2 transition-opacity hover:opacity-70"
            >
              <Unlink size={14} />
              断开
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
              连接
            </button>
          )}
        </SettingRow>
        <SettingRow
          label="备份到 GitHub"
          desc={
            ghBusy === 'push'
              ? ghProgress || '准备中…'
              : ghLastPush
                ? `上次备份 ${new Date(ghLastPush).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
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
            {ghBusy === 'push' ? '备份中…' : '立即备份'}
          </button>
        </SettingRow>
        <SettingRow
          label="从 GitHub 恢复"
          desc={ghBusy === 'pull' ? ghProgress || '准备中…' : undefined}
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
            {ghBusy === 'pull' ? '恢复中…' : '恢复'}
          </button>
        </SettingRow>
      </SettingsSection>

      {/* 应用（PWA） */}
      <SettingsSection icon={Smartphone} title="应用">
        <SettingRow label="安装为桌面应用">
          <button
            onClick={async () => {
              const outcome = await promptInstall();
              if (outcome === 'dismissed') toast.info('已取消安装');
              else if (outcome === 'unavailable') toast.info('当前环境不支持一键安装');
            }}
            disabled={install.standalone || !install.canInstall}
            className={cn(
              'flex items-center gap-1.5 px-1 py-2 text-xs font-medium transition-opacity',
              install.standalone || !install.canInstall
                ? 'cursor-default text-ink-2/60'
                : 'text-accent hover:opacity-70',
            )}
          >
            <Download size={14} />
            {install.standalone ? '已安装' : install.canInstall ? '安装' : '不可用'}
          </button>
        </SettingRow>
      </SettingsSection>

      {/* 关于 */}
      <SettingsSection icon={Info} title="关于">
        <div className="pt-1 text-xs leading-relaxed text-ink-2">
          <p className="text-sm font-semibold text-ink">Simple Voice Tools · 语音工坊</p>
          <p className="mt-1">
            v0.4.0 — 基于 Web Audio API 的语音测试与分析工具：
            YIN 音高检测、LPC 共振峰提取、能量分析、语谱图、
            Jitter/Shimmer/HNR/CPPS 嗓音质量指标、元音空间散点、声域图（VRP）、
            三种测试模式与录音回放、ZIP/GitHub 云备份。
          </p>
          <p className="mt-1">
            数据默认仅保存在本机浏览器中；只有你主动使用完整备份或 GitHub 云备份时才会导出/上传。
          </p>
        </div>

        {/* 文档：应用内离线阅读 */}
        <div className="mt-2 flex flex-col">
          <p className="pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-2">文档</p>
          {DOC_ENTRIES.map((doc) => (
            <DocViewer
              key={doc.title}
              title={doc.title}
              md={doc.md}
              trigger={
                <button className="flex items-center justify-between border-t border-black/[0.04] py-3 text-sm font-medium text-ink transition-colors first:border-t-0 hover:text-accent">
                  <span className="flex items-center gap-2">
                    <BookOpen size={14} className="text-accent" />
                    {doc.title}
                    <span className="text-[11px] font-normal text-ink-2">{doc.desc}</span>
                  </span>
                  <ChevronRight size={15} className="text-ink-2" />
                </button>
              }
            />
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
