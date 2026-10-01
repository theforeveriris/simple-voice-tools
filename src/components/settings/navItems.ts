/** 底部导航页签的 id 与 i18n 标签键（设置页「启动默认页签」等共用） */

import type { ViewType } from '@/types';

export const NAV: ViewType[] = ['test', 'analysis', 'history', 'settings'];

export const navLabelKey: Record<ViewType, 'nav.test' | 'nav.analysis' | 'nav.history' | 'nav.settings'> = {
  test: 'nav.test',
  analysis: 'nav.analysis',
  history: 'nav.history',
  settings: 'nav.settings',
};
