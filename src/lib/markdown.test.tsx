import { describe, it, expect } from 'vitest';
import { renderMarkdown, parseInline } from './markdown';
import { renderAssistantContent } from './assistantCharts';
// renderMarkdown 返回 React 元素——这里验证结构，用 react-dom/server 的 renderToStaticMarkup
// 做文本级断言（vitest 环境无 DOM，用静态渲染）
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, Fragment } from 'react';

const html = (nodes: React.ReactNode[]) => renderToStaticMarkup(createElement(Fragment, null, nodes));

describe('parseInline', () => {
  it('粗体 / 斜体 / 行内代码', () => {
    expect(html(parseInline('a **b** c'))).toContain('<strong');
    expect(html(parseInline('a **b** c'))).toContain('</strong>');
    expect(html(parseInline('a *b* c'))).toContain('<em>b</em>');
    expect(html(parseInline('a `b` c'))).toContain('<code');
  });

  it('无标记文本原样输出（HTML 特殊字符由 React 转义）', () => {
    expect(html(parseInline('<script>'))).toBe('&lt;script&gt;');
  });
});

describe('renderMarkdown', () => {
  it('无序列表', () => {
    const h = html(renderMarkdown('- a\n- b'));
    expect(h).toContain('<ul');
    expect(h).toContain('<li>a</li>');
    expect(h).toContain('<li>b</li>');
  });

  it('有序列表', () => {
    const h = html(renderMarkdown('1. x\n2. y'));
    expect(h).toContain('<ol');
    expect(h).toContain('<li>x</li>');
  });

  it('表格（表头 + 数据行）', () => {
    const h = html(renderMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |'));
    expect(h).toContain('<th');
    expect(h).toContain('<td');
    expect(h).toContain('A');
    expect(h).toContain('2');
  });

  it('引用与标题', () => {
    const h = html(renderMarkdown('> quote\n## Head'));
    expect(h).toContain('<blockquote');
    expect(h).toContain('Head');
  });

  it('普通段落不加列表结构', () => {
    const h = html(renderMarkdown('plain text'));
    expect(h).not.toContain('<ul');
    expect(h).toContain('plain text');
  });
});

describe('renderAssistantContent', () => {
  it('record:// 引用切分为图片部分', () => {
    const parts = renderAssistantContent('看这张 ![第一次测试](record://abc-123/pitch) 说明趋势。');
    expect(parts).toHaveLength(3);
    expect(parts[1].type).toBe('img');
    expect(parts[1].recordId).toBe('abc-123');
    expect(parts[1].kind).toBe('pitch');
    expect(parts[1].alt).toBe('第一次测试');
  });

  it('未知 kind 仍切分（kind undefined，渲染端显示占位）', () => {
    const parts = renderAssistantContent('前缀 ![](record://abc/unknown)');
    expect(parts[1].type).toBe('img');
    expect(parts[1].recordId).toBe('abc');
    expect(parts[1].kind).toBeUndefined();
  });

  it('无引用时整体为 markdown', () => {
    const parts = renderAssistantContent('plain');
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('md');
  });
});
