import { describe, it, expect } from 'vitest';
import { buildTokens, presetSpec } from './monet';

/**
 * 回归：ok() 曾漏掉右括号，运行时写入的 --c-* 全是非法 oklch，
 * CSS 自定义属性不报错，但 Canvas / var() 消费方会静默失效。
 */
describe('buildTokens', () => {
  const cases = [
    { name: 'monet light', hue: 210, dark: false, accent: 210, spec: null },
    { name: 'monet dark', hue: 210, dark: true, accent: 320, spec: null },
    {
      name: 'pride',
      hue: 0,
      dark: false,
      accent: 0,
      get spec() {
        return presetSpec('pride', 0, 'transPride').spec;
      },
    },
  ];

  for (const c of cases) {
    it(`${c.name}：所有 oklch 令牌括号闭合且可被 CSS 解析`, () => {
      const tokens = buildTokens(c.hue, c.dark, c.accent, c.spec);
      const oklchTokens = Object.entries(tokens).filter(
        ([k]) => k.startsWith('--c-') && !k.endsWith('-rgb'),
      );
      expect(oklchTokens.length).toBeGreaterThan(0);
      for (const [key, value] of oklchTokens) {
        expect(value, key).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
      }
    });
  }

  it('rgb 三元组仍是 "r g b" 形态', () => {
    const tokens = buildTokens(210, false);
    expect(tokens['--c-accent-rgb']).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });
});
