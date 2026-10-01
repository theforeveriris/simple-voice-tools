/**
 * 设置页共享行原语：分区卡片、单行设置项、字节格式化
 * （设置主视图与 Labs 子页面共用）
 */

import type { ElementType, ReactNode } from 'react';

export function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: ElementType;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[22px] bg-card p-5 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon size={15} className="text-accent" />
        {title}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function SettingRow({
  label,
  desc,
  children,
  stacked,
}: {
  /** 通常为字符串；也可传节点（如「备份文件夹」标签 + 信息图标） */
  label: ReactNode;
  desc?: string;
  children?: ReactNode;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="py-2">
        <p className="text-sm font-medium text-ink">{label}</p>
        {desc && <p className="mt-0.5 text-[11px] text-ink-2">{desc}</p>}
        <div className="mt-2">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-black/[0.04] py-2 first:border-t-0">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {desc && <p className="mt-0.5 text-[11px] text-ink-2">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function fmtBytes(n: number): string {
  if (!isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[u]}`;
}
