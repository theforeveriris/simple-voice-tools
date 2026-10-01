/**
 * 每日练习提醒（本地通知，无推送服务）
 * 应用打开/在后台运行时每分钟检查：到点且当天还没有录音 → 发一条本地通知并标记当天已提醒；
 * 应用被打开（visibilitychange → visible）时补一次检查，覆盖「到点时应用刚打开」。
 * 应用被完全杀掉后无法唤醒（无推送服务的平台限制），设置页说明文案如实告知。
 */

import { useHistoryStore } from '@/store/useHistoryStore';
import { t } from '@/i18n';

export function reminderSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export function reminderPermission(): NotificationPermission | 'unsupported' {
  return reminderSupported() ? Notification.permission : 'unsupported';
}

/** 申请通知权限（已授权时直接返回）；不支持环境返回 'unsupported' */
export async function requestReminderPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!reminderSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** 'HH:mm' → { h, m }（越界值收敛到合法范围） */
export function parseReminderTime(s: string): { h: number; m: number } {
  const [h, m] = s.split(':').map((x) => Number(x) || 0);
  return { h: Math.max(0, Math.min(23, h)), m: Math.max(0, Math.min(59, m)) };
}

function hasRecordToday(): boolean {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return useHistoryStore.getState().records.some((r) => r.createdAt >= start.getTime());
}

/** 当天已提醒的标记（按日期滚动，隔天自动失效） */
function firedKey(): string {
  return `svt:reminder:fired:${new Date().toDateString()}`;
}

/** 发一条提醒通知；点击聚焦应用 */
export function showPracticeReminder(): void {
  if (!reminderSupported()) return;
  const n = new Notification('Simple Voice Tool', {
    body: t('reminder.body'),
    tag: 'svt-practice-reminder',
  });
  n.onclick = () => {
    window.focus();
    n.close();
  };
}

/**
 * 检查并（在满足条件时）发送提醒：
 * 已启用 + 已授权 + 当前时间已达提醒时刻 + 当天未提醒过 + 当天还没有录音。
 * 已练过也写标记：当天不再打扰。
 */
export function checkPracticeReminder(enabled: boolean, time: string): void {
  if (!enabled || !reminderSupported() || Notification.permission !== 'granted') return;
  const key = firedKey();
  if (localStorage.getItem(key)) return;
  const now = new Date();
  const { h, m } = parseReminderTime(time);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  localStorage.setItem(key, '1');
  if (hasRecordToday()) return;
  showPracticeReminder();
}
