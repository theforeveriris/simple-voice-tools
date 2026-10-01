/* ------------------------------ GitHub 云备份 ------------------------------ */

import { useCallback, useEffect, useState } from 'react';
import { Cloud, Link2, Unlink, CloudUpload, CloudDownload } from 'lucide-react';
import { toast } from 'sonner';
import {
  disconnectGithub, getStoredLogin, getLastPush, pushBackup, pullBackup, DEFAULT_REPO,
} from '@/lib/backup/github';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { localeTag } from '@/i18n';
import type { AppSettings } from '@/types';
import { cn } from '@/lib/utils';
import { SettingsSection, SettingRow } from './rows';
import { ConnectGithubDialog } from './ConnectGithubDialog';

/** GitHub 云备份区块：持有全部连接 / 推送 / 恢复状态，并挂载 Device Flow 连接对话框 */
export function GithubBackupSection({
  settings,
  update,
}: {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}) {
  useI18n();
  // GitHub 云备份
  const [ghLogin, setGhLogin] = useState<string | null>(null);
  const [ghChecking, setGhChecking] = useState(true);
  const [ghBusy, setGhBusy] = useState<'push' | 'pull' | null>(null);
  const [ghProgress, setGhProgress] = useState('');
  const [ghLastPush, setGhLastPush] = useState<number | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

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

  return (
    <>
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

      <ConnectGithubDialog
        clientId={clientId}
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={onGhConnected}
      />
    </>
  );
}
