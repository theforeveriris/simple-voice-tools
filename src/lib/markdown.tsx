/**
 * 轻量 Markdown 渲染（AI 助手气泡用）
 * 支持子集：**粗体** / *斜体* / `行内代码`、有序与无序列表、表格、引用（>）、
 * 标题（## …）、分隔线（---）。输出 React 元素（无 dangerouslySetInnerHTML，
 * 文本一律经 React 转义——模型输出不可信内容也安全）。
 * 不追求完整 CommonMark：嵌套仅一层，未知语法按原文输出。
 */

import type { ReactNode } from 'react';

/** 行内解析：粗体 / 斜体 / 行内代码 */
export function parseInline(text: string, keyPrefix = ''): ReactNode[] {
  const out: ReactNode[] = [];
  // 单遍扫描：`code` 优先（内部不再解析标记），随后 **bold**、*italic*
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyPrefix}i${i++}`;
    if (token.startsWith('`')) {
      out.push(
        <code key={key} className="rounded bg-surface-hi px-1 py-0.5 font-mono text-[0.92em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      out.push(<strong key={key} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

interface Line {
  kind: 'h' | 'ul' | 'ol' | 'quote' | 'table' | 'hr' | 'p';
  /** 标题级别（kind=h）；缩进层级（列表） */
  level?: number;
  text: string;
}

/** 逐行分块（列表/表格聚多行；其余逐行） */
function chunk(lines: string[]): Line[] {
  const out: Line[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (/^#{1,4}\s+/.test(line)) {
      out.push({ kind: 'h', level: line.match(/^#+/)![0].length, text: line.replace(/^#+\s+/, '') });
      i++;
      continue;
    }
    if (/^(---+|\*\*\*+)\s*$/.test(line)) {
      out.push({ kind: 'hr', text: '' });
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trimStart())) {
        buf.push(lines[i].trimStart().replace(/^>\s?/, ''));
        i++;
      }
      out.push({ kind: 'quote', text: buf.join('\n') });
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      // 表格：表头 + 分隔行 + 若干数据行
      const rows: string[][] = [];
      const parseRow = (l: string) =>
        l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      rows.push(parseRow(lines[i]));
      i += 2; // 跳过分隔行
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      // 行数组串行化为制表符分隔文本，渲染端再拆
      out.push({ kind: 'table', text: rows.map((r) => r.join('\t')).join('\n') });
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        buf.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      out.push({ kind: 'ul', text: buf.join('\n') });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        buf.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      out.push({ kind: 'ol', text: buf.join('\n') });
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    out.push({ kind: 'p', text: line });
    i++;
  }
  return out;
}

/** Markdown → React 元素（块级结构 + 行内标记） */
export function renderMarkdown(text: string): ReactNode[] {
  const blocks = chunk(text.split('\n'));
  return blocks.map((b, bi) => {
    const key = `b${bi}`;
    switch (b.kind) {
      case 'h': {
        const size = b.level === 1 ? 'text-sm' : 'text-[13px]';
        return <p key={key} className={`mt-1 font-semibold ${size}`}>{parseInline(b.text, key)}</p>;
      }
      case 'hr':
        return <div key={key} className="my-1.5 border-t border-black/10" />;
      case 'quote':
        return (
          <blockquote key={key} className="border-l-2 border-accent/50 pl-2.5 text-ink-2">
            {b.text.split('\n').map((l, li) => <p key={li}>{parseInline(l, `${key}-${li}`)}</p>)}
          </blockquote>
        );
      case 'ul':
        return (
          <ul key={key} className="ml-1 list-disc space-y-0.5 pl-3.5">
            {b.text.split('\n').map((l, li) => <li key={li}>{parseInline(l, `${key}-${li}`)}</li>)}
          </ul>
        );
      case 'ol':
        return (
          <ol key={key} className="ml-1 list-decimal space-y-0.5 pl-4">
            {b.text.split('\n').map((l, li) => <li key={li}>{parseInline(l, `${key}-${li}`)}</li>)}
          </ol>
        );
      case 'table': {
        const rows = b.text.split('\n').map((r) => r.split('\t'));
        const [head, ...body] = rows;
        return (
          <div key={key} className="-mx-0.5 overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  {head.map((c, ci) => (
                    <th key={ci} className="border-b border-black/15 px-2 py-1 text-left font-semibold">{parseInline(c, `${key}h${ci}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className="border-b border-black/[0.06] px-2 py-1">{parseInline(c, `${key}-${ri}-${ci}`)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      default:
        return <p key={key}>{parseInline(b.text, key)}</p>;
    }
  });
}
