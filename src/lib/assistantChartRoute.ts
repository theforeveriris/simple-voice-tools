/**
 * record:// 图片引用的文本路由（纯字符串层，可单测、无 window 依赖）
 * 语法：![alt](record://<recordId>/<kind>)
 * 渲染组件见 assistantCharts.tsx（RecordImage）。
 */

const KINDS = ['pitch', 'formant', 'energy', 'vowel'] as const;
export type ImgKind = (typeof KINDS)[number];

export function isImgKind(v: string): v is ImgKind {
  return (KINDS as readonly string[]).includes(v);
}

/**
 * 文本 → 分段：record:// 图片引用独立成段，其余走 Markdown。
 */
export function renderAssistantContent(text: string): { type: 'md' | 'img'; content: string; alt?: string; recordId?: string; kind?: ImgKind }[] {
  const parts: { type: 'md' | 'img'; content: string; alt?: string; recordId?: string; kind?: ImgKind }[] = [];
  // 记录 id 可能是 crypto.randomUUID()，也可能是非安全上下文下的
  // `${Date.now()}-${Math.random()}` 兜底（含小数点），两种都要能匹配
  const re = /!\[([^\]]*)\]\(record:\/\/([A-Za-z0-9_.-]+)\/(\w+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'md', content: text.slice(last, m.index) });
    const kind = m[3];
    parts.push({
      type: 'img',
      content: m[0],
      alt: m[1],
      recordId: m[2],
      kind: isImgKind(kind) ? kind : undefined,
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'md', content: text.slice(last) });
  return parts;
}
