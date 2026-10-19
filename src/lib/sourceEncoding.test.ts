/**
 * 源码编码守卫测试
 *
 * 1) 单元：检测器对「真损坏」「正常文本」「近似但不该命中的文本」的判定；
 * 2) 全仓扫描：src / e2e / scripts / lua-scripts / documentation / public / .github
 *    与仓库根目录的文本文件里，不得存在被 GBK 重编码写坏的行。
 *
 * 样本一律用 toGbkMojibake() 现场生成，测试文件本身不含乱码字面量
 * （否则全仓扫描会命中自己）。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSuspiciousLines, gbkDecoderAvailable, toGbkMojibake } from './sourceEncoding';

describe('源码编码守卫：判定逻辑', () => {
  /** 长中文注释：正向损坏不丢字节，可精确还原 */
  const LONG = '/** 规则判断：本地逐条生成（含训练方向）；两条记录时按 A / B 分组 */';

  it('GBK 解码器可用（官方 Node 带 full-icu）', () => {
    expect(
      gbkDecoderAvailable(),
      'TextDecoder("gbk") 不可用：此守卫依赖 full-icu 的 Node（官方发行版默认满足）',
    ).toBe(true);
  });

  it('正常文本不命中', () => {
    const clean = [
      '  // 基线 Δ 只在单记录（分析页）且非自身时附带',
      "  'assistant.stop': '停止',",
      "  'nav.test': 'テスト',",       // 日文假名
      "  'nav.test': 'тест',",         // 西里尔
      "  'nav.test': '테스트',",       // 韩文
      '  const a = b ? c : d; // 三元：含问号与中文',
      '/** 建议卡通用骨架：标题行 + 内容 + 底部提示 */',
      '  return { name, midi, cents };',
      '  <p>你的音域：{f0} Hz</p>',
    ];
    for (const line of clean) {
      expect(findSuspiciousLines(line), JSON.stringify(line)).toEqual([]);
    }
  });

  it('GBK 重编码产生的乱码命中，且能还原原文', () => {
    const broken = toGbkMojibake(LONG);
    expect(broken).not.toBe(LONG); // 前提：确实被写坏了
    const hits = findSuspiciousLines(broken);
    expect(hits).toHaveLength(1);
    expect(hits[0].reason).toBe('gbk-mojibake');
    expect(hits[0].recovered).toBe(LONG);
  });

  it('多行文本逐行判定，行号正确', () => {
    // 逐行生成再拼接：损坏可能吞掉换行符，逐行构造才能稳定断言行号
    const broken = [toGbkMojibake(LONG), 'const keep = 1;', toGbkMojibake(LONG)].join('\n');
    const hits = findSuspiciousLines(broken);
    expect(hits.map((h) => h.line)).toEqual([1, 3]);
    expect(hits[0].recovered).toBe(LONG);
    expect(hits[1].recovered).toBe(LONG);
  });

  it('单字节 0x80（GBK 的 €）也能还原', () => {
    // 「最」= E6 9C 80，其中 0x80 会被写成 '€'
    const broken = toGbkMojibake('最近设置：最');
    expect(broken).toContain('\u20AC');
    const hits = findSuspiciousLines(broken);
    expect(hits).toHaveLength(1);
    expect(hits[0].recovered).toBe('最近设置：最');
  });

  it('丢字节（断点）的行仍能识别', () => {
    const broken = toGbkMojibake(LONG);
    // 模拟损坏时丢弃的字节：把末尾的乱码字符换成 '?'
    const withHole = broken.slice(0, -1) + '?';
    const hits = findSuspiciousLines(withHole, { maxHoles: 4 });
    expect(hits).toHaveLength(1);
    expect(hits[0].recovered).toContain('规则判断：本地逐条生成');
    // 断点容忍确实是可调开关：收紧到 0 时不再给出反解（退化为私用区提示）
    const strict = findSuspiciousLines(withHole, { maxHoles: 0 });
    expect(strict).toHaveLength(1);
    expect(strict[0].recovered).toBeUndefined();
  });

  it('替换字符与私用区字符单独命中', () => {
    expect(findSuspiciousLines('const a = 1; // \uFFFD').map((h) => h.reason)).toEqual(['replacement-char']);
    // 私用区字符在源码里没有正当用途；反解不出时按此归类
    expect(findSuspiciousLines('const a = 1; // \uE123').map((h) => h.reason)).toEqual(['private-use']);
  });
});

/* --------------------------- 全仓扫描 --------------------------- */

/** 扫描范围：应用源码 + 各类仓库内文本（排除构建产物与依赖） */
const SCAN_ROOTS = ['src', 'e2e', 'scripts', 'lua-scripts', 'documentation', 'public', '.github'];
const SCAN_EXTS = new Set([
  '.ts', '.tsx', '.mts', '.js', '.mjs', '.json', '.css',
  '.md', '.html', '.txt', '.yml', '.yaml', '.lua',
]);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'docs', 'dist', 'test-results', 'playwright-report', '.openchamber', 'target', 'build',
]);

/** 仓库根目录：本测试在 src/lib/ 下，向上两级（不依赖进程 cwd） */
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function collectFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (SCAN_EXTS.has(extname(e.name))) out.push(full);
    }
  };
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root));
  // 仓库根目录下的文本文件（README 等）
  for (const e of readdirSync(REPO_ROOT, { withFileTypes: true })) {
    if (e.isFile() && SCAN_EXTS.has(extname(e.name))) out.push(join(REPO_ROOT, e.name));
  }
  return out;
}

describe('源码编码守卫：全仓扫描', () => {
  it('没有任何文件被 GBK 重编码写坏', () => {
    const files = collectFiles();
    expect(files.length).toBeGreaterThan(100); // 扫描范围没被写坏导致空扫

    const problems: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const hit of findSuspiciousLines(text)) {
        problems.push(
          `${file}:${hit.line}  [${hit.reason}]\n`
          + `    现状: ${hit.text.slice(0, 120)}\n`
          + (hit.recovered ? `    疑似原文: ${hit.recovered.slice(0, 120)}\n` : ''),
        );
      }
    }

    expect(
      problems,
      problems.length === 0
        ? ''
        : `发现 ${problems.length} 行疑似被 GBK 重编码写坏（UTF-8 字节被当 GBK 解码）。\n`
          + '这类损坏仍是合法 UTF-8，编辑器与 tsc/eslint 都不会报错。\n'
          + '修复方式：把该行按上面的「疑似原文」改回（参见 6bc1f04 的做法）。\n\n'
          + problems.join('\n'),
    ).toEqual([]);
  }, 300000);
});
