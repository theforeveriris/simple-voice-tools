import { useEffect, useState } from 'react';

/**
 * 页面切换优化：延迟两帧再挂载重内容（长列表 / 多图表）。
 * 页面壳（入场动画可见的部分）先绘制，重内容在两帧后挂载——
 * 换页 commit 变轻，入场动画不再被长列表的挂载开销阻塞成白屏闪动。
 */
export function useDeferredMount(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);
  return ready;
}
