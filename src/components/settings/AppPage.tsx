/**
 * 应用（设置的子页面）
 * - 安装：PWA 一键安装（浏览器支持时）或手动安装指引
 * - 检查更新：手动触发 Service Worker 更新检查，发现新版本自动刷新
 *   （需 HTTPS 生产部署；本地开发服务器无 SW，提示不可用）
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Download, RefreshCw, Smartphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePwaInstall, promptInstall, checkForAppUpdate } from '@/lib/pwa';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { cn } from '@/lib/utils';
import { SettingsSection, SettingRow } from './rows';
import { InfoTip } from './InfoTip';

export function AppPage({
  onBack,
}: {
  /** 返回设置主视图（appOpen 由父组件持有，不持久化） */
  onBack: () => void;
}) {
  useI18n();
  const install = usePwaInstall();
  const [checking, setChecking] = useState(false);

  const onCheckUpdate = () => {
    if (checking) return;
    setChecking(true);
    void (async () => {
      try {
        const result = await checkForAppUpdate();
        if (result === 'unavailable') toast.info(t('toast.updateUnavailable'));
        else if (result === 'found') toast.success(t('toast.updateFound'));
        else toast.success(t('toast.updateLatest'));
      } finally {
        // found 分支页面会刷新；unavailable/latest 恢复按钮
        setChecking(false);
      }
    })();
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
          <p className="text-base font-semibold text-ink">{t('settings.app')}</p>
        </div>

        {/* 安装 */}
        <SettingsSection icon={Smartphone} title={t('settings.app')}>
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
        </SettingsSection>

        {/* 检查更新 */}
        <SettingsSection icon={RefreshCw} title={t('settings.updateSection')}>
          <SettingRow
            label={<InfoTip label={t('settings.checkUpdate')} text={t('settings.checkUpdateDesc')} />}
          >
            <button
              type="button"
              onClick={onCheckUpdate}
              disabled={checking}
              className="flex items-center gap-1.5 px-1 py-2 text-xs font-medium text-accent transition-opacity hover:opacity-70 disabled:opacity-60"
            >
              {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {checking ? t('settings.checkUpdateBusy') : t('settings.checkUpdate')}
            </button>
          </SettingRow>
        </SettingsSection>
      </motion.div>
    </div>
  );
}
