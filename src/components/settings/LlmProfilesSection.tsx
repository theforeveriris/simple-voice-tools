/**
 * 配置档案区（大模型子页面 · v0.9.0 方案 A：档案即数据源）
 * - 卡片列表：点按 = 切换使用中；铅笔 = 编辑
 * - 新建 / 编辑共用一个表单弹窗：测试连接 / 保存 / 创建副本 / 删除（两步确认）
 * - 档案本体存 IndexedDB（llm:profiles，含 API Key，不进 localStorage）；
 *   活动指针 = settings.llmActiveProfileId
 */

import { useState } from 'react';
import { Copy, Eye, EyeOff, Layers, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings } from '@/types';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui';
import { SettingsSection } from './rows';
import {
  addProfile, deleteProfile, duplicateProfile, updateProfile, useLlmProfiles,
  type LlmProfile,
} from '@/lib/llmProfiles';
import { resolveLlmConfig, testLlmConnection } from '@/lib/llm';

/** baseUrl → 展示用主机名（无协议等非法输入时退化为去头后的首段） */
function hostOf(url: string): string {
  const s = url.trim();
  if (!s) return '—';
  try {
    return new URL(s).host;
  } catch {
    return s.replace(/^https?:\/\//, '').split('/')[0] || '—';
  }
}

export function LlmProfilesSection({
  settings,
  update,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}) {
  useI18n();
  const profiles = useLlmProfiles();
  const activeId = settings.llmActiveProfileId;
  /** null = 关闭；{ mode: 'new' } = 新建；{ mode: 'edit', id } = 编辑既有档案 */
  const [sheet, setSheet] = useState<{ mode: 'new' } | { mode: 'edit'; id: string } | null>(null);

  const activate = (p: LlmProfile) => {
    if (p.id === activeId) return;
    update({ llmActiveProfileId: p.id });
    toast.success(t('toast.llmProfileApplied', { name: p.name }));
  };

  return (
    <SettingsSection icon={Layers} title={t('settings.llmProfiles')}>
      {profiles == null ? null : profiles.length === 0 ? (
        <p className="py-2 text-xs leading-relaxed text-ink-2">{t('settings.llmProfileEmpty')}</p>
      ) : (
        profiles.map((p) => {
          const active = p.id === activeId;
          return (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-1 rounded-2xl px-2.5 py-1.5',
                active && 'bg-accent/10',
              )}
            >
              <button onClick={() => activate(p)} className="min-w-0 flex-1 py-1 text-left">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{p.name}</span>
                  {active && (
                    <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                      {t('settings.llmProfileActiveBadge')}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-ink-2">
                  {hostOf(p.baseUrl)} · {p.modelId || '—'}
                </span>
              </button>
              <button
                onClick={() => setSheet({ mode: 'edit', id: p.id })}
                aria-label={t('settings.llmProfileEdit')}
                className="grid size-8 shrink-0 place-items-center rounded-full text-ink-2 transition-transform active:scale-90"
              >
                <Pencil size={14} />
              </button>
            </div>
          );
        })
      )}
      <button
        onClick={() => setSheet({ mode: 'new' })}
        className="mt-1 flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-black/10 py-2 text-xs font-medium text-ink-2 transition-transform active:scale-[0.99]"
      >
        <Plus size={14} />
        {t('settings.llmProfileNew')}
      </button>

      {sheet && (
        <ProfileSheet
          profile={sheet.mode === 'edit' ? profiles?.find((p) => p.id === sheet.id) ?? null : null}
          activeId={activeId}
          update={update}
          onClose={() => setSheet(null)}
        />
      )}
    </SettingsSection>
  );
}

/** 新建 / 编辑档案的表单弹窗（含连接测试、副本、两步删除） */
function ProfileSheet({
  profile,
  activeId,
  update,
  onClose,
}: {
  profile: LlmProfile | null;
  activeId: string | undefined;
  update: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}) {
  useI18n();
  const [name, setName] = useState(profile?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(profile?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(profile?.apiKey ?? '');
  const [modelId, setModelId] = useState(profile?.modelId ?? '');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [delArmed, setDelArmed] = useState(false);

  const inputCls =
    'w-full rounded-xl border border-black/10 bg-surface-hi px-3 py-2 font-mono text-xs text-ink outline-none placeholder:text-ink-2/50 focus:border-accent';

  const formCfg = resolveLlmConfig({ llmBaseUrl: baseUrl, llmApiKey: apiKey, llmModelId: modelId });

  const onTest = () => {
    if (testing) return;
    if (!formCfg) {
      toast.error(t('toast.llmTestFail', { msg: t('settings.llmIncomplete') }));
      return;
    }
    setTesting(true);
    testLlmConnection(formCfg)
      .then((reply) => toast.success(t('toast.llmTestOk', { model: reply })))
      .catch((err: unknown) =>
        toast.error(t('toast.llmTestFail', { msg: err instanceof Error ? err.message : String(err) })))
      .finally(() => setTesting(false));
  };

  const onSave = () => {
    const trimmed = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      modelId: modelId.trim(),
    };
    if (!trimmed.name) {
      toast.error(t('toast.llmProfileNameEmpty'));
      return;
    }
    if (!formCfg) {
      toast.error(t('toast.llmProfileIncomplete'));
      return;
    }
    if (profile) {
      updateProfile(profile.id, trimmed);
    } else {
      // 新建的档案自动设为使用中（刚建完大概率就是要用它）
      update({ llmActiveProfileId: addProfile(trimmed.name, trimmed) });
    }
    toast.success(t('toast.llmProfileSaved', { name: trimmed.name }));
    onClose();
  };

  const onDuplicate = () => {
    if (!profile) return;
    const id = duplicateProfile(profile.id);
    if (id) toast.success(t('toast.llmProfileSaved', { name: `${profile.name} · ${t('settings.llmProfileCopySuffix')}` }));
    onClose();
  };

  const onDelete = () => {
    if (!profile) return;
    if (!delArmed) {
      setDelArmed(true);
      return;
    }
    deleteProfile(profile.id);
    if (activeId === profile.id) update({ llmActiveProfileId: undefined });
    toast.success(t('toast.llmProfileDeleted', { name: profile.name }));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl border-0 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{profile ? t('settings.llmProfileEdit') : t('settings.llmProfileNew')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-2">{t('settings.llmProfileName')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.llmProfileNamePh')}
              autoComplete="off"
              className="w-full rounded-xl border border-black/10 bg-surface-hi px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-2/50 focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-2">{t('settings.llmBaseUrl')}</span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={t('settings.llmBaseUrlPlaceholder')}
              spellCheck={false}
              autoComplete="off"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-2">{t('settings.llmApiKey')}</span>
            <span className="flex items-center gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('settings.llmApiKeyPlaceholder')}
                spellCheck={false}
                autoComplete="off"
                className={inputCls}
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                aria-label={t('settings.llmApiKey')}
                className="grid size-8 shrink-0 place-items-center rounded-full text-ink-2"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-2">{t('settings.llmModelId')}</span>
            <input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={t('settings.llmModelIdPlaceholder')}
              spellCheck={false}
              autoComplete="off"
              className={inputCls}
            />
          </label>
          <button
            onClick={onTest}
            disabled={testing}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-accent/10 py-2 text-xs font-medium text-accent disabled:opacity-60"
          >
            {testing && <Loader2 size={12} className="animate-spin" />}
            {testing ? t('settings.llmTesting') : t('settings.llmTest')}
          </button>
        </div>
        <DialogFooter className="flex-row items-center gap-2">
          {profile && (
            <>
              <button
                onClick={onDuplicate}
                className="flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-xs font-medium text-ink shadow-[0_1px_4px_rgba(28,25,45,0.06)]"
              >
                <Copy size={13} />
                {t('settings.llmProfileDuplicate')}
              </button>
              <button
                onClick={onDelete}
                className={cn(
                  'ml-auto flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors',
                  delArmed ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-500',
                )}
              >
                <Trash2 size={13} />
                {delArmed ? t('settings.llmProfileDeleteConfirm') : t('settings.llmProfileDelete')}
              </button>
            </>
          )}
          <button
            onClick={onSave}
            className={cn('rounded-full px-4 py-2 text-xs font-semibold text-white', profile ? 'bg-accent' : 'bg-accent ml-auto')}
          >
            {t('common.save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
