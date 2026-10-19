/**
 * 源码编码守卫：识别「UTF-8 字节被当作 GBK 解码」写坏的文件内容。
 *
 * 这种损坏的症状是整行变成 `瑙勫垯鍒ゆ柇` 这样一坨汉字——**仍然是合法 UTF-8**，
 * 所以编辑器、tsc、ESLint、单测全都不报错。历史上它让 AdviceCard.tsx 的注释烂了
 * 16 行而长期无人发现（见 6bc1f04）。
 *
 * 判据是可判定的：把该行按 GBK 反解回原始字节流，再看这段字节流能否解成
 * 一段**正常文本**（ASCII / 汉字 / 中文标点 / 全角 / 箭头 / 希腊字母）。
 * 正常中文行反解出来只会是一堆无意义字节，不会凑成合法 UTF-8 的正常文本。
 *
 * 注意：损坏过程中若有个别字节被丢弃（写成 '?'），反解会出现断点（U+FFFD）。
 * 因此按「断点数 ≤ maxHoles」而不是「零断点」判定——否则带断点的损坏行会漏网
 * （AdviceCard L175 就是这样一行）。
 *
 * 本模块是纯函数，不碰文件系统；遍历仓库由测试（sourceEncoding.test.ts）负责。
 */

/** 可疑行（行号为 1 起始） */
export interface SuspiciousLine {
  line: number;
  text: string;
  reason: 'gbk-mojibake' | 'replacement-char' | 'private-use';
  /** gbk-mojibake 时给出的反解文本（断点处为 U+FFFD） */
  recovered?: string;
}

/** 判定参数：断点上限与「正常文本」所需的最少汉字/中文标点数 */
export interface ScanOptions {
  /** 允许的断点数上限（损坏时会丢字节） */
  maxHoles?: number;
  /** 反解结果里至少要有的汉字/中文标点个数（太少不足以区别于偶然巧合） */
  minCjk?: number;
}

const DEFAULTS: Required<ScanOptions> = { maxHoles: 4, minCjk: 2 };

/** 反解结果里允许出现的字符：cjk = 汉字/中文标点（计数用），neutral = 允许但不计数，bad = 不允许 */
function charKind(n: number): 'cjk' | 'neutral' | 'bad' {
  if (n < 0x80) return 'neutral'; // ASCII（代码、空格、包名等）中性
  if ((n >= 0x4e00 && n <= 0x9fff) || (n >= 0x3400 && n <= 0x4dbf)) return 'cjk';
  if (n >= 0x3000 && n <= 0x303f) return 'cjk'; // 中文标点
  if (n >= 0xff00 && n <= 0xffef) return 'cjk'; // 全角
  if (n >= 0x2190 && n <= 0x21ff) return 'neutral'; // 箭头
  if (n >= 0x0370 && n <= 0x03ff) return 'neutral'; // 希腊字母（Δ 等）
  if (n >= 0x2010 && n <= 0x203a) return 'neutral'; // 破折号/引号/省略号/撇号
  if (n === 0x20ac) return 'neutral'; // GBK 单字节 0x80 的映射
  return 'bad';
}

/** 解码器与反查表（惰性构建；GBK 需要 Node 的 full-icu） */
let pairTable: Map<string, number[]> | null = null;
let singleTable: Map<string, number[]> | null = null;

function gbk(): { dec: TextDecoder; pair: Map<string, number[]>; single: Map<string, number[]> } {
  if (!pairTable || !singleTable) {
    const dec = new TextDecoder('gbk'); // 无 full-icu 时抛 RangeError
    const pair = new Map<string, number[]>();
    for (let hi = 0x81; hi <= 0xfe; hi++) {
      for (let lo = 0x40; lo <= 0xfe; lo++) {
        if (lo === 0x7f) continue;
        const t = dec.decode(Buffer.from([hi, lo]));
        if (t.length === 1 && t !== '\uFFFD' && !pair.has(t)) pair.set(t, [hi, lo]);
      }
    }
    const single = new Map<string, number[]>();
    for (let b = 0x80; b <= 0xff; b++) {
      const t = dec.decode(Buffer.from([b]));
      if (t.length === 1 && t !== '\uFFFD' && !single.has(t)) single.set(t, [b]);
    }
    pairTable = pair;
    singleTable = single;
  }
  return { dec: new TextDecoder('gbk'), pair: pairTable, single: singleTable };
}

