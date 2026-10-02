/* ------------------------------ 大模型配置（实验性） ------------------------------ */

import { useState } from 'react';
import { Bot, ChevronRight, Eye, EyeOff, PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import { resolveLlmConfig, testLlmConnection } from '@/lib/llm';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings } from '@/types';
import { SettingsSection, SettingRow } from './rows';
import { InfoTip } from './InfoTip';

/** OpenAI 兼容接口参数 + 测试连接 + 提示词入口（Key 仅存本地 IndexedDB kv 仓库） */
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
          value={settings.llmBaseUrl ?? ''}
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
            value={settings.llmApiKey ?? ''}
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
          value={settings.llmModelId ?? ''}
          onChange={(e) => update({ llmModelId: e.target.value })}
          placeholder={t('settings.llmModelIdPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          className={inputCls}
        />
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
