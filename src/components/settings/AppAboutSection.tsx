/** 应用（PWA 一键安装；默认折叠的卡片，头部右侧 chevron 旋转提示展开/收起） */

import { useState } from 'react';
import { Smartphone, Download, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { usePwaInstall, promptInstall } from '@/lib/pwa';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { cn } from '@/lib/utils';
import { SettingRow } from './rows';
import { InfoTip } from './InfoTip';

/** 应用（PWA） */
export function AppSection() {
  useI18n();
  const install = usePwaInstall();
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-[22px] bg-card p-5 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Smartphone size={15} className="text-accent" />
          {t('settings.app')}
        </span>
        {/* 折叠提示：右向 chevron，展开时旋转 90° 指向下 */}
        <ChevronRight
          size={15}
          className={cn('shrink-0 text-ink-2 transition-transform duration-200', open && 'rotate-90')}
        />
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-0.5">
          <SettingRow
            label={<InfoTip label={t('settings.install')} text={t('settings.installManualHint')} />}
          >
            <button
              type="button"
              onClick={async () => {
                if (install.canInstall) {
                  const outcome = await promptInstall();
                  if (outcome === 'dismissed') toast.info(t('toast.installDismissed'));
                  else if (outcome === 'unavailable') toast.info(t('toast.installUnavailable'));
                } else {
                  toast.info(t('settings.installManualHint'));
                }
              }}
              disabled={install.standalone}
              className={cn(
                'flex items-center gap-1.5 px-1 py-2 text-xs font-medium transition-opacity',
                install.standalone ? 'cursor-default text-ink-2/60' : 'text-accent hover:opacity-70',
              )}
            >
              <Download size={14} />
              {install.standalone ? t('settings.installDone') : install.canInstall ? t('settings.installOneClick') : t('settings.installManual')}
            </button>
          </SettingRow>
        </div>
      )}
    </div>
  );
}