/** GBK 解码器是否可用（Node 需要 full-icu 构建；官方发行版默认满足） */
export function gbkDecoderAvailable(): boolean {
  try {
    gbk();
    return true;
  } catch {
    return false;
  }
}

/**
 * 正向生成乱码：把文本按「UTF-8 字节 → GBK 解码」写坏，与历史损坏同一模型。
 * 单字节 0x80 映射为 '€'；无法映射的双字节序列写成 '?'（吞掉 2 字节）。
 * 仅供测试构造样本与说明模型使用。
 */
export function toGbkMojibake(text: string): string {
  const { dec } = gbk();
  const b = Buffer.from(text, 'utf8');
  let out = '';
  let i = 0;
  while (i < b.length) {
    const cur = b[i];
    if (cur < 0x80) { out += String.fromCharCode(cur); i += 1; continue; }
    if (cur === 0x80) { out += '\u20ac'; i += 1; continue; }
    if (i + 1 < b.length) {
      const t = dec.decode(Buffer.from([b[i], b[i + 1]]));
      if (t.length === 1 && t !== '\uFFFD') { out += t; i += 2; continue; }
    }
    out += '?';
    i += 2;
  }
  return out;
}

/** 该行能否反解成正常文本 */
function recover(line: string, opts: Required<ScanOptions>): string | null {
  const { pair, single } = gbk();
  const bytes: number[] = [];
  for (let i = 0; i < line.length; i++) {
    const two = i + 1 < line.length ? line.slice(i, i + 2) : null;
    if (two && pair.has(two)) { bytes.push(...pair.get(two)!); i++; continue; }
    const c = line[i];
    // 断点（损坏时被丢弃的字节）：写入单个非法字节，解码后正好是一个 U+FFFD
    if (c === '?') { bytes.push(0xff); continue; }
    if (single.has(c)) { bytes.push(...single.get(c)!); continue; }
    if (pair.has(c)) { bytes.push(...pair.get(c)!); continue; }
    const n = c.charCodeAt(0);
    if (n < 0x80) { bytes.push(n); continue; }
    return null; // 含无法反解的字符：不是这类乱码
  }
  const txt = Buffer.from(bytes).toString('utf8');
  const holes = (txt.match(/\uFFFD/g) ?? []).length;
  if (holes > opts.maxHoles) return null;
  let cjk = 0;
  for (const c of txt.replace(/\uFFFD+/g, '')) {
    const kind = charKind(c.charCodeAt(0));
    if (kind === 'bad') return null;
    if (kind === 'cjk') cjk++;
  }
  return cjk >= opts.minCjk ? txt : null;
}

/** 扫描一段文本，返回所有可疑行 */
export function findSuspiciousLines(text: string, options: ScanOptions = {}): SuspiciousLine[] {
  const opts = { ...DEFAULTS, ...options };
  const out: SuspiciousLine[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '');
    if (!/[\u0080-\uffff]/.test(raw)) continue; // 纯 ASCII 行不可能
    // 真的出现替换字符：写入时已经丢过信息，无从还原，单独报
    if (raw.includes('\uFFFD')) {
      out.push({ line: i + 1, text: raw, reason: 'replacement-char' });
      continue;
    }
    // 先试反解：能反解出正常文本的，就是被 GBK 重编码写坏的行（诊断信息最完整）
    const recovered = recover(raw, opts);
    if (recovered !== null) {
      out.push({ line: i + 1, text: raw, reason: 'gbk-mojibake', recovered });
      continue;
    }
    // 反解不出：私用区字符在源码里没有正当用途，且常是 GBK 用户自定义区被解出来的痕迹
    const pua = [...raw].find((c) => {
      const n = c.charCodeAt(0);
      return n >= 0xe000 && n <= 0xf8ff;
    });
    if (pua) {
      out.push({ line: i + 1, text: raw, reason: 'private-use' });
    }
  }
  return out;
}
