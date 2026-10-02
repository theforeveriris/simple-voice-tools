import { describe, it, expect } from 'vitest';
import { parseGlossary, buildAiLocalePayload, parseAiLocalePayload, aiSlug } from './aiLocale';
import { zhCN } from './zh-CN';

const base = zhCN as unknown as Record<string, string>;
const sampleKey = Object.keys(base)[0];
const sampleValue = base[sampleKey];

describe('parseGlossary', () => {
  it('支持 = / → / : 三种分隔与空行忽略', () => {
    expect(parseGlossary('共振峰 = formant\n嗓音 → voice\n基频: pitch')).toEqual([
      ['共振峰', 'formant'],
      ['嗓音', 'voice'],
      ['基频', 'pitch'],
    ]);
  });

  it('残缺行与空输入忽略', () => {
    expect(parseGlossary('只有一边\n\n  = 空 \n正常 = ok')).toEqual([['正常', 'ok']]);
    expect(parseGlossary(undefined)).toEqual([]);
    expect(parseGlossary('')).toEqual([]);
  });
});

describe('aiSlug', () => {
  it('归一为小写连字符并兜底', () => {
    expect(aiSlug('Deutsch')).toBe('deutsch');
    expect(aiSlug(' 简体 中文 ')).not.toContain(' ');
    expect(aiSlug('日本語')).toBe('custom'); // 无字母数字 → 兜底
  });
});

describe('词典分享 payload', () => {
  it('build → parse 往返一致', () => {
    const cache = { label: 'Deutsch', dict: { [sampleKey]: 'Übersetzung' }, model: 'test-model', at: 12345 };
    const json = JSON.stringify(buildAiLocalePayload(cache));
    const parsed = parseAiLocalePayload(json);
    expect(parsed.label).toBe('Deutsch');
    expect(parsed.dict[sampleKey]).toBe('Übersetzung');
    expect(parsed.model).toBe('test-model');
    expect(parsed.at).toBe(12345);
  });

  it('dict 中不属于基准的键被过滤', () => {
    const cache = { label: 'X', dict: { [sampleKey]: sampleValue, bogusKey: 'x' }, model: 'm', at: 1 };
    const parsed = parseAiLocalePayload(JSON.stringify(buildAiLocalePayload(cache)));
    expect(parsed.dict[sampleKey]).toBe(sampleValue);
    expect('bogusKey' in parsed.dict).toBe(false);
  });

  it('kind / app / 版本过新 / 缺 label 均拒绝', () => {
    const good = buildAiLocalePayload({ label: 'X', dict: {}, model: 'm', at: 1 });
    expect(() => parseAiLocalePayload(JSON.stringify({ ...good, kind: 'records' }))).toThrow();
    expect(() => parseAiLocalePayload(JSON.stringify({ ...good, app: 'other' }))).toThrow();
    expect(() => parseAiLocalePayload(JSON.stringify({ ...good, version: 99 }))).toThrow();
    expect(() => parseAiLocalePayload(JSON.stringify({ ...good, label: '  ' }))).toThrow();
    expect(() => parseAiLocalePayload('not json')).toThrow();
  });
});
