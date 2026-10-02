/**
 * 返回手势支持（移动端全屏手势 / 浏览器返回键 → 关闭最上层的全屏浮层）
 *
 * 注册时压入一条 history 记录（state 标记 svtOverlay，URL 不变）；
 * popstate 且 state 带标记时，弹出栈顶关闭回调执行（如收起设置子页面）。
 * 浮层的 UI 返回按钮应调用 history.back()，走同一条链路保持栈一致。
 *
 * 与页签导航的互不干扰：页签 pushState 的是 hash 条目（无标记），
 * App 的 hashchange 处理器负责它；本模块只认带 svtOverlay 标记的条目。
 * 边界情形（浮层打开时切页签再返回）会多出一次无害的空 back——URL 不变、
 * 栈已空，无视觉影响。
 */

type Close = () => void;

const stack: Close[] = [];

/**
 * 注册一个返回关闭回调并压入 history。
 * @returns 清理函数：从栈中移除（不动 history——调用方经由 popstate 或
 * UI 返回（history.back）消费已压入的条目）
 */
export function registerBackClose(close: Close): () => void {
  stack.push(close);
  try {
    history.pushState({ svtOverlay: stack.length }, '');
  } catch {
    stack.pop();
    return () => undefined;
  }
  return () => {
    const i = stack.indexOf(close);
    if (i >= 0) stack.splice(i, 1);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (e) => {
    // 目标条目记录的浮层深度：回退后比栈浅的部分全部关闭
    // （e.state 无标记 = 已回到无浮层的条目，全关）
    const depth = (e.state as { svtOverlay?: number } | null)?.svtOverlay ?? 0;
    while (stack.length > depth) {
      const close = stack.pop();
      if (!close) break;
      close();
    }
  });
}
