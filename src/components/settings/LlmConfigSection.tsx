/* ------------------------------ 大模型配置（实验性） ------------------------------ */

import { useState, useSyncExternalStore } from 'react';
import { Bot, ChevronRight, Eye, EyeOff, PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import { resolveLlmConfig, testLlmConnection } from '@/lib/llm';
import {
  deleteProfile, getProfilesSnapshot, saveProfile, subscribeProfiles,
} from '@/lib/llmProfiles';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings } from '@/types';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { SettingsSection, SettingRow } from './rows';
import { InfoTip } from './InfoTip';

/** 无档案时的下拉占位值（当前配置尚未保存为档案） */
const CUSTOM_OPTION = '__custom';

/** OpenAI 兼容接口参数 + 配置档案 + 测试连接 + 提示词入口（Key 仅存本地 IndexedDB kv 仓库） */
export function LlmConfigSection({
  settings,
  update,
  onOpenPrompt,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  /** 打开 自定义提示词 子页面 */
  onOpenPrompt: () => void;
}) {
  useI18n();
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [profileName, setProfileName] = useState('');
  // 删除档案两步确认
  const [confirmDel, setConfirmDel] = useState(false);
  const profiles = useSyncExternalStore(subscribeProfiles, getProfilesSnapshot);

  const baseUrl = settings.llmBaseUrl ?? '';
  const apiKey = settings.llmApiKey ?? '';
  const modelId = settings.llmModelId ?? '';
  // 当前活动配置与哪个档案完全一致（用于下拉选中态；手动改动即回落到「自定义」）
  const matched = profiles?.find(
    (p) => p.baseUrl === baseUrl && p.apiKey === apiKey && p.modelId === modelId,
  );

  const applyProfile = (id: string) => {
    const p = profiles?.find((x) => x.id === id);
    setConfirmDel(false);
    if (!p) {
      update({ llmActiveProfileId: undefined });
      return;
    }
    update({ llmBaseUrl: p.baseUrl, llmApiKey: p.apiKey, llmModelId: p.modelId, llmActiveProfileId: p.id });
    toast.success(t('toast.llmProfileApplied', { name: p.name }));
  };

  const onSaveProfile = () => {
    const name = profileName.trim();
    if (!name) {
      toast.error(t('toast.llmProfileNameEmpty'));
      return;
    }
    if (!resolveLlmConfig(settings)) {
      toast.error(t('toast.llmProfileIncomplete'));
      return;
    }
    saveProfile(name, { baseUrl, apiKey, modelId });
    setProfileName('');
    toast.success(t('toast.llmProfileSaved', { name }));
  };

  const onDeleteProfile = () => {
    if (!matched) return;
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    setConfirmDel(false);
    deleteProfile(matched.id);
    if (settings.llmActiveProfileId === matched.id) update({ llmActiveProfileId: undefined });
    toast.success(t('toast.llmProfileDeleted', { name: matched.name }));
  };

  const onTest = () => {
    if (testing) return;
    const cfg = resolveLlmConfig(settings);
    if (!cfg) {
      toast.error(t('toast.llmTestFail', { msg: t('settings.llmIncomplete') }));
      return;
    }
    setTesting(true);
    testLlmConnection(cfg)
      .then((reply) => toast.success(t('toast.llmTestOk', { model: reply })))
      .catch((err: unknown) => {
        toast.error(t('toast.llmTestFail', { msg: err instanceof Error ? err.message : String(err) }));
      })
      .finally(() => setTesting(false));
  };

  const inputCls =
    'w-full rounded-xl border border-black/10 bg-surface-hi px-3 py-2 font-mono text-xs text-ink outline-none placeholder:text-ink-2/50 focus:border-accent';

  return (
    <SettingsSection icon={Bot} title={t('settings.llmSection')}>
      <p className="px-0.5 pb-1 text-[11px] leading-relaxed text-ink-2">{t('settings.llmDesc')}</p>
      <SettingRow stacked label={t('settings.llmBaseUrl')}>
        <input
          value={baseUrl}
          onChange={(e) => update({ llmBaseUrl: e.target.value })}
          placeholder={t('settings.llmBaseUrlPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          className={inputCls}
        />
      </SettingRow>
      <SettingRow stacked label={t('settings.llmApiKey')}>
        <div className="flex items-center gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => update({ llmApiKey: e.target.value })}
            placeholder={t('settings.llmApiKeyPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            className={inputCls}
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            aria-label={t('settings.llmKeyToggle')}
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-ink"
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </SettingRow>
      <SettingRow stacked label={t('settings.llmModelId')}>
        <input
          value={modelId}
          onChange={(e) => update({ llmModelId: e.target.value })}
          placeholder={t('settings.llmModelIdPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          className={inputCls}
        />
      </SettingRow>
      <SettingRow stacked label={<InfoTip label={t('settings.llmProfiles')} text={t('settings.llmProfilesDesc')} />}>
        <div className="flex flex-col gap-2">
          {profiles != null && profiles.length > 0 && (
            <Select value={matched?.id ?? CUSTOM_OPTION} onValueChange={applyProfile}>
              <SelectTrigger className="h-9 w-full border-0 bg-surface-hi px-3 text-xs shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="rounded-2xl border-0 bg-card shadow-lg">
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
                <SelectItem value={CUSTOM_OPTION}>{t('settings.llmProfileCustom')}</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2">
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder={t('settings.llmProfileNamePlaceholder')}
              spellCheck={false}
              autoComplete="off"
              className={cn(inputCls, 'flex-1 font-sans')}
            />
            <button
              onClick={onSaveProfile}
              className="shrink-0 whitespace-nowrap px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
            >
              {t('settings.llmProfileSave')}
            </button>
          </div>
          {matched && (
            <button
              onClick={onDeleteProfile}
              className="w-fit text-[11px] font-medium text-red-500 transition-opacity hover:opacity-70"
            >
              {t(confirmDel ? 'settings.llmProfileDeleteConfirm' : 'settings.llmProfileDelete')}
            </button>
          )}
        </div>
      </SettingRow>
      <SettingRow label={t('settings.llmTestDesc')}>
        <button
          onClick={onTest}
          disabled={testing}
          className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-60"
        >
          <PlugZap size={14} />
          {testing ? t('settings.llmTesting') : t('settings.llmTest')}
        </button>
      </SettingRow>
      <SettingRow label={<InfoTip label={t('settings.promptEntry')} text={t('settings.promptEntryDesc')} />}>
        <button
          onClick={onOpenPrompt}
          className="flex items-center gap-0.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          {t('settings.promptOpen')}
          <ChevronRight size={14} />
        </button>
      </SettingRow>
    </SettingsSection>
  );
}
