/** GitHub 连接对话框：设备码 → 用户授权 → 轮询令牌（Device Flow 全程在前端完成） */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  requestDeviceCode, waitForToken, completeConnection,
  type DeviceCodeInfo,
} from '@/lib/backup/github';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';

export function ConnectGithubDialog({
  clientId,
  open,
  onOpenChange,
  onConnected,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConnected: (login: string) => void;
}) {
  useI18n();
  const [code, setCode] = useState<DeviceCodeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);
  // 回调经由 ref 使用，避免父组件每次渲染生成新引用导致流程重启
  // （渲染期写入 ref 是刻意的，与 SeriesChart.propsRef 同一模式）
  const cbRef = useRef({ onConnected, onOpenChange });
  // eslint-disable-next-line react-hooks/refs
  cbRef.current = { onConnected, onOpenChange };

  useEffect(() => {
    if (!open) {
      cancelRef.current = true;
      return;
    }
    cancelRef.current = false;
    setError(null);
    setCode(null);
    setDone(false);
    if (!clientId) {
      setError(t('settings.ghClientIdMissing'));
      return;
    }
    void (async () => {
      try {
        const info = await requestDeviceCode(clientId);
        if (cancelRef.current) return;
        setCode(info);
        const token = await waitForToken(clientId, info, () => cancelRef.current);
        if (cancelRef.current) return;
        const login = await completeConnection(token);
        if (cancelRef.current) return;
        setDone(true);
        cbRef.current.onConnected(login);
        setTimeout(() => {
          if (!cancelRef.current) cbRef.current.onOpenChange(false);
        }, 800);
      } catch (err) {
        if (!cancelRef.current) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelRef.current = true;
    };
  }, [open, clientId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-0 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink">{t('settings.ghDialogTitle')}</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="rounded-xl bg-red-500/10 px-3.5 py-3 text-xs leading-relaxed text-red-500">{error}</p>
        ) : done ? (
          <p className="py-6 text-center text-sm font-medium text-ink">{t('settings.ghDeviceDone')}</p>
        ) : code ? (
          <div className="flex flex-col items-center gap-3.5 py-1">
            <p className="text-xs text-ink-2">{t('settings.ghDeviceStep')}</p>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(code.userCode).then(() => toast.success(t('toast.copied')));
              }}
              className="rounded-2xl bg-surface-hi px-6 py-3 font-mono text-3xl font-bold tracking-[0.28em] text-ink transition-transform active:scale-95"
              title={t('settings.ghDeviceCopyTitle')}
            >
              {code.userCode}
            </button>
            <a
              href={code.verifyUri}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
            >
              {t('settings.ghDeviceOpen')}
            </a>
            <p className="flex items-center gap-1.5 text-[11px] text-ink-2">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              {t('settings.ghDeviceWaiting')}
            </p>
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-ink-2">{t('settings.ghDeviceRequesting')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
