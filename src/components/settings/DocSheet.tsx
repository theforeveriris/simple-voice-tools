/**
 * 文档全屏查看器（关于页 → 任意文档 / 使用说明 / 隐私政策）
 * 统一走 lib/markdown.tsx 的渲染器（doc 尺度）：标题、列表、表格、代码块、
 * 引用、行内标记全支持；内容来自懒加载（documentation/*.md）或 fetch（public/）。
 * 顶栏：返回 + 标题 + 「在 GitHub 查看」/「复制全文」；Esc 与系统返回手势可关闭。
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, BookOpen, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { renderMarkdown } from '@/lib/markdown';
import { registerBackClose } from '@/lib/backNav';

export interface DocSheetProps {
  title: string;
  /** 文档加载器（懒加载或 fetch） */
  load: () => Promise<string>;
  /** 有源文件时显示「在 GitHub 查看」 */
  githubUrl?: string;
  onClose: () => void;
}

export function DocSheet({ title, load, githubUrl, onClose }: DocSheetProps) {
  useI18n();
  // 同一 DocSheet 实例换文档时（key 变更会重建，通常不会）以 md 归属判断加载态；
  // 初始为 null 即「加载中」
  const [md, setMd] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void load()
      .then((text) => { if (alive) setMd(text); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 系统返回 / 侧滑：关闭文档而不是退出应用（与对比浮层同一机制）
  useEffect(() => registerBackClose(onClose), [onClose]);

  const copyAll = () => {
    if (!md) return;
    void navigator.clipboard.writeText(md).then(() => toast.success(t('docs.copied')));
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-noswipe
      className="fixed inset-0 z-[80] overflow-y-auto bg-surface"
    >
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={onClose}
            aria-label={t('common.back')}
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-ink"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-tight text-ink">
            <BookOpen size={17} className="shrink-0 text-accent" />
            <span className="truncate">{title}</span>
          </h1>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {md && (
              <button
                onClick={copyAll}
                aria-label={t('docs.copyAll')}
                title={t('docs.copyAll')}
                className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-ink"
              >
                <Copy size={15} />
              </button>
            )}
            {githubUrl && (
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={t('docs.openGithub')}
                title={t('docs.openGithub')}
                className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-ink"
              >
                <ExternalLink size={15} />
              </a>
            )}
          </div>
        </div>

        {failed ? (
          <p className="py-12 text-center text-sm text-ink-2">{t('docs.loadFail')}</p>
        ) : md == null ? (
          <p className="py-12 text-center text-sm text-ink-2">{t('docs.loading')}</p>
        ) : (
          <div className="flex flex-col gap-1.5 pb-16 text-ink" data-doc-content>
            {renderMarkdown(md, 'doc')}
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
