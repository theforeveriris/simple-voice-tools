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
    <div className="card-surface p-5">
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

/**
 * 设置行内下拉控件的统一皮肤（值右对齐、箭头紧随、无固定宽度）
 * 每处不再各写 w-24 / w-36 / w-52——右侧一律「值 + 箭头」贴齐容器右缘，
 * 与开关的右缘对齐；长内容（麦克风名）可用 withTruncateMaxWidth 追加限宽。
 */
export const SELECT_TRIGGER_CLASS =
  'h-6 w-fit justify-end gap-1 border-0 bg-transparent px-0 text-sm font-medium text-ink shadow-none '
  + '[&_[data-slot=select-value]]:flex-none data-[placeholder]:text-ink-2';

/** 长文本选项（设备名等）：限宽 + 省略号，仍保持右对齐 */
export const SELECT_TRIGGER_TRUNCATE = 'max-w-[11rem] [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate';

/** 设置行内数值输入框的统一皮肤（右对齐、同一高度与字重） */
export const NUMBER_INPUT_CLASS =
  'w-14 rounded-xl border border-black/10 bg-surface-hi px-2 py-1.5 text-right text-sm tabular-nums '
  + 'text-ink outline-none focus:border-accent';

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
