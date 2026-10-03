import { describe, it, expect } from 'vitest';
import { hexHue } from './dynamic';

describe('hexHue', () => {
  it('标准色相：红 0° / 绿 120° / 蓝 240°', () => {
    expect(hexHue('#FF0000')).toBe(0);
    expect(hexHue('#00FF00')).toBe(120);
    expect(hexHue('#0000FF')).toBe(240);
  });

  it('无 # 前缀等价', () => {
    expect(hexHue('FF7F50')).toBe(hexHue('#FF7F50'));
  });

  it('色相回绕：洋红 300°、黄 60°、青 180°', () => {
    expect(hexHue('#FF00FF')).toBe(300);
    expect(hexHue('#FFFF00')).toBe(60);
    expect(hexHue('#00FFFF')).toBe(180);
  });

  it('低饱和纯灰无色相 → null（回退默认配色）', () => {
    expect(hexHue('#808080')).toBeNull();
    expect(hexHue('#000000')).toBeNull();
    expect(hexHue('#FFFFFF')).toBeNull();
  });

  it('非法输入 → null', () => {
    expect(hexHue('nope')).toBeNull();
    expect(hexHue('#12345')).toBeNull();
    expect(hexHue('')).toBeNull();
  });

  it('接近色相区间边界（如 359°/1°）不串档', () => {
    // 偏橙红（hue≈10）与偏洋红（hue≈350）应分居两侧而不是都归 0
    const a = hexHue('#FF2000')!; // 偏红橙
    const b = hexHue('#FF0040')!; // 偏洋红
    expect(a).toBeLessThan(180);
    expect(b).toBeGreaterThan(180);
  });
});
