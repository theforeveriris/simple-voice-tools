/**
 * 脚本中心（实验性功能子区块）
 * 管理 Lua 脚本：内置脚本（可停用）/ 用户脚本（增删改、导入导出 JSON 分享），
 * 每条可试运行（拿 demo 统计喂 advise()）验证脚本正确性。
 */

import { useEffect, useState } from 'react';
import {
  Braces, Download, FilePlus2, Pencil, Play, Trash2, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import {
  deleteUserScript, exportScripts, importAny, listScripts,
  putUserScript, setScriptEnabled, type LuaScriptView,
} from '@/lib/lua/scripts';
import { runLuaFn } from '@/lib/lua/engine';
import type { AdviceTarget } from '@/lib/advice';
import type { VoiceStats } from '@/types';
import { Switch } from '../ui';
import { cn } from '@/lib/utils';
/** 脚本类型徽标（列表里区分消费方） */
const KIND_LABEL: Record<LuaScriptView['kind'], string> = {
  advice: '建议',
  card: '卡片',
  flower: '花朵',
  export: '导出',
};

/** 试运行用的示例统计（与真实 VoiceStats 同形） */
const DEMO_STATS: VoiceStats = {
  durationSec: 12.4,
  sampleHz: 30,
  totalSamples: 372,
  voicedSamples: 301,
  avgF0: 172.3,
  medianF0: 168,
  minF0: 118,
  maxF0: 245,
  p10F0: 142,
  p90F0: 208,
  stdF0: 18.2,
  malePct: 8.4,
  femalePct: 64.2,
  transitionPct: 27.4,
  avgF1: 610,
  avgF2: 1890,
  f2f1GapHz: 1280,
  f2f1GapMedianHz: 1310,
  spectralTiltDbOct: -6.2,
  f1Range: [480, 760],
  f2Range: [1500, 2400],
  avgDb: -28.6,
  peakDb: -11.4,
  jitterPct: 0.86,
  shimmerPct: 4.1,
  hnrDb: 18.5,
  cppsDb: 14.2,
  inTargetPct: 78.6,
};

const DEMO_TARGET: AdviceTarget = { enabled: true, min: 130, max: 210 };

/** 编辑器展开态的本地草稿 */
interface Draft {
  id: string | null; // null = 新建
  name: string;
  code: string;
  /** 脚本种类：编辑时保留原种类，避免保存把 flower/export 降级成 advice */
  kind: LuaScriptView['kind'];
}

export function ScriptHubSection() {
  useI18n();
  const [scripts, setScripts] = useState<LuaScriptView[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [testing, setTesting] = useState(false);

  const reload = () => void listScripts().then(setScripts);
  useEffect(reload, []);

  const saveDraft = async () => {
    if (!draft) return;
    const name = draft.name.trim() || t('labs.scriptUntitled');
    await putUserScript({
      id: draft.id ?? `lua-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      kind: draft.kind,
      code: draft.code,
      createdAt: 0,
      updatedAt: 0,
    });
    toast.success(t('labs.scriptSaved'));
    setDraft(null);
    reload();
  };

  const testRun = async (code: string, kind: LuaScriptView['kind'] = 'advice') => {
    setTesting(true);
    if (kind === 'flower') {
      // 花朵脚本：喂 demo stats（含频带摘要），校验返回结构
      const res = await runLuaFn<unknown>(code, 'flower', [{
        ...DEMO_STATS, f2f1GapHz: null, jitterPct: null, shimmerPct: null, hnrDb: null, cppsDb: null,
        bands: { hz: {}, energy: {} },
      }]);
      setTesting(false);
      const ok = res.ok && res.value && typeof res.value === 'object' && Array.isArray((res.value as { petals?: unknown[] }).petals);
      if (ok) toast.success(t('labs.scriptTestOk', { n: (res.value as { petals: unknown[] }).petals.length }));
      else toast.error(`${t('labs.scriptTestFail')}${res.ok ? '' : `：${res.error}`}`);
      return;
    }
    if (kind === 'export') {
      // 导出脚本：喂 demo record 视图（含 series.frames）；时间戳取固定值保持渲染纯净
      const res = await runLuaFn<unknown>(code, 'export', [{
        id: 'demo12345678', createdAt: 1735689600000, dateStr: '2025/1/1 12:00',
        durationSec: DEMO_STATS.durationSec, mode: 'reading', note: '',
        stats: { ...DEMO_STATS, target: DEMO_TARGET },
        series: {
          frames: [
            { t: 0, f0: 170, rmsDb: -30, f1: 610, f2: 1890 },
            { t: 0.033, f0: 175, rmsDb: -28, f1: 600, f2: 1920 },
          ],
        },
      }]);
      setTesting(false);
      const v = res.ok ? res.value as { filename?: unknown; content?: unknown } : null;
      if (v && typeof v.content === 'string' && v.content.length > 0) {
        toast.success(t('labs.scriptTestOk', { n: 1 }));
      } else {
        toast.error(`${t('labs.scriptTestFail')}${res.ok ? '' : `：${res.error}`}`);
      }
      return;
    }
    // advice（与 card 类默认）：
    const res = await runLuaFn<unknown>(code, kind === 'card' ? 'template' : 'advise', [
      { ...DEMO_STATS, target: DEMO_TARGET },
    ]);
    setTesting(false);
    if (res.ok && Array.isArray(res.value)) {
      toast.success(t('labs.scriptTestOk', { n: res.value.length }));
    } else {
      toast.error(`${t('labs.scriptTestFail')}${res.ok ? '' : `：${res.error}`}`);
    }
  };

  const doImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lua,.json,text/plain,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const n = await importAny(file.name, await file.text());
        toast.success(t('labs.scriptImported', { n }));
        reload();
      } catch {
        toast.error(t('labs.scriptImportFail'));
      }
    };
    input.click();
  };

  const doExport = async () => {
    const all = await listScripts();
    const payload = exportScripts(all);
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'simple-voice-tool-scripts.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="card-surface p-4">
      <div className="mb-1 flex items-center gap-1.5">
        <Braces size={14} className="text-accent" />
        <p className="text-sm font-semibold text-ink">{t('labs.scripts')}</p>
      </div>
      <p className="mb-3 px-0.5 text-[11px] leading-relaxed text-ink-2">{t('labs.scriptsDesc')}</p>

      {/* 脚本列表 */}
      <div className="flex flex-col gap-1">
        {scripts.map((s) => (
          <div
            key={s.id}
            className={cn(
              'flex items-center gap-2 rounded-xl px-2 py-1.5',
              s.builtin ? 'bg-surface/60' : 'bg-surface',
            )}
          >
            <span className="min-w-0 flex-1 truncate text-xs text-ink">
              {s.name}
              <span className="ml-1.5 text-[10px] text-ink-2">
                {s.builtin ? `内置 · ${KIND_LABEL[s.kind]}` : KIND_LABEL[s.kind]}
              </span>
            </span>
            <button
              onClick={() => void testRun(s.code, s.kind)}
              disabled={testing}
              aria-label={t('labs.scriptTest')}
              className="grid size-7 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-black/5 hover:text-accent disabled:opacity-40"
            >
              <Play size={13} />
            </button>
            {!s.builtin && (
              <>
                <button
                  onClick={() => setDraft({ id: s.id, name: s.name, code: s.code, kind: s.kind })}
                  aria-label={t('labs.scriptEdit')}
                  className="grid size-7 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-black/5 hover:text-accent"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(t('labs.scriptDeleteConfirm', { name: s.name }))) {
                      void deleteUserScript(s.id).then(() => {
                        toast.success(t('labs.scriptDeleteDone'));
                        reload();
                      });
                    }
                  }}
                  aria-label={t('labs.scriptDelete')}
                  className="grid size-7 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-black/5 hover:text-[#D66E5B]"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
            <Switch
              checked={s.enabled}
              onCheckedChange={(v) => void setScriptEnabled(s.id, v).then(reload)}
            />
          </div>
        ))}
      </div>

      {/* 工具行 */}
      <div className="mt-3 flex items-center gap-3 px-0.5">
        <button
          onClick={() => setDraft({ id: null, name: '', code: '-- 新脚本：定义 function advise(stats) ...\n', kind: 'advice' })}
          className="flex items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          <FilePlus2 size={13} />
          {t('labs.scriptNew')}
        </button>
        <button onClick={doImport} className="flex items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70">
          <Upload size={13} />
          {t('labs.scriptImport')}
        </button>
        <button onClick={doExport} className="flex items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70">
          <Download size={13} />
          {t('labs.scriptExport')}
        </button>
      </div>

      {/* 编辑器 */}
      {draft && (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-black/10 bg-surface-hi p-3">
          <div className="flex items-center gap-2">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t('labs.scriptNamePlaceholder')}
              className="min-w-0 flex-1 rounded-xl border border-black/10 bg-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-1 text-[10px] font-medium text-on-accent-soft">
              {KIND_LABEL[draft.kind]}
            </span>
          </div>
          <textarea
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            spellCheck={false}
            rows={14}
            className="w-full resize-y rounded-xl border border-black/10 bg-card p-3 font-mono text-xs leading-relaxed text-ink outline-none focus:border-accent"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => void saveDraft()}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white transition-transform active:scale-95"
            >
              {t('common.save')}
            </button>
            <button
              onClick={() => void testRun(draft.code, draft.kind)}
              disabled={testing}
              className="flex items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-40"
            >
              <Play size={12} />
              {t('labs.scriptTest')}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="ml-auto text-xs font-medium text-ink-2 transition-opacity hover:opacity-70"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
