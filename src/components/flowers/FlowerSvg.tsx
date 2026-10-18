/**
 * 声之花绘制 v2：正上方俯视、花瓣从圆心放射、无茎
 * 每片瓣 = 一个语谱频带（瓣长 = 能量，角度 = 低频正上顺时针），
 * 花心半径 = F1，瓣长基线随 F2 外推（F2 参考圈虚线可视化），
 * 莫奈主题色系（同花同色相，明度区分频带：低频亮 → 高频深）。
 * 输入 lib/flower.ts 的 Flower 参数，输出纯 SVG（花园 / 花卡 / 详情共用）。
 */

import type { Flower } from '@/lib/flower';
import { useStore } from '@/store/useStore';

const VB = 120; // 正方形 viewBox
const C = 60; // 圆心
const R_MAX = 52; // 最大外径（1.0 瓣长）

/** 主题色相（跟随当前莫奈/骄傲旗设置；SSR/测试无 store 时回退雾鸢蓝 285） */
function useThemeHue(): number {
  try {
    return useStore((s) => s.settings.hue);
  } catch {
    return 285;
  }
}

/** 有机花瓣路径：从花心出发的两条二次贝塞尔围成一片瓣（俯视放射） */
function petalPath(angleDeg: number, len: number): string {
  const a = ((angleDeg - 90) * Math.PI) / 180; // 0° = 正上
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const tipX = C + dx * len * R_MAX;
  const tipY = C + dy * len * R_MAX;
  // 控制点：中段外扩（瓣宽约为瓣长的 0.30），有机弧线
  const midLen = len * R_MAX * 0.55;
  const ctrl = len * R_MAX * 0.30;
  const c1x = C + dx * midLen + -dy * ctrl;
  const c1y = C + dy * midLen + dx * ctrl;
  const c2x = C + dx * midLen - (-dy * ctrl);
  const c2y = C + dy * midLen - dx * ctrl;
  const sx = C + dx * R_MAX * 0.06;
  const sy = C + dy * R_MAX * 0.06;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} Q ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${tipX.toFixed(2)} ${tipY.toFixed(2)} Q ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${sx.toFixed(2)} ${sy.toFixed(2)} Z`;
}

export interface FlowerSvgProps {
  flower: Flower;
  /** 整体旋转微调（花园防同姿态，±10°） */
  rotation?: number;
  className?: string;
  /** 内联样式（花园按行高缩放花尺寸用） */
  style?: React.CSSProperties;
}

/** 声之花 SVG（俯视频谱指纹） */
export function FlowerSvg({ flower: f, rotation = 0, className, style }: FlowerSvgProps) {
  const hue = useThemeHue();
  // 花心半径（F1）
  const coreR = 12 * f.coreF1;
  // 瓣长基线（F2）：每瓣实际长度 = 基线 + 瓣自身能量伸长
  const baseline = f.baselineF2;
  const F2_RING_R = baseline * R_MAX;

  const parts: string[] = [];

  // F2 参考圈（虚线）：瓣长基线的可视读数
  if (f.ringF2 > 0) {
    parts.push(
      `<circle cx="${C}" cy="${C}" r="${F2_RING_R.toFixed(1)}" fill="none" stroke="hsl(${hue} 30% 50%)" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="3 4"/>`,
    );
  }

  // 花瓣（低频正上、顺时针；明度：低频亮 → 高频深）
  for (const p of f.petals) {
    const len = (baseline * 0.55 + p.length * baseline * 0.45);
    const light = 82 - p.lightness * 34; // 82% → 48%
    parts.push(
      `<path d="${petalPath(p.angleDeg, len)}" fill="hsl(${hue} ${Math.round(55 - p.lightness * 20)}% ${Math.round(light)}%)" fill-opacity="0.85" stroke="hsl(${hue} 45% ${Math.round(light - 18)}%)" stroke-opacity="0.6" stroke-width="0.7"/>`,
    );
  }

  // 花心（F1）：实心圆 + 高光
  parts.push(`<circle cx="${C}" cy="${C}" r="${coreR.toFixed(1)}" fill="hsl(${hue} 60% 62%)"/>`);
  parts.push(`<circle cx="${(C - coreR * 0.25).toFixed(1)}" cy="${(C - coreR * 0.3).toFixed(1)}" r="${(coreR * 0.35).toFixed(1)}" fill="hsl(${hue} 55% 80%)" opacity="0.85"/>`);

  const rot = rotation !== 0 ? ` transform="rotate(${rotation} ${C} ${C})"` : '';

  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      className={className}
      style={style}
      role="img"
      aria-label="voice flower"
      dangerouslySetInnerHTML={{
        // SVG 全部由 Flower 纯参数拼装（无外部文本进入属性），安全
        __html: `<g${rot}>${parts.join('')}</g>`,
      }}
    />
  );
}
