/**
 * 设置页面
 * - 外观：莫奈取色主题色（预设 + 自定义色相）、图表网格辅助线
 * - 录音：麦克风设备、最长录音时长、结束后自动进入分析
 * - 数据管理：历史记录导出 / 导入 / 清空
 * - 关于
 */

import { useEffect, useRef, useState } from 'react';
import type { ElementType, ReactNode } from 'react';
import {
  Palette, Mic, DatabaseBackup, Info, Download, Upload, Trash2, Eraser, Sparkles,
  BookOpen, ChevronRight, Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { applyTheme } from '@/lib/theme/monet';
import { createDemoRecord } from '@/lib/audio/demo';
import { usePwaInstall, promptInstall } from '@/lib/pwa';
import { THEME_PRESETS } from '@/constants';
import { DocViewer } from '@/components/layout/DocViewer';
import yinDoc from '../../../documentation/ALGORITHM-YIN.md?raw';
import lpcDoc from '../../../documentation/ALGORITHM-FORMANT-LPC.md?raw';
import energyDoc from '../../../documentation/ALGORITHM-ENERGY.md?raw';
import devDoc from '../../../documentation/DEVELOPMENT.md?raw';
import type { AppSettings } from '@/types';
import { cn } from '@/lib/utils';

/** 应用内可阅读的文档（Markdown 源文件位于 documentation/） */
const DOC_ENTRIES: { title: string; desc: string; md: string }[] = [
  { title: '算法 · 音高检测（YIN）', desc: '差分函数 · CMND · 抛物线插值', md: yinDoc },
  { title: '算法 · 共振峰提取（LPC）', desc: '预加重 · 抽取 · 求根全链路', md: lpcDoc },
  { title: '算法 · 能量分析（RMS）', desc: '分贝换算 · VAD 门限体系', md: energyDoc },
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
      <div className="py-2.5">
        <p className="text-sm font-medium text-ink">{label}</p>
        {desc && <p className="mt-0.5 text-[11px] text-ink-2">{desc}</p>}
        <div className="mt-2.5">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-black/[0.04] py-3 first:border-t-0">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {desc && <p className="mt-0.5 text-[11px] text-ink-2">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

/** 主题色圆点 */
function Swatch({ hue, active, onClick }: { hue: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="size-9 rounded-full transition-transform hover:scale-110 active:scale-95"
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

export function SettingsPage() {
  const install = usePwaInstall();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const records = useHistoryStore((s) => s.records);
  const importRecords = useHistoryStore((s) => s.importRecords);
  const clearAll = useHistoryStore((s) => s.clearAll);
  const setCurrentAnalysis = useStore((s) => s.setCurrentAnalysis);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);

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

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      <div className="pt-1">
        <h1 className="text-xl font-semibold tracking-tight text-ink">设置</h1>
        <p className="mt-0.5 text-xs text-ink-2">个性化外观、录音与数据管理</p>
      </div>

      {/* 外观 */}
      <SettingsSection icon={Palette} title="外观 · 莫奈取色">
        <SettingRow
          stacked
          label="主题色"
          desc="基于 Material 3 莫奈取色的柔和色板，全应用实时生效"
        >
          <div className="flex flex-wrap items-center gap-2.5">
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
        <SettingRow label="图表网格辅助线" desc="在曲线图中显示淡灰色虚线刻度">
          <Switch
            checked={settings.showGrid}
            onCheckedChange={(v) => update({ showGrid: v })}
          />
        </SettingRow>
      </SettingsSection>

      {/* 录音 */}
      <SettingsSection icon={Mic} title="录音">
        <SettingRow label="录音结束后自动进入分析" desc="关闭后停留在测试页，可手动前往分析">
          <Switch
            checked={settings.autoEnterAnalysis}
            onCheckedChange={(v) => update({ autoEnterAnalysis: v })}
          />
        </SettingRow>
        <SettingRow label="最长录音时长" desc="达到上限将自动停止录音">
          <Select
            value={String(settings.maxDurationSec)}
            onValueChange={(v) => update({ maxDurationSec: Number(v) })}
          >
            <SelectTrigger className="w-28 border-0 bg-transparent px-0 text-sm shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 秒</SelectItem>
              <SelectItem value="60">1 分钟</SelectItem>
              <SelectItem value="120">2 分钟</SelectItem>
              <SelectItem value="300">5 分钟</SelectItem>
              <SelectItem value="0">不限制</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow label="麦克风设备" desc="保持默认即可使用系统输入设备">
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
        <SettingRow label="导出历史记录" desc="将全部测试记录保存为 JSON 文件">
          <button
            onClick={exportData}
            className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
          >
            <Download size={14} />
            导出
          </button>
        </SettingRow>
        <SettingRow label="导入历史记录" desc="从之前导出的 JSON 文件合并恢复（自动去重）">
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
        <SettingRow label="载入示例数据" desc="生成一段示例录音，体验分析功能">
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
        <SettingRow label="清空全部历史记录" desc="删除本地保存的所有测试数据，不可恢复">
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

      {/* 应用（PWA） */}
      <SettingsSection icon={Smartphone} title="应用">
        <SettingRow
          label="安装为桌面应用"
          desc={
            install.standalone
              ? '当前已在应用窗口中运行'
              : install.canInstall
                ? '安装到桌面或主屏幕，支持离线使用'
                : '当前浏览器未提供一键安装，可尝试浏览器菜单中的「安装」或「添加到主屏幕」'
          }
        >
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
            v0.2.0 — 基于 Web Audio API 的语音测试与分析工具：
            YIN 音高检测、LPC 共振峰提取、能量分析。
          </p>
          <p className="mt-1">
            数据仅保存在本机浏览器中，不会上传到任何服务器。
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
    </div>
  );
}
