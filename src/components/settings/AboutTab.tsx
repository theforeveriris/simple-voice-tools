/**
 * 关于（设置主视图的「关于」标签页）
 * - 开发者与贡献者：置顶，头像点击跳转其 GitHub 主页
 * - 应用简介：版本与隐私说明（免责声明在进入本页时自动弹窗）
 * - 文档：使用说明（参数说明书）+ 开发者文档（算法与架构，GitHub 源文件链接）
 */

import { useState } from 'react';
import { BookOpen, ChevronRight, HeartHandshake, Info, Code2, GraduationCap } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { GuideSheet } from './GuideSheet';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui';
import { SettingsSection } from './rows';

const DOC_BASE_URL = 'https://github.com/theforeveriris/simple-voice-tools/blob/main/documentation';

interface DocEntry {
  titleKey: 'settings.docGuideTitle' | 'settings.docYinTitle' | 'settings.docLpcTitle' | 'settings.docEnergyTitle' | 'settings.docCppsTitle' | 'settings.docDevTitle'
    | 'settings.docI18nTitle' | 'settings.docThemeTitle' | 'settings.docStateTitle' | 'settings.docSettingsTitle' | 'settings.docPwaTitle';
  descKey: 'settings.docGuideDesc' | 'settings.docYinDesc' | 'settings.docLpcDesc' | 'settings.docEnergyDesc' | 'settings.docCppsDesc' | 'settings.docDevDesc'
    | 'settings.docI18nDesc' | 'settings.docThemeDesc' | 'settings.docStateDesc' | 'settings.docSettingsDesc' | 'settings.docPwaDesc';
  file: string;
}

/** 使用说明（面向使用者的参数与结果解读） */
const USER_DOC_ENTRIES: DocEntry[] = [
  { titleKey: 'settings.docGuideTitle', descKey: 'settings.docGuideDesc', file: 'PARAMETERS-GUIDE.md' },
];

/** 开发者文档（算法与架构） */
const DEV_DOC_ENTRIES: DocEntry[] = [
  { titleKey: 'settings.docDevTitle', descKey: 'settings.docDevDesc', file: 'DEVELOPMENT.md' },
  { titleKey: 'settings.docI18nTitle', descKey: 'settings.docI18nDesc', file: 'ARCHITECTURE-I18N.md' },
  { titleKey: 'settings.docThemeTitle', descKey: 'settings.docThemeDesc', file: 'ARCHITECTURE-THEME.md' },
  { titleKey: 'settings.docStateTitle', descKey: 'settings.docStateDesc', file: 'ARCHITECTURE-STATE.md' },
  { titleKey: 'settings.docSettingsTitle', descKey: 'settings.docSettingsDesc', file: 'ARCHITECTURE-SETTINGS.md' },
  { titleKey: 'settings.docPwaTitle', descKey: 'settings.docPwaDesc', file: 'GUIDE-PWA.md' },
  { titleKey: 'settings.docYinTitle', descKey: 'settings.docYinDesc', file: 'ALGORITHM-YIN.md' },
  { titleKey: 'settings.docLpcTitle', descKey: 'settings.docLpcDesc', file: 'ALGORITHM-FORMANT-LPC.md' },
  { titleKey: 'settings.docEnergyTitle', descKey: 'settings.docEnergyDesc', file: 'ALGORITHM-ENERGY.md' },
  { titleKey: 'settings.docCppsTitle', descKey: 'settings.docCppsDesc', file: 'ALGORITHM-CPPS.md' },
];

function DocList({ entries }: { entries: DocEntry[] }) {
  return (
    <>
      {entries.map((doc) => (
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
    </>
  );
}

/** 开发者与贡献者名单（头像取 GitHub，点击跳转其主页；新贡献者追加到对应数组即可） */
const DEVELOPERS = [{ name: '鸢尾 theforeveriris', handle: 'theforeveriris' }];
const CONTRIBUTORS = [{ name: 'HuLunTunTao', handle: 'HuLunTunTao' }];

function PersonRow({ person, roleKey }: { person: { name: string; handle: string }; roleKey: 'role.developer' | 'role.contributor' }) {
  return (
    <a
      href={`https://github.com/${person.handle}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 border-t border-black/[0.04] py-2.5 first:border-t-0"
    >
      <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft">
        <span className="text-sm font-semibold text-on-accent-soft" aria-hidden>{person.name[0]}</span>
        <img
          src={`https://github.com/${person.handle}.png?size=80`}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{person.name}</span>
        <span className="block text-[11px] text-ink-2">{t(roleKey)}</span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-ink-2" />
    </a>
  );
}

export function AboutTab() {
  useI18n();
  // 免责声明：每次进入关于标签页自动弹出（本组件随标签切换挂载/卸载）
  const [disclaimerOpen, setDisclaimerOpen] = useState(true);
  // 使用说明（guide.md 应用内查看）
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3.5">
      {/* 免责声明弹窗 */}
      <Dialog open={disclaimerOpen} onOpenChange={setDisclaimerOpen}>
        <DialogContent className="rounded-3xl border-0 bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-ink">{t('settings.disclaimerTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-xs leading-relaxed text-ink-2">{t('settings.aboutDisclaimer')}</p>
          <button
            onClick={() => setDisclaimerOpen(false)}
            className="mt-1 w-full rounded-full bg-accent py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            {t('common.ok')}
          </button>
        </DialogContent>
      </Dialog>

      {/* 开发者与贡献者（置顶） */}
      <SettingsSection icon={HeartHandshake} title={t('settings.developers')}>
        {DEVELOPERS.map((p) => <PersonRow key={p.handle} person={p} roleKey="role.developer" />)}
        {CONTRIBUTORS.map((p) => <PersonRow key={p.handle} person={p} roleKey="role.contributor" />)}
      </SettingsSection>

      {/* 应用简介 */}
      <SettingsSection icon={Info} title={t('settings.intro')}>
        <div className="pt-1 text-xs leading-relaxed text-ink-2">
          <p className="text-sm font-semibold text-ink">Simple Voice Tool</p>
          <p className="mt-1">{t('settings.aboutVersion')}</p>
          <p className="mt-1">{t('settings.aboutPrivacy')}</p>
        </div>
      </SettingsSection>

      {/* 文档：使用说明（应用内查看 guide.md）+ 开发者文档（GitHub 仓库内源文件） */}
      <SettingsSection icon={GraduationCap} title={t('settings.userDocs')}>
        <button
          onClick={() => setGuideOpen(true)}
          className="flex w-full items-center justify-between gap-2 py-3 text-left first:border-t-0"
        >
          <span className="flex min-w-0 items-center gap-2">
            <BookOpen size={14} className="shrink-0 text-accent" />
            <span className="truncate">
              {t('settings.guideTitle')}
              <span className="ml-2 text-[11px] font-normal text-ink-2">{t('settings.guideDesc')}</span>
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium text-accent">{t('settings.guideOpen')}</span>
        </button>
        <DocList entries={USER_DOC_ENTRIES} />
      </SettingsSection>
      <SettingsSection icon={Code2} title={t('settings.devDocs')}>
        <DocList entries={DEV_DOC_ENTRIES} />
      </SettingsSection>

      {/* 使用说明（全屏查看器）；AnimatePresence 让关闭时的退出淡出真正播放 */}
      <AnimatePresence>
        {guideOpen && <GuideSheet onClose={() => setGuideOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
