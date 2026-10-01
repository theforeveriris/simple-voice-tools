/* ------------------------------ 大模型配置（实验性） ------------------------------ */

import { useState } from 'react';
import { Bot, Eye, EyeOff, PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import { resolveLlmConfig, testLlmConnection } from '@/lib/llm';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import type { AppSettings } from '@/types';
import { SettingsSection, SettingRow } from './rows';

/** OpenAI 兼容接口参数 + 测试连接（Key 仅存本地 localStorage） */
export function LlmConfigSection({
  settings,
  update,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
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
    </SettingsSection>
  );
}
