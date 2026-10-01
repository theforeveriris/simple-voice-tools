/** 存储用量卡片：浏览器配额占用、音频体积与持久化存储状态 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { idbGetAllAudio } from '@/lib/storage/idb';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { fmtBytes } from './rows';

export function StorageUsage() {
  useI18n();
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
      if (granted) toast.success(t('toast.persistGranted'));
      else toast.info(t('toast.persistDenied'));
    } catch {
      toast.error(t('toast.persistFail'));
    }
    refresh();
  };

  return (
    <div className="py-2.5">
      {/* 区块标题由外层 SettingsSection 提供，这里只渲染卡片内容 */}
      {!info ? (
        <p className="text-xs text-ink-2">{t('settings.storageCounting')}</p>
      ) : (
        <div className="rounded-2xl bg-surface-hi/60 px-3.5 py-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-ink-2">{t('settings.storageTotal')}</span>
            <span className="font-semibold tabular-nums text-ink">
              {fmtBytes(info.usage)}
              {info.quota > 0 && <span className="font-normal text-ink-2"> {t('settings.storageQuota', { quota: fmtBytes(info.quota) })}</span>}
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
            {t('settings.storageAudio', { count: info.audioCount, size: fmtBytes(info.audioBytes) })}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-[11px] leading-snug text-ink-2">
              {t('settings.storagePersisted')}
              {persisted == null ? t('settings.persistedUnknown') : persisted ? t('settings.persistedOn') : t('settings.persistedOff')}
            </span>
            {persisted === false && (
              <button
                onClick={requestPersist}
                className="shrink-0 text-xs font-medium text-accent transition-opacity hover:opacity-70"
              >
                {t('settings.requestPersist')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
