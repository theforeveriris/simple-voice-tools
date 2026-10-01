import { describe, it, expect } from 'vitest';
import { parseLlmAdviceResult, buildSystemPrompt } from './llm';

const BASE = '内置分析标准 ## Analysis standard';

describe('buildSystemPrompt', () => {
  it('无定制时返回内置标准', () => {
    const p = buildSystemPrompt(BASE, undefined, undefined);
    expect(p).toBe(BASE);
  });

  it('补充规则追加在标准之后，空行被过滤', () => {
    const p = buildSystemPrompt(BASE, ['  优先评估共鸣  ', '', '   '], undefined);
    expect(p).toContain('## Analysis standard');
    expect(p).toContain('## User rules (follow these too; on conflict they win)');
    expect(p).toContain('1. 优先评估共鸣');
  });

  it('覆写时完全使用覆写内容（规则不再拼接）', () => {
    const p = buildSystemPrompt(BASE, ['规则A'], '完全自定义的提示词');
    expect(p).toBe('完全自定义的提示词');
  });
});


describe('parseLlmAdviceResult', () => {
  it('解析结构化 JSON（summary + assessments + advice）', () => {
    const content = JSON.stringify({
      summary: '整体平稳，音高接近目标区。',
      assessments: [
        { aspect: '音高', status: 'good', comment: '中位数 180 Hz 落在目标区间内' },
        { aspect: '嗓音质量', status: 'attention', comment: 'Jitter 1.4% 高于 1% 参考上限' },
      ],
      advice: ['降低靶标 5 Hz 练稳', '注意用声休息'],
    });
    const r = parseLlmAdviceResult(content);
    expect(r.summary).toContain('整体平稳');
    expect(r.assessments).toHaveLength(2);
    expect(r.assessments[0]).toEqual({
      aspect: '音高', status: 'good', comment: '中位数 180 Hz 落在目标区间内',
    });
    expect(r.assessments[1].status).toBe('attention');
    expect(r.advice).toHaveLength(2);
  });

  it('剥掉 markdown 代码围栏后仍可解析', () => {
    const content = '```json\n{"summary":"s","assessments":[],"advice":["a1","a2"]}\n```';
    const r = parseLlmAdviceResult(content);
    expect(r.summary).toBe('s');
    expect(r.advice).toEqual(['a1', 'a2']);
  });

  it('非法 status 归为 fair，缺字段与多余条目被过滤/截断', () => {
    const content = JSON.stringify({
      summary: 's',
      assessments: [
        { aspect: 'A', status: 'excellent', comment: 'c1' },
        { aspect: 'B', comment: 'no status' },
        { aspect: 'C', status: 'good' },
        'garbage',
      ],
      advice: ['x'],
    });
    const r = parseLlmAdviceResult(content);
    expect(r.assessments[0].status).toBe('fair');
    expect(r.assessments[1].status).toBe('fair');
    expect(r.assessments).toHaveLength(2);
  });

  it('兼容仅有 advice 数组的旧格式', () => {
    const r = parseLlmAdviceResult('{"advice":["只有建议"]}');
    expect(r.summary).toBeNull();
    expect(r.assessments).toHaveLength(0);
    expect(r.advice).toEqual(['只有建议']);
  });

  it('非 JSON 文本按行拆分兜底（去掉行首序号/符号）', () => {
    const r = parseLlmAdviceResult('1. 第一条建议\n- 第二条建议\n\n第三条建议');
    expect(r.summary).toBeNull();
    expect(r.assessments).toHaveLength(0);
    expect(r.advice).toEqual(['第一条建议', '第二条建议', '第三条建议']);
  });

  it('完全无有效内容时抛错', () => {
    expect(() => parseLlmAdviceResult('   ')).toThrow();
    expect(() => parseLlmAdviceResult('{"unrelated": 1}')).toThrow();
  });
});
