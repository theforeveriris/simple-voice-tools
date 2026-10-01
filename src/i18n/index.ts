/**
 * i18n 核心（不依赖 React / store，任何模块可直接调用 t()）
 * 简体中文为基准词典；其余语言缺译时回退 zh-CN。
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
};

/** 语言选择项：英语 / 日语为机器翻译，选择器中注明 */
export const LOCALES: { id: Locale; label: string; machine?: boolean }[] = [
  { id: 'zh-CN', label: '简体中文' },
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'en', label: 'English', machine: true },
  { id: 'ja', label: '日本語', machine: true },
  { id: 'lzh', label: '文言（華夏）' },
];

let current: Locale = 'zh-CN';

export function getLocale(): Locale {
  return current;
}

/** 切换语言并同步 <html lang> */
export function setLocale(locale: Locale): void {
  current = locale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

/** 当前语言的 BCP-47 标签（供 toLocaleString 等） */
export function localeTag(): string {
  return current;
}

/**
 * 取词条。支持 {name} 占位符：t('key', { name: value })
 */
export function t(key: DictKey, params?: Record<string, string | number>): string {
  const raw = DICTS[current][key] ?? zhCN[key];
  if (!raw) return key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}
