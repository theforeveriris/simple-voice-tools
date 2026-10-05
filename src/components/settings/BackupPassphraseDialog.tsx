/**
 * 云备份加密口令对话框
 * - enable / change：新口令 + 确认，双输入（开启时带说明：口令不存储、丢失不可恢复）
 * - unlock：单输入，校验通过后口令仅留在内存供本会话加解密使用
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  enableBackupEncryption, unlockBackupEncryption, MIN_PASSPHRASE_LEN,
} from '@/lib/backup/crypto';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui';

export type PassphraseDialogMode = 'enable' | 'change' | 'unlock';

const inputClass =
  'w-full rounded-xl border border-black/10 bg-surface-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent';

export function BackupPassphraseDialog({
  mode,
  open,
  onOpenChange,
  onDone,
}: {
  mode: PassphraseDialogMode;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 成功（已开启 / 已更换 / 已解锁）后回调 */
  onDone?: () => void;
}) {
  useI18n();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPass('');
      setConfirm('');
      setError(null);
      setBusy(false);
    }
  }, [open, mode]);

  const isUnlock = mode === 'unlock';
  const titleKey = isUnlock ? 'settings.encTitleUnlock' : mode === 'change' ? 'settings.encTitleChange' : 'settings.encTitleEnable';

  const submit = () => {
    if (busy) return;
    void (async () => {
      if (isUnlock) {
        setBusy(true);
        const ok = await unlockBackupEncryption(pass);
        setBusy(false);
        if (!ok) {
          setError(t('settings.encWrongPass'));
          return;
        }
        toast.success(t('toast.encUnlocked'));
        onDone?.();
        onOpenChange(false);
        return;
      }
      if (pass.trim().length < MIN_PASSPHRASE_LEN) {
        setError(t('crypto.errTooShort', { n: MIN_PASSPHRASE_LEN }));
        return;
      }
      if (pass !== confirm) {
        setError(t('settings.encMismatch'));
        return;
      }
      setBusy(true);
      try {
        await enableBackupEncryption(pass);
        toast.success(t('toast.encEnabled'));
        onDone?.();
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-0 bg-card sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-ink">{t(titleKey)}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-ink-2">
            {isUnlock ? t('settings.encUnlockHint') : mode === 'change' ? t('settings.encChangeHint') : t('settings.encEnableHint')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          {error && (
            <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-red-500">{error}</p>
          )}
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder={isUnlock ? t('settings.encPassphrase') : t('settings.encPassphraseNew')}
            autoComplete="new-password"
            autoFocus
            className={inputClass}
          />
          {!isUnlock && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder={t('settings.encPassphraseConfirm')}
              autoComplete="new-password"
              className={inputClass}
            />
          )}
        </div>
        <DialogFooter className="gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full px-4 py-2 text-sm font-medium text-ink-2 transition-opacity hover:opacity-70"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={submit}
            disabled={busy || !pass}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? '…' : isUnlock ? t('settings.encActionUnlock') : t('common.save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
