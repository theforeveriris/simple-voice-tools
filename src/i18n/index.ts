/**
 * i18n 核心（不依赖 React / store，任何模块可直接调用 t()）
 * 简体中文为基准词典；其余语言缺译时回退 zh-CN。
 * 另支持 AI 翻译语言（registerAiDict 注入的运行时词典，见 aiLocale.ts）。
 */

import type { Locale } from '@/types';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';
import { en } from './en';
import { ja } from './ja';
import { lzh } from './lzh';

export type DictKey = keyof typeof zhCN;
type Dict = Partial<Record<DictKey, string>>;

const DICTS: Record<Locale, Dict> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en,
  ja,
  lzh,
  ai: {},
};

/** 语言选择项：英语 / 日语为机器翻译，选择器中注明（AI 语言项由语言子页面追加） */
export const LOCALES: { id: Locale; label: string; machine?: boolean }[] = [
  { id: 'zh-CN', label: '简体中文' },
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'en', label: 'English', machine: true },
  { id: 'ja', label: '日本語', machine: true },
  { id: 'lzh', label: '文言（華夏）' },
];

/** 默认界面语言（与 DEFAULT_SETTINGS.language 一致；用户选择后持久化覆盖） */
export const DEFAULT_LOCALE: Locale = 'en';

let current: Locale = DEFAULT_LOCALE;

/* ---------------- AI 翻译语言的运行时词典 ---------------- */

const aiDicts = new Map<string, Dict>();
let aiLangTag = 'ai';
let aiLabel: string | null = null;

/** 当前 AI 语言显示名（无则 null；llm 提示词据此要求回答语言） */
export function getAiLocaleLabel(): string | null {
  return aiLabel;
}

/** 注册 AI 翻译词典（覆盖同一槽位 'ai'；调用方负责 localStorage 持久化） */
export function registerAiDict(label: string, dict: Record<string, string>, langTag = 'ai'): void {
  aiDicts.set('ai', dict as Dict);
  aiLabel = label;
  aiLangTag = langTag;
  bump();
}

/* ---------------- 订阅：语言 / 词典变化通知 React 重渲染 ---------------- */

const listeners = new Set<() => void>();
let version = 0;

/** 订阅词典版本变化（AI 词典注册等不走 settings 的更新路径） */
export function subscribeI18n(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 词典版本号（useSyncExternalStore 快照） */
export function getI18nVersion(): number {
  return version;
}

function bump(): void {
  version++;
  for (const fn of listeners) fn();
}

/** 切换语言并同步 <html lang>（同语言不重复通知，但 lang 仍同步——首帧静态值可能不同） */
export function setLocale(locale: Locale): void {
  const changed = current !== locale;
  current = locale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'ai' ? aiLangTag : locale;
  }
  if (changed) bump();
}

/** 当前语言的 BCP-47 标签（供 toLocaleString 等；AI 语言为其 slug） */
export function localeTag(): string {
  return current === 'ai' ? aiLangTag : current;
}

/** 当前语言（llm 提示词判断回答语言用） */
export function getLocale(): Locale {
  return current;
}

/**
 * 取词条。支持 {name} 占位符：t('key', { name: value })
 * 查找顺序：内置词典 → AI 词典 → zh-CN 基准回退
 */
export function t(key: DictKey, params?: Record<string, string | number>): string {
  const raw = DICTS[current][key] ?? aiDicts.get(current)?.[key] ?? zhCN[key];
  if (!raw) return key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}
