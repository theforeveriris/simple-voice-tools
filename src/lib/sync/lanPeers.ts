/**
 * 最近配对的对端设备记忆（局域网同步辅助，零后端）
 * 存 localStorage 轻量偏好：记住对端设备名与上次时间，供「最近设备」快捷发起。
 *
 * 注意：WebRTC 每次连接都需要新的 SDP 交换，无信令服务器时无法真正「免信令重连」；
 * 本模块只负责记忆与快捷入口，SDP 仍由用户搬运一次（见 LanSyncSection）。
 */

export interface LanPeer {
  name: string;
  /** 上次成功连接时间（epoch ms） */
  lastAt: number;
}

const KEY = 'svt:lan-peers';
const MAX = 5;

/** 最近对端（最新在前）；不可用时返回空表 */
export function getRecentPeers(): LanPeer[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((p): p is LanPeer => !!p && typeof (p as LanPeer).name === 'string' && !!(p as LanPeer).name)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

/** 记住一个对端（去重后置顶，最多 MAX 条） */
export function rememberPeer(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const list = getRecentPeers().filter((p) => p.name !== trimmed);
  list.unshift({ name: trimmed, lastAt: Date.now() });
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* localStorage 不可用：忽略，不影响同步本身 */
  }
}
