/**
 * Lua 建议规则引擎（实验性「脚本中心」消费方 #1）
 * 替代 lib/advice.ts 的硬编码规则：启用中的 advice 脚本逐个跑 advise(stats)，
 * 结果合并去重（最多 3 条）。脚本错误静默跳过（UI 有调试入口查看），
 * 无可用脚本时回退内置硬编码规则，保证建议卡永不空。
 */

import type { AdviceTarget } from '@/lib/advice';
import type { AnalysisRecord } from '@/types';
import { runLuaFn } from './engine';
import { listScripts } from './scripts';

/** Lua 建议条目（自由文案，不进 i18n） */
export interface LuaAdviceItem {
  text: string;
  level: 'info' | 'warn';
}

/** 脚本可见的 stats 视图（VoiceStats 的可序列化子集 + mode） */
function statsView(rec: AnalysisRecord): Record<string, unknown> {
  const s = rec.stats;
  return {
    durationSec: s.durationSec,
    avgF0: s.avgF0,
    medianF0: s.medianF0,
    minF0: s.minF0,
    maxF0: s.maxF0,
    p10F0: s.p10F0,
    p90F0: s.p90F0,
    stdF0: s.stdF0,
    malePct: s.malePct,
    femalePct: s.femalePct,
    transitionPct: s.transitionPct,
    avgF1: s.avgF1,
    avgF2: s.avgF2,
    f2f1GapHz: s.f2f1GapHz ?? null,
    spectralTiltDbOct: s.spectralTiltDbOct ?? null,
    avgDb: s.avgDb,
    peakDb: s.peakDb,
    jitterPct: s.jitterPct ?? null,
    shimmerPct: s.shimmerPct ?? null,
    hnrDb: s.hnrDb ?? null,
    cppsDb: s.cppsDb ?? null,
    inTargetPct: s.inTargetPct ?? null,
    voicedSamples: s.voicedSamples,
    totalSamples: s.totalSamples,
    mode: rec.mode ?? 'reading',
  };
}

interface RawTip {
  text?: unknown;
  level?: unknown;
}

function normalizeTips(value: unknown): LuaAdviceItem[] {
  if (!Array.isArray(value)) return [];
  const out: LuaAdviceItem[] = [];
  for (const v of value) {
    if (typeof v === 'string') {
      out.push({ text: v, level: 'info' });
    } else if (v && typeof v === 'object' && typeof (v as RawTip).text === 'string') {
      const t = v as RawTip;
      out.push({ text: t.text as string, level: t.level === 'warn' ? 'warn' : 'info' });
    }
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * 跑全部启用的 advice 脚本，合并结果（每脚本至多 3 条、总计至多 3 条）。
 * 脚本失败返回错误列表供调试（UI 可折叠展示），不影响其他脚本。
 */
export async function buildLuaAdvice(
  rec: AnalysisRecord,
  target: AdviceTarget,
): Promise<{ tips: LuaAdviceItem[]; errors: string[] }> {
  const scripts = (await listScripts()).filter((s) => s.kind === 'advice' && s.enabled);
  const tips: LuaAdviceItem[] = [];
  const errors: string[] = [];
  const stats = { ...statsView(rec), target };
  for (const script of scripts) {
    // 每脚本独立 code：同名函数互不覆盖（doString 重新定义全局 advise）
    const res = await runLuaFn<unknown>(script.code, 'advise', [stats]);
    if (res.ok) {
      tips.push(...normalizeTips(res.value));
    } else {
      errors.push(`${script.name}: ${res.error}`);
    }
    if (tips.length >= 3) break;
  }
  return { tips: tips.slice(0, 3), errors };
}

/** 任意记录能否走 Lua 建议（有启用的 advice 脚本即 true；同步不可知，调用方容错） */
export const LUA_ADVICE_FALLBACK_HINT = 'lua';
