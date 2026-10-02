/**
 * useI18n：React 订阅语言设置的钩子
 * 订阅 settings.language，语言变化时触发组件重渲染；
 * AI 翻译词典的注册 / 更新（不走 settings）经词典版本号同步触发；
 * 核心模块（图表画笔等非 React 代码）直接 import { t } 即可。
 */

import { useEffect, useSyncExternalStore } from 'react';
import { useStore } from '@/store/useStore';
import { getI18nVersion, getLocale, setLocale, subscribeI18n, t } from './index';
import type { DictKey } from './index';

export function useI18n(): (key: DictKey, params?: Record<string, string | number>) => string {
  const language = useStore((s) => s.settings.language);
  // 渲染期同步模块级 locale（幂等）：保证本次渲染就用上新词典，
  // effect 仅兜底外部直改设置的场景
  if (getLocale() !== language) setLocale(language);
  useEffect(() => {
    setLocale(language);
  }, [language]);
  // AI 词典注册 / 重新生成（语言值不变）时同样重渲染
  useSyncExternalStore(subscribeI18n, getI18nVersion);
  return t;
}
