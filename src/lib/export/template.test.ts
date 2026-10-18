import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '@/i18n';
import {
  renderTemplate, exportTemplateFile, parseTemplateFile, seriesSummary,
  type ExportTemplate,
} from './template';
import type { AnalysisRecord, RecordSeries } from '@/types';

function makeRecord(overrides?: Partial<AnalysisRecord>): AnalysisRecord {
  const series: RecordSeries = {
    t: [0, 0.1, 0.2],
    f0: [150, 160, null],
    rmsDb: [-20, -19, -21],
    f1: [700, 710, null],
    f2: [1200, 1210, null],
  };
  return {
    id: 'rec-abcdef12',
    createdAt: new Date('2026-01-31T14:05:00').getTime(),
    durationSec: 0.3,
    sampleHz: 30,
    series,
    stats: {
      durationSec: 0.3, sampleHz: 30, totalSamples: 3, voicedSamples: 2,
      avgF0: 155, medianF0: 155, minF0: 150, maxF0: 160, p10F0: 150, p90F0: 160, stdF0: 5,
      malePct: 10, femalePct: 60, transitionPct: 30,
      avgF1: 705, avgF2: 1205, f1Range: [700, 710], f2Range: [1200, 1210],
      avgDb: -20, peakDb: -15,
      cppsDb: 14.2,
      jitterPct: null,
    },
    mode: 'reading',
    note: '晨间',
    ...overrides,
  };
}

const tpl = (template: string, name = 'test'): ExportTemplate => ({ name, template });

beforeEach(() => setLocale('zh-CN'));

describe('renderTemplate', () => {
  it('基础占位符替换：数值、日期、时间、模式、备注', () => {
    const out = renderTemplate(tpl('{{date}} {{time}} 平均 {{stats.avgF0}}Hz 模式 {{mode}} 备注 {{note}}'), makeRecord());
    expect(out).toBe('2026/1/31 14:05 平均 155Hz 模式 reading 备注 晨间');
  });

  it('printf 格式化：%.1f 保留一位小数', () => {
    const out = renderTemplate(tpl('CPPS {{stats.cppsDb|%.1f}}dB'), makeRecord());
    expect(out).toBe('CPPS 14.2dB');
  });

  it('格式化 + 后缀两段式：{{field|fmt|suffix}}', () => {
    const out = renderTemplate(tpl('{{stats.avgF0|%.0f|Hz}}'), makeRecord());
    expect(out).toBe('155Hz');
  });

  it('缺失字段整段消失（含后缀），不出现 undefined / null', () => {
    const out = renderTemplate(tpl('A{{stats.jitterPct|%.1f|%}}B'), makeRecord());
    expect(out).toBe('AB');
  });

  it('未知字段 → 空串', () => {
    const out = renderTemplate(tpl('X{{stats.nope}}Y{{bad.path}}Z'), makeRecord());
    expect(out).toBe('XYZ');
  });

  it('mode|label 输出本地化标签', () => {
    const out = renderTemplate(tpl('{{mode|label}}'), makeRecord());
    expect(out).toBe('随意朗读');
  });

  it('sustained 模式 label', () => {
    const out = renderTemplate(tpl('{{mode|label}}'), makeRecord({ mode: 'sustained' }));
    expect(out).toBe('长音测试');
  });

  it('target 注入后可引用', () => {
    const out = renderTemplate(tpl('{{target.min}}-{{target.max}}'), makeRecord(), { min: 120, max: 220 });
    expect(out).toBe('120-220');
  });

  it('target 未注入 → 空串', () => {
    const out = renderTemplate(tpl('A{{target.min}}B'), makeRecord());
    expect(out).toBe('AB');
  });

  it('无占位符的纯文本原样返回', () => {
    const out = renderTemplate(tpl('纯文本报告'), makeRecord());
    expect(out).toBe('纯文本报告');
  });

  it('多行模板（随访单风格）', () => {
    const out = renderTemplate(tpl('嗓音随访单\n日期：{{date}}\nF0：{{stats.avgF0|%.0f|}} Hz\nCPPS：{{stats.cppsDb|%.1f|}} dB'), makeRecord());
    expect(out).toContain('日期：2026/1/31');
    expect(out).toContain('F0：155 Hz');
    expect(out).toContain('CPPS：14.2 dB');
  });
});

describe('模板文件导入导出', () => {
  it('导出→导入 roundtrip 保留 name 与 template', () => {
    const raw = exportTemplateFile(tpl('{{date}} {{stats.avgF0}}', '随访单'));
    const back = parseTemplateFile(raw);
    expect(back).not.toBeNull();
    expect(back!.name).toBe('随访单');
    expect(back!.template).toBe('{{date}} {{stats.avgF0}}');
  });

  it('坏 JSON → null', () => {
    expect(parseTemplateFile('not json')).toBeNull();
  });

  it('kind 不对 / 空 template → null', () => {
    expect(parseTemplateFile(JSON.stringify({ kind: 'settings', template: 'x' }))).toBeNull();
    expect(parseTemplateFile(JSON.stringify({ kind: 'template', template: '  ' }))).toBeNull();
  });
});

describe('seriesSummary', () => {
  it('帧数与有声帧数', () => {
    const rec = makeRecord();
    expect(seriesSummary(rec.series)).toEqual({ frames: 3, voiced: 2 });
  });
});
