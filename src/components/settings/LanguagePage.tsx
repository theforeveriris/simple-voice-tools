/**
 * 语言（设置的子页面）
 * - 界面语言：内置语言（zh-CN / zh-TW / en / ja / 文言）+ AI 翻译语言（已生成时）
 * - AI 翻译（实验性）：用 实验性功能 → 大模型配置 的接口把基准词典翻译成
 *   任意目标语言，词典缓存本地并可切换；未覆盖词条回退简体中文
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Languages, Loader2, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { LOCALES, t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { loadAiCache, clearAiCache, generateAiLocale, hydrateAiLocale } from '@/i18n/aiLocale';
import { resolveLlmConfig } from '@/lib/llm';
import type { AppSettings, Locale } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@/components/ui';
import { SettingsSection, SettingRow } from './rows';
import { InfoTip } from './InfoTip';

export function LanguagePage({
  settings,
  update,
  onBack,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  /** 返回设置主视图（languageOpen 由父组件持有，不持久化） */
  onBack: () => void;
}) {
  useI18n();
  const [draft, setDraft] = useState(settings.aiLanguage ?? '');
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);

  const aiEnabled = settings.aiTranslateEnabled;
  const cache = settings.aiLanguage ? loadAiCache(settings.aiLanguage) : null;
  const aiItemVisible = aiEnabled && cache != null;

  /** 切换语言（AI 项需先确保词典已注册） */
  const setLanguage = (v: Locale) => {
    if (v === 'ai') {
      const c = settings.aiLanguage ? loadAiCache(settings.aiLanguage) : null;
      if (!c) {
        toast.error(t('toast.aiCacheMissing'));
        return;
      }
      // registerAiDict 幂等；词典就绪后切语言（useI18n 随 settings 变化同步 locale）
      hydrateAiLocale(c.label);
      update({ language: 'ai' });
      return;
    }
    update({ language: v });
  };

  /** 生成 / 重新生成 AI 语言词典 */
  const onGenerate = () => {
    if (busy) return;
    const label = draft.trim();
    if (!label) return;
    const cfg = resolveLlmConfig(settings);
    if (!cfg) {
      toast.error(t('toast.aiNeedLlm'));
      return;
    }
    setBusy(true);
    setPct(0);
    void (async () => {
      try {
        const done = await generateAiLocale(label, cfg, setPct);
        update({ aiLanguage: done.label, language: 'ai' });
        setDraft(done.label);
        toast.success(t('toast.aiDone', { label: done.label }));
      } catch (err) {
        toast.error(t('toast.aiFail', { msg: err instanceof Error ? err.message : String(err) }));
      } finally {
        setBusy(false);
      }
    })();
  };

  /** 清除 AI 语言缓存（当前正在使用时回退默认英文） */
  const onClear = () => {
    if (!settings.aiLanguage) return;
    clearAiCache(settings.aiLanguage);
    if (settings.language === 'ai') update({ language: 'en' });
    update({ aiLanguage: undefined });
    toast.success(t('toast.aiCleared'));
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
          <p className="text-base font-semibold text-ink">{t('settings.language')}</p>
        </div>

        {/* 界面语言 */}
        <SettingsSection icon={Languages} title={t('settings.language')}>
          <SettingRow
            label={<InfoTip label={t('settings.language')} text={t('settings.languageDesc')} />}
          >
            <Select
              value={settings.language}
              onValueChange={(v) => setLanguage(v as Locale)}
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
                {aiItemVisible && (
                  <SelectItem value="ai">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={12} className="text-accent" />
                      {t('settings.aiLocaleItem', { label: cache!.label })}
                    </span>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </SettingRow>
        </SettingsSection>

        {/* AI 翻译（实验性） */}
        <SettingsSection icon={Sparkles} title={t('settings.aiTranslate')}>
          <SettingRow label={<InfoTip label={t('settings.aiTranslate')} text={t('settings.aiTranslateDesc')} />}>
            <Switch
              checked={aiEnabled}
              onCheckedChange={(v) => update({ aiTranslateEnabled: v })}
            />
          </SettingRow>
          {aiEnabled && (
            <>
              <SettingRow stacked label={t('settings.aiLanguageLabel')}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('settings.aiLanguagePlaceholder')}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={busy}
                  className="w-full rounded-xl border border-black/10 bg-surface-hi px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-2/50 focus:border-accent disabled:opacity-60"
                />
                {cache && (
                  <p className="px-0.5 text-[10px] leading-relaxed text-ink-2">
                    {t('settings.aiGeneratedInfo', { label: cache.label, n: Object.keys(cache.dict).length, model: cache.model })}
                  </p>
                )}
              </SettingRow>
              <SettingRow
                label={busy ? t('settings.aiGenerating', { pct: Math.round(pct * 100) }) : t('settings.aiGenerate')}
              >
                <button
                  onClick={onGenerate}
                  disabled={busy || !draft.trim()}
                  className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {cache ? t('settings.aiRegenerate') : t('settings.aiGenerate')}
                </button>
              </SettingRow>
              {cache && (
                <SettingRow label={t('settings.aiClear')}>
                  <button
                    onClick={onClear}
                    className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-red-500 transition-opacity hover:opacity-70"
                  >
                    <Trash2 size={14} />
                    {t('settings.aiClear')}
                  </button>
                </SettingRow>
              )}
            </>
          )}
        </SettingsSection>
      </motion.div>
    </div>
  );
}
