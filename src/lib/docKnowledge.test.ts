import { describe, it, expect } from 'vitest';
import { loadChunks, queryTerms, retrieveDocs, docsAvailable } from './docKnowledge';

describe('docsAvailable / loadChunks', () => {
  it('文档语料非空，且全部带 doc/title/content', async () => {
    expect(await docsAvailable()).toBe(true);
    const chunks = await loadChunks();
    expect(chunks.length).toBeGreaterThan(10);
    for (const c of chunks) {
      expect(c.doc.length).toBeGreaterThan(0);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.content.length).toBeGreaterThan(0);
    }
  });

  it('参数说明书包含 CPPS / Jitter 等核心章节', async () => {
    const joined = (await loadChunks()).map((c) => c.title).join('|');
    expect(joined).toContain('CPPS');
    expect(joined).toContain('Jitter');
  });
});

describe('queryTerms', () => {
  it('中文拆 2-gram + 原词', () => {
    const terms = queryTerms('共振峰');
    expect(terms).toContain('共振峰');
    expect(terms).toContain('共振');
    expect(terms).toContain('振峰');
  });

  it('英文小写词元', () => {
    const terms = queryTerms('What is CPPS?');
    expect(terms).toContain('cpps');
    expect(terms).toContain('what');
  });

  it('单字符与标点被过滤', () => {
    expect(queryTerms('a , 。！')).toHaveLength(0);
  });
});

describe('retrieveDocs', () => {
  it('CPPS 查询命中 CPPS 相关块', async () => {
    const out = await retrieveDocs('我的 CPPS 3.2dB 正常吗');
    expect(out).toContain('CPPS');
    expect(out).toContain('内置文档摘录');
    // 注入文档本体内容
    expect(out.length).toBeGreaterThan(200);
  });

  it('Jitter 查询命中微扰章节', async () => {
    const out = await retrieveDocs('Jitter 偏高说明什么');
    expect(out.toLowerCase()).toContain('jitter');
  });

  it('无关查询返回空串', async () => {
    expect(await retrieveDocs('Hello World 123')).toBe('');
    expect(await retrieveDocs('')).toBe('');
  });

  it('命中块数不超过 maxChunks', async () => {
    const out = await retrieveDocs('音高基频F0共振峰能量CPPS Jitter微扰', 2);
    // 注入格式固定为 '### {doc}｜{title}'（doc 与 title 间用全角竖线）；正文里的 ### 行无竖线
    const entries = (out.match(/^### .+｜/gm) ?? []).length;
    expect(entries).toBeLessThanOrEqual(2);
    expect(entries).toBeGreaterThan(0);
  });
});
