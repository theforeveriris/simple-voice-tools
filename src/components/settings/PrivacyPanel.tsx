/**
 * 数据去向面板（设置 → 数据 首个区块，只读为主）
 * - 四条静态边界说明：本机存储 / 云备份 / 本地备份 / AI 上传内容
 * - 云备份现状：GitHub 连接、WebDAV 配置、加密开关
 * - AI 请求日志：每次 LLM 调用实际发出的请求体（不含 API Key），可展开、复制、清空
 */

import { useCallback, useEffect, useState } from 'react';
import { Copy, Ellipsis, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getStoredLogin } from '@/lib/backup/github';
import { getWebdavConfig } from '@/lib/backup/webdav';
import { getBackupCryptoConfig, isBackupEncryptionUnlocked } from '@/lib/backup/crypto';
import { clearLlmRequestLog, readLlmRequestLog, type LlmRequestLogEntry } from '@/lib/llmRequestLog';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { localeTag } from '@/i18n';
import { cn } from '@/lib/utils';
import { SettingsSection, SettingRow } from './rows';

export function PrivacyPanel() {
  useI18n();
  const [ghLogin, setGhLogin] = useState<string | null>(null);
  const [webdavOn, setWebdavOn] = useState(false);
  const [encOn, setEncOn] = useState(false);
  const [log, setLog] = useState<LlmRequestLogEntry[] | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setGhLogin(await getStoredLogin());
        setWebdavOn((await getWebdavConfig()) != null);
        setEncOn((await getBackupCryptoConfig())?.enabled === true);
      } catch {
        /* IndexedDB 不可用时保持未知态 */
      }
      setLog(await readLlmRequestLog().catch(() => null));
    })();
  }, []);

  const copyBody = (entry: LlmRequestLogEntry) => {
    void navigator.clipboard?.writeText(entry.body).then(() => toast.success(t('toast.copied')));
  };

  const clearLog = useCallback(() => {
    void clearLlmRequestLog().then(() => {
      setLog([]);
      setOpenIdx(null);
      toast.success(t('toast.llmLogCleared'));
    });
  }, []);

  return (
    <SettingsSection icon={ShieldCheck} title={t('privacy.title')}>
      {/* 数据边界（静态说明） */}
      <div className="flex flex-col gap-1.5 px-1 pb-1 pt-0.5">
        {(['lineLocal', 'lineCloud', 'lineLocalBackup', 'lineLlm'] as const).map((k) => (
          <p key={k} className="flex gap-1.5 text-[11px] leading-relaxed text-ink-2">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-2/50" />
            {t(`privacy.${k}`)}
          </p>
        ))}
      </div>

      {/* 云备份现状 */}
      <SettingRow label={t('privacy.ghRow')} desc={ghLogin ? t('privacy.ghConnected', { login: ghLogin }) : t('privacy.ghNot')} />
      <SettingRow label={t('privacy.webdavRow')} desc={webdavOn ? t('privacy.webdavOn') : t('privacy.webdavOff')} />
      <SettingRow
        label={t('privacy.encRow')}
        desc={!encOn ? t('privacy.encOff') : isBackupEncryptionUnlocked() ? t('privacy.encOn') : t('privacy.encLocked')}
      />

      {/* AI 请求日志 */}
      <div className="mt-1 border-t border-black/[0.04] px-1 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-ink">
            {log && log.length > 0 ? t('privacy.llmLog', { n: log.length }) : t('privacy.llmLogTitle')}
          </p>
          {log && log.length > 0 && (
            <button
              onClick={clearLog}
              className="px-1 py-1 text-[11px] font-medium text-ink-2 transition-opacity hover:opacity-70"
            >
              {t('privacy.llmClear')}
            </button>
          )}
        </div>
        {log == null ? null : log.length === 0 ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-2">{t('privacy.llmEmpty')}</p>
        ) : (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {log.map((e, i) => (
              <div key={`${e.ts}-${i}`} className="rounded-xl bg-surface-hi/70 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setOpenIdx(openIdx === i ? null : i)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] text-ink-2"
                  >
                    {openIdx === i ? <EyeOff size={11} className="shrink-0" /> : <Eye size={11} className="shrink-0" />}
                    <span className="shrink-0 font-medium text-ink">{t(`llmFeature.${e.feature}`)}</span>
                    <span className="shrink-0">{e.model}</span>
                    <span className="truncate">{e.host}</span>
                    <span className="ml-auto shrink-0 tabular-nums">
                      {new Date(e.ts).toLocaleString(localeTag(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                  <button
                    onClick={() => copyBody(e)}
                    aria-label={t('privacy.copyBody')}
                    className="shrink-0 p-1 text-ink-2 transition-opacity hover:opacity-70"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <pre
                  className={cn(
                    'overflow-auto whitespace-pre-wrap break-all rounded-lg bg-card p-2 font-mono text-[10px] leading-relaxed text-ink-2',
                    openIdx === i ? 'mt-1.5 max-h-44' : 'hidden',
                  )}
                >
                  {e.body}
                </pre>
              </div>
            ))}
            <p className="flex items-center gap-1 text-[10px] text-ink-2/70">
              <Ellipsis size={10} />
              {t('privacy.llmLogNote')}
            </p>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
