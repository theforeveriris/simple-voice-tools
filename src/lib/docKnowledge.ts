/**
 * 内置文档知识库（AI 助手的检索语料，实验性）
 * 以 vite ?raw 把 documentation/ 下的核心文档打进应用包（全部离线）：
 *   - PARAMETERS-GUIDE.md（参数说明书：每个指标的含义/参考区间/训练意义——回答
 *     「我的 CPPS 3.2dB 正常吗」这类问题的主力语料）
 *   - REFERENCES.md（参考文献：参考区间的出处）
 *   - ALGORITHM-YIN / FORMANT-LPC / ENERGY / CPPS（算法原理）
 * 检索：把文档按「## 标题」切块，查询时按关键词命中度（词频 × 标题权重）打分，
 * 取前 N 块注入助手系统提示。纯本地零网络，无嵌入模型依赖。
 */

import paramsGuide from '../../documentation/PARAMETERS-GUIDE.md?raw';
import references from '../../documentation/REFERENCES.md?raw';
import algoYin from '../../documentation/ALGORITHM-YIN.md?raw';
import algoLpc from '../../documentation/ALGORITHM-FORMANT-LPC.md?raw';
import algoEnergy from '../../documentation/ALGORITHM-ENERGY.md?raw';
import algoCpps from '../../documentation/ALGORITHM-CPPS.md?raw';

export interface DocChunk {
  /** 所属文档标题 */
  doc: string;
  /** 块标题（## 行；文档开头块为文档名） */
  title: string;
  content: string;
}

/** 块大小上限（字符）：超长块在段落边界截断（文档本身按标题组织，通常不会超） */
const MAX_CHUNK_CHARS = 2600;

const SOURCES: { doc: string; md: string }[] = [
  { doc: '参数说明书', md: paramsGuide },
  { doc: '参考文献', md: references },
  { doc: 'YIN 算法', md: algoYin },
  { doc: 'LPC 共振峰算法', md: algoLpc },
  { doc: '能量分析', md: algoEnergy },
  { doc: 'CPPS 算法', md: algoCpps },
];

/** 段落边界附近截断（回退到最近的空行） */
function clampChunk(s: string): string {
  if (s.length <= MAX_CHUNK_CHARS) return s;
  const cut = s.lastIndexOf('\n\n', MAX_CHUNK_CHARS);
  return cut > MAX_CHUNK_CHARS / 2 ? s.slice(0, cut) : s.slice(0, MAX_CHUNK_CHARS);
}

/** 去掉 Markdown 表格分隔行与链接目标，降低噪声 */
function cleanLine(line: string): string {
  return line
    .replace(/\]\([^)]+\)/g, ']') // 链接 → 仅留文字
    .trimEnd();
}

/** 把一份 Markdown 按 ## 标题切块（### 归入所属 ##） */
function splitDoc(doc: string, md: string): DocChunk[] {
  const chunks: DocChunk[] = [];
  let curTitle = doc;
  let curLines: string[] = [];
  const flush = () => {
    const body = curLines.map(cleanLine).join('\n').trim();
    if (body) chunks.push({ doc, title: curTitle, content: clampChunk(body) });
  };
  for (const raw of md.split('\n')) {
    const m = raw.match(/^##\s+(.+)/);
    if (m) {
      flush();
      curTitle = m[1].trim();
      curLines = [];
    } else {
      curLines.push(raw);
    }
  }
  flush();
  return chunks;
}

export const DOC_CHUNKS: DocChunk[] = SOURCES.flatMap(({ doc, md }) => splitDoc(doc, md));

/* ------------------------------ 检索 ------------------------------ */

/** 提取查询词：中文按 2-gram + 原词，英文/数字按小写词元 */
export function queryTerms(query: string): string[] {
  const terms = new Set<string>();
  for (const raw of query.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length >= 2 && /[\u4e00-\u9fff]/.test(raw)) {
      // 中文词拆 2-gram（「共振峰」→ 共振/振峰/共振峰）
      terms.add(raw);
      for (let i = 0; i + 2 <= raw.length; i++) terms.add(raw.slice(i, i + 2));
    } else if (raw.length >= 2) {
      terms.add(raw);
    }
  }
  return [...terms];
}

function chunkScore(chunk: DocChunk, terms: string[]): number {
  const titleLower = (chunk.doc + ' ' + chunk.title).toLowerCase();
  const bodyLower = chunk.content.toLowerCase();
  let score = 0;
  for (const t of terms) {
    // 标题命中权重高
    if (titleLower.includes(t)) score += 5;
    // 正文命中按次数（封顶 5 次，防长块刷分）
    let hits = 0;
    let idx = bodyLower.indexOf(t);
    while (idx !== -1 && hits < 5) {
      hits++;
      idx = bodyLower.indexOf(t, idx + t.length);
    }
    score += hits * 2;
  }
  return score;
}

/**
 * 检索与查询最相关的文档块（0–4 块，总分 > 0 才返回）。
 * 返回格式化好的系统提示注入段（含来源标注）。
 */
export function retrieveDocs(query: string, maxChunks = 4): string {
  const terms = queryTerms(query);
  if (terms.length === 0) return '';
  const scored = DOC_CHUNKS
    .map((c) => ({ c, s: chunkScore(c, terms) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, maxChunks);
  if (scored.length === 0) return '';
  const sections = scored
    .map(({ c }) => `### ${c.doc}｜${c.title}\n${c.content}`)
    .join('\n\n');
  return `\n\n## 应用内置文档摘录（与问题相关时引用；这是本应用的官方文档，可信度高于你的先验知识；无关时忽略）\n${sections}`;
}

/** 知识库是否可用（文档导入失败时为空数组，注入端静默跳过） */
export function docsAvailable(): boolean {
  return DOC_CHUNKS.length > 0;
}
