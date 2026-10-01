/** 应用（PWA 一键安装）与关于（版本、隐私说明、算法文档链接） */

import { Smartphone, Info, Download, BookOpen, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { usePwaInstall, promptInstall } from '@/lib/pwa';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { cn } from '@/lib/utils';
import { SettingsSection, SettingRow } from './rows';

const DOC_BASE_URL = 'https://github.com/theforeveriris/simple-voice-tools/blob/main/documentation';
const DOC_ENTRIES: { titleKey: 'settings.docYinTitle' | 'settings.docLpcTitle' | 'settings.docEnergyTitle' | 'settings.docCppsTitle' | 'settings.docDevTitle'; descKey: 'settings.docYinDesc' | 'settings.docLpcDesc' | 'settings.docEnergyDesc' | 'settings.docCppsDesc' | 'settings.docDevDesc'; file: string }[] = [
  { titleKey: 'settings.docYinTitle', descKey: 'settings.docYinDesc', file: 'ALGORITHM-YIN.md' },
  { titleKey: 'settings.docLpcTitle', descKey: 'settings.docLpcDesc', file: 'ALGORITHM-FORMANT-LPC.md' },
  { titleKey: 'settings.docEnergyTitle', descKey: 'settings.docEnergyDesc', file: 'ALGORITHM-ENERGY.md' },
  { titleKey: 'settings.docCppsTitle', descKey: 'settings.docCppsDesc', file: 'ALGORITHM-CPPS.md' },
  { titleKey: 'settings.docDevTitle', descKey: 'settings.docDevDesc', file: 'DEVELOPMENT.md' },
];

/** 应用（PWA） */
export function AppSection() {
  useI18n();
  const install = usePwaInstall();

  return (
    <SettingsSection icon={Smartphone} title={t('settings.app')}>
      <SettingRow label={t('settings.install')}>
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
  );
}

/** 关于 */
export function AboutSection() {
  useI18n();

  return (
    <SettingsSection icon={Info} title={t('settings.about')}>
      <div className="pt-1 text-xs leading-relaxed text-ink-2">
        <p className="text-sm font-semibold text-ink">Simple Voice Tool</p>
        <p className="mt-1">{t('settings.aboutVersion')}</p>
        <p className="mt-1">{t('settings.aboutPrivacy')}</p>
      </div>

      {/* 文档：点击跳转到 GitHub 仓库内对应源文件 */}
      <div className="mt-2 flex flex-col text-left">
        <p className="pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-2">{t('settings.docs')}</p>
        {DOC_ENTRIES.map((doc) => (
          <a
            key={doc.titleKey}
            href={`${DOC_BASE_URL}/${doc.file}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 border-t border-black/[0.04] py-3 text-sm font-medium text-ink transition-colors first:border-t-0 hover:text-accent"
          >
            <span className="flex min-w-0 items-center gap-2 text-left">
              <BookOpen size={14} className="shrink-0 text-accent" />
              <span className="truncate">
                {t(doc.titleKey)}
                <span className="ml-2 text-[11px] font-normal text-ink-2">{t(doc.descKey)}</span>
              </span>
            </span>
            <ChevronRight size={15} className="shrink-0 text-ink-2" />
          </a>
        ))}
      </div>
    </SettingsSection>
  );
}
