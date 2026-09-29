/**
 * 应用内文档阅读器
 * 以对话框形式渲染 Markdown 文档（算法原理/开发者文档）。
 * 内置一个覆盖常用语法的轻量 Markdown 渲染器，无需第三方依赖。
 */

import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

/* ------------------------- 行内元素：`code` **粗体** [链接](url) ------------------------- */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g);
  return parts.filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="bg-surface-hi px-1 py-0.5 text-[0.85em] font-medium text-ink">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
          {link[1]}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

/* ------------------------------- 块级解析 ------------------------------- */

function renderMarkdown(md: string): ReactNode[] {
  const lines = md.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const isTableSep = (l: string) => /^\|[\s:|-]+\|?$/.test(l.trim());

  while (i < lines.length) {
    const line = lines[i];

    // 围栏代码块
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        <pre key={key++} className="my-3 overflow-x-auto bg-surface-hi p-3 text-xs leading-relaxed">
          {lang && <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-ink-2">{lang}</div>}
          <code className="font-mono text-ink">{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = renderInline(heading[2], `h${key}`);
      const cls =
        level === 1 ? 'mt-2 mb-3 text-xl font-semibold text-ink'
        : level === 2 ? 'mt-6 mb-2 text-base font-semibold text-ink'
        : level === 3 ? 'mt-5 mb-1.5 text-sm font-semibold text-ink'
        : 'mt-4 mb-1 text-sm font-medium text-ink';
      out.push(<div key={key++} className={cls}>{text}</div>);
      i++;
      continue;
    }

    // 分隔线
    if (/^---+$/.test(line.trim())) {
      out.push(<hr key={key++} className="my-4 border-black/[0.06]" />);
      i++;
      continue;
    }

    // 引用
    if (line.startsWith('> ')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        buf.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <blockquote key={key++} className="my-3 border-l-2 border-accent/40 pl-3 text-xs leading-relaxed text-ink-2">
          {buf.map((l, j) => <p key={j} className={j > 0 ? 'mt-1' : ''}>{renderInline(l, `q${key}-${j}`)}</p>)}
        </blockquote>,
      );
      continue;
    }

    // 表格
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = line.trim().split('|').slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim().split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push(
        <div key={key++} className="my-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {header.map((h, j) => (
                  <th key={j} className="border-b border-black/[0.08] px-2 py-1.5 text-left font-semibold text-ink">{renderInline(h, `th${key}-${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border-b border-black/[0.04] px-2 py-1.5 align-top text-ink-2">{renderInline(cell, `td${key}-${r}-${c}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // 无序列表
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      out.push(
        <ul key={key++} className="my-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-ink-2">
          {items.map((item, j) => <li key={j}>{renderInline(item, `ul${key}-${j}`)}</li>)}
        </ul>,
      );
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push(
        <ol key={key++} className="my-2 flex list-decimal flex-col gap-1 pl-5 text-sm leading-relaxed text-ink-2">
          {items.map((item, j) => <li key={j}>{renderInline(item, `ol${key}-${j}`)}</li>)}
        </ol>,
      );
      continue;
    }

    // 空行
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 段落（连续普通行合并）
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !/^[-*]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !lines[i].startsWith('> ') &&
      !lines[i].trim().startsWith('|')
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(
      <p key={key++} className="my-2 text-sm leading-relaxed text-ink-2">
        {buf.map((l, j) => <span key={j}>{j > 0 && <br />}{renderInline(l, `p${key}-${j}`)}</span>)}
      </p>,
    );
  }

  return out;
}

/* ------------------------------- 阅读器组件 ------------------------------- */

interface DocViewerProps {
  /** 对话框与文档标题 */
  title: string;
  /** Markdown 源文本 */
  md: string;
  /** 触发按钮（asChild 包裹） */
  trigger: ReactNode;
}

export function DocViewer({ title, md, trigger }: DocViewerProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[82vh] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-card p-6 shadow-xl">
        <DialogTitle className="mb-1 text-lg font-semibold text-ink">{title}</DialogTitle>
        <div className="mt-2">{renderMarkdown(md)}</div>
      </DialogContent>
    </Dialog>
  );
}
