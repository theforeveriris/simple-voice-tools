/**
 * Lua 花朵脚本与导出脚本测试
 */

import { describe, expect, it } from 'vitest';
import { normalizeFlower } from './flower';
import { normalizeResult } from './export';

describe('lua flower normalization', () => {
  it('valid script output maps to Flower with clamped values', () => {
    const f = normalizeFlower({
      petals: [
        { angleDeg: 0, length: 1.5, lightness: 0.2, bandHz: 300.7 },
        { angleDeg: 90, length: 0.5, lightness: 0.8 },
      ],
      coreF1: 2, baselineF2: 0.2, tipSharpness: -1,
    }, { petalsFrom: 'template', facts: [] });
    expect(f).not.toBeNull();
    if (!f) return;
    expect(f.petals).toHaveLength(2);
    expect(f.petals[0].length).toBe(1); // 1.5 → clamp 1
    expect(f.petals[0].bandHz).toBe(301);
    expect(f.coreF1).toBe(1.2); // 2 → clamp 1.2
    expect(f.baselineF2).toBe(0.4);
    expect(f.tipSharpness).toBe(0);
    expect(f.basis.facts).toContain('Lua 脚本生成');
  });

  it('missing/empty petals and junk return null', () => {
    expect(normalizeFlower(null, { petalsFrom: 'template', facts: [] })).toBeNull();
    expect(normalizeFlower({ petals: [] }, { petalsFrom: 'template', facts: [] })).toBeNull();
    expect(normalizeFlower({ petals: [{}, 'x'] }, { petalsFrom: 'template', facts: [] })).toBeNull();
    expect(normalizeFlower('no', { petalsFrom: 'template', facts: [] })).toBeNull();
  });

  it('excessive petals are capped', () => {
    const petals = Array.from({ length: 200 }, (_, i) => ({ angleDeg: i, length: 0.5, lightness: 0.5 }));
    const f = normalizeFlower({ petals, coreF1: 0.8, baselineF2: 0.8, tipSharpness: 0.5 }, { petalsFrom: 'template', facts: [] });
    expect(f?.petals.length).toBe(96);
  });
});

describe('lua export normalization', () => {
  it('valid { filename, content } passes through with sanitized name', () => {
    const r = normalizeResult({ filename: 'a/b\\c:d*.praat', content: 'x'.repeat(100) });
    expect(r?.filename).toBe('a_b_c_d_.praat');
    expect(r?.content).toBe('x'.repeat(100));
  });

  it('defaults filename and rejects empty/oversized content', () => {
    expect(normalizeResult({ content: 'hello' })?.filename).toBe('export');
    expect(normalizeResult({ content: '' })).toBeNull();
    expect(normalizeResult({ content: 'x'.repeat(5 * 1024 * 1024) })).toBeNull();
    expect(normalizeResult(null)).toBeNull();
    expect(normalizeResult({ filename: 'a.txt' })).toBeNull();
  });
});
