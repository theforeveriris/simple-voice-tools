/**
 * 返回手势支持（移动端全屏手势 / 浏览器返回键 → 关闭最上层的全屏浮层）
 *
 * 注册时压入一条 history 记录，state 带该浮层的 token（svtOverlay，URL 不变）；
 * popstate 且 state 带标记时，关闭 token 序号 ≥ 目标条目的全部浮层
 * （token 按注册序单调递增：回到某个条目 = 关闭它之后打开的所有浮层）。
 * 浮层的 UI 返回按钮应调用 history.back()，走同一条链路保持一致。
 *
 * 与页签导航的互不干扰：页签 pushState 的是 hash 条目（无标记），
 * App 的 hashchange 处理器负责它；本模块只认带 svtOverlay 标记的条目。
 *
 * 浮层不经 popstate 卸载（切页签、父级条件收起）时，其 history 条目无法删除，
 * 但回调已从注册表移除——回退经过该孤儿条目会按 token 语义关闭仍打开的
 * 后注册浮层（不会像按深度计数那样出现「按一次返回无效果」）。
 * 边界情形（浮层打开时切页签再返回）会多出一次无害的空 back——URL 不变、
 * 注册表已空，无视觉影响。
 */

type Close = () => void;

/** 注册序号（单调递增）：history 条目 ↔ 关闭回调经 token 绑定 */
let seq = 0;
/** token → 关闭回调 */
const registry = new Map<number, Close>();

/**
 * 注册一个返回关闭回调并压入 history。
 * @returns 清理函数：从注册表移除（不动 history——调用方经由 popstate 或
 * UI 返回（history.back）消费已压入的条目）
 */
export function registerBackClose(close: Close): () => void {
  const token = ++seq;
  registry.set(token, close);
  try {
    history.pushState({ svtOverlay: token }, '');
  } catch {
    registry.delete(token);
    return () => undefined;
  }
  return () => {
    registry.delete(token);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (e) => {
    // 目标条目绑定的浮层 token：关闭该浮层及其后注册的全部（后注册的先关）；
    // e.state 无标记 = 已回到无浮层的条目，全关
    const target = (e.state as { svtOverlay?: number } | null)?.svtOverlay;
    const doomed: { token: number; close: Close }[] = [];
    for (const [token, close] of registry) {
      if (target == null || token >= target) doomed.push({ token, close });
    }
    for (let i = doomed.length - 1; i >= 0; i--) {
      registry.delete(doomed[i].token);
      doomed[i].close();
    }
  });
}
