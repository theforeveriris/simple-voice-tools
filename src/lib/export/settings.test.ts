import { describe, it, expect } from 'vitest';
import {
  buildSettingsPayload, parseSettingsPayload, SETTINGS_FORMAT_VERSION,
} from './settings';
import { DEFAULT_SETTINGS } from '@/constants';
import type { AppSettings } from '@/types';

const SAMPLE: AppSettings = {
  ...DEFAULT_SETTINGS,
  hue: 210,
  language: 'en',
  targetEnabled: true,
  targetF0Min: 155,
  targetF0Max: 230,
  bandBounds: [90, 170, 185, 260],
  githubClientId: 'Iv23lixxxx',
};

describe('buildSettingsPayload', () => {
  it('生成 app/kind/version/exportedAt/settings 结构', () => {
    const p = buildSettingsPayload(SAMPLE);
    expect(p.app).toBe('simple-voice-tools');
    expect(p.kind).toBe('settings');
    expect(p.version).toBe(SETTINGS_FORMAT_VERSION);
    expect(typeof p.exportedAt).toBe('string');
    expect(p.settings.hue).toBe(210);
  });
});

describe('parseSettingsPayload', () => {
  it('round-trip：导出再导入得到等价设置', () => {
    const parsed = parseSettingsPayload(JSON.stringify(buildSettingsPayload(SAMPLE)));
    expect(parsed.hue).toBe(210);
    expect(parsed.language).toBe('en');
    expect(parsed.targetF0Min).toBe(155);
    expect(parsed.bandBounds).toEqual([90, 170, 185, 260]);
    expect(parsed.githubClientId).toBe('Iv23lixxxx');
    expect(parsed.mobileSpark).toBe(true);
  });

  it('拒绝非 JSON 与 kind 不符的内容', () => {
    expect(() => parseSettingsPayload('not json{')).toThrow();
    expect(() => parseSettingsPayload(JSON.stringify({ kind: 'records', settings: {} }))).toThrow();
    expect(() => parseSettingsPayload(JSON.stringify({ settings: {} }))).toThrow();
  });

  it('拒绝缺失 settings 对象与更新版本', () => {
    expect(() => parseSettingsPayload(JSON.stringify({ kind: 'settings' }))).toThrow();
    expect(() =>
      parseSettingsPayload(JSON.stringify({ kind: 'settings', version: SETTINGS_FORMAT_VERSION + 1, settings: {} })),
    ).toThrow(/v\d/);
    // 当前版本可读
    expect(() =>
      parseSettingsPayload(JSON.stringify({ kind: 'settings', version: SETTINGS_FORMAT_VERSION, settings: {} })),
    ).not.toThrow();
  });

  it('白名单：未知字段与类型不符字段被忽略', () => {
    const parsed = parseSettingsPayload(JSON.stringify({
      kind: 'settings',
      version: 1,
      settings: {
        ...DEFAULT_SETTINGS,
        evilKey: 'x',
        hue: 'not-a-number', // 类型不符 → 忽略，保持默认
        showGrid: 'yes',     // 类型不符 → 忽略
      },
    }));
    expect(parsed).not.toHaveProperty('evilKey');
    expect(parsed.hue).toBeUndefined();
    expect(parsed.showGrid).toBeUndefined();
    expect(parsed.maxDurationSec).toBe(DEFAULT_SETTINGS.maxDurationSec);
  });

  it('数值夹取：hue 与训练靶标越界被限制', () => {
    const parsed = parseSettingsPayload(JSON.stringify({
      kind: 'settings',
      version: 1,
      settings: { hue: 999, targetF0Min: 1, targetF0Max: 9999 },
    }));
    expect(parsed.hue).toBe(360);
    expect(parsed.targetF0Min).toBe(50);
    expect(parsed.targetF0Max).toBe(500);
  });

  it('bandBounds：非四元数组被忽略', () => {
    const bad = parseSettingsPayload(JSON.stringify({
      kind: 'settings', version: 1, settings: { bandBounds: [1, 2, 3] },
    }));
    expect(bad.bandBounds).toBeUndefined();
    const ok = parseSettingsPayload(JSON.stringify({
      kind: 'settings', version: 1, settings: { bandBounds: [80, 160, 175, 250] },
    }));
    expect(ok.bandBounds).toEqual([80, 160, 175, 250]);
  });
});
