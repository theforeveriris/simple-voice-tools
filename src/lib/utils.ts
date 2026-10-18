/**
 * 工具函数
 * 包含应用中使用的通用工具函数
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 合并 Tailwind CSS 类名
 * 使用 clsx 处理条件类名，然后使用 twMerge 合并冲突的类名
 * 
 * @param inputs 类名输入
 * @returns 合并后的类名字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 短日期时间（本地时区 M/D hh:mm）：记录分组标签等共用 */
export function fmtShortDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 秒 → m:ss（先对总秒数取整：59.7s 这类端点按位舍入会进位成 "0:60"） */
export function formatClock(sec: number): string {
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
