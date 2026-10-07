/**
 * 备份配置变更通知（轻量跨组件同步）
 * 加密开关 / GitHub 连接 / WebDAV 配置都落在 IndexedDB kv，没有全局 store；
 * 写入侧发事件，设置 → 数据 的「数据去向」面板等只读展示侧订阅后重读，
 * 避免同页开关后旧状态一直挂着。
 */

export const BACKUP_CHANGED_EVENT = 'svt:backup-changed';

export function notifyBackupChanged(): void {
  // 测试等非 DOM 环境（vitest node 环境）无 window，静默跳过
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(BACKUP_CHANGED_EVENT));
}
