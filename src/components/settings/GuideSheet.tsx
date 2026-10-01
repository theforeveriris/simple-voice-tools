/**
 * 使用说明全屏查看器（关于页 → 使用说明 → 应用内查看）
 * 拉取 public/guide.md（构建时随站点发布，Service Worker 预缓存，离线可读），
 * 用内置的极简 Markdown 渲染器展示（标题 / 列表 / 加粗 / 行内代码 / 分段）。
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';

/** 极简 Markdown 行内渲染：**加粗** 与 `行内代码` */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={i} className="mono rounded bg-surface-hi px-1 text-[11px] text-ink">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

/** 极简 Markdown 块级渲染：#/##/### 标题、- 列表、其余为段落 */
function renderGuide(md: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = [];
  const list: string[] = [];
  let key = 0;
  const flushList = () => {
    if (list.length === 0) return;
    const items = [...list];
    list.length = 0;
    blocks.push(
      <ul key={key++} className="mt-1.5 flex flex-col gap-1">
        {items.map((li, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-ink-2">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent" />
            <span>{inline(li)}</span>
          </li>
        ))}
      </ul>,
    );
  };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (/^- /.test(line)) {
      list.push(line.slice(2));
      continue;
    }
    flushList();
    if (!line.trim() || /^---+$/.test(line.trim())) continue;
    if (line.startsWith('### ')) {
      blocks.push(<h3 key={key++} className="mt-3 text-xs font-semibold text-ink">{inline(line.slice(4))}</h3>);
    } else if (line.startsWith('## ')) {
      blocks.push(
        <h2 key={key++} className="mt-4 border-t border-black/[0.05] pt-3 text-sm font-semibold text-ink">
          {inline(line.slice(3))}
        </h2>,
      );
    } else if (line.startsWith('# ')) {
      blocks.push(<h1 key={key++} className="text-base font-semibold text-ink">{inline(line.slice(2))}</h1>);
    } else {
      blocks.push(<p key={key++} className="mt-1.5 text-xs leading-relaxed text-ink-2">{inline(line)}</p>);
    }
  }
  flushList();
  return blocks;
}

export function GuideSheet({ onClose }: { onClose: () => void }) {
  useI18n();
  const [md, setMd] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}guide.md`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (alive) setMd(text);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] overflow-y-auto bg-surface"
    >
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
            <BookOpen size={19} className="text-accent" />
            {t('settings.guideTitle')}
          </h1>
          <button
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-hi hover:text-ink"
            aria-label={t('common.back')}
          >
            <ArrowLeft size={18} />
          </button>
        </div>
        <div className="rounded-[22px] bg-card p-5 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
          {failed ? (
            <p className="py-12 text-center text-xs text-ink-2">{t('settings.guideLoadFail')}</p>
          ) : md == null ? (
            <p className="py-12 text-center text-xs text-ink-2">…</p>
          ) : (
            renderGuide(md)
          )}
        </div>
      </div>
    </motion.div>
  );
}
