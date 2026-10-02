/**
 * 页面级错误边界
 * 任一页面的渲染/副作用抛出异常时，显示错误信息与重试按钮，
 * 而不是整个应用白屏（React 卸载整棵树的默认行为）。
 * pageKey 变化（切换页面）时自动清除旧错误重新渲染。
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { t } from '@/i18n';

interface Props {
  children: ReactNode;
  /** 当前页面标识，切换时重置错误态 */
  pageKey: string;
}

interface State {
  error: Error | null;
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('页面渲染异常:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (prev.pageKey !== this.props.pageKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-semibold text-ink">{t('error.title')}</p>
          <pre className="max-h-44 max-w-full overflow-auto whitespace-pre-wrap rounded-xl bg-surface-hi/70 px-3.5 py-3 text-left text-[11px] leading-relaxed text-ink-2">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            {t('error.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
