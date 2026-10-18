/**
 * 声之花绘制（有机贝塞尔花瓣 + 半透明层叠 + 莫奈色系）
 * 输入 lib/flower.ts 的 Flower 参数，输出纯 SVG（花园 / 花卡 / 详情共用）。
 * 全部几何在 viewBox 100×130 内（含茎），任意尺寸缩放清晰。
 */

import type { Flower } from '@/lib/flower';

const VB_W = 100;
const VB_H = 130;
/** 花心中心（上部留出茎的空间） */
const CX = 50;
const CY = 46;
/** 花瓣最大长度（半径） */
const R = 30;

/** 有机花瓣路径：从花心出发的两条贝塞尔曲线围成一片瓣 */
function petalPath(angleDeg: number, len: number, width: number, tiltDeg: number): string {
  // 花瓣朝外方向 = 基础角 + 前倾
  const a = ((angleDeg + tiltDeg) * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  // 垂直方向（控制瓣宽）
  const px = -dy;
  const py = dx;
  const tipX = CX + dx * len * R;
  const tipY = CY + dy * len * R;
  // 两侧控制点：中段外扩 width 系数，制造有机弧线
  const midLen = len * R * 0.62;
  const ctrl = width * 0.42 * R;
  const c1x = CX + dx * midLen + px * ctrl;
  const c1y = CY + dy * midLen + py * ctrl;
  const c2x = CX + dx * midLen - px * ctrl;
  const c2y = CY + dy * midLen - py * ctrl;
  // 起点稍微离开花心，形成自然花萼
  const sx = CX + dx * R * 0.12;
  const sy = CY + dy * R * 0.12;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} Q ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${tipX.toFixed(2)} ${tipY.toFixed(2)} Q ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${sx.toFixed(2)} ${sy.toFixed(2)} Z`;
}

/** 花茎：从花心向下弯一条有机曲线（弯向由 seed 决定） */
function stemPath(stem: number, seed: number): { path: string; leaf: string } {
  const topY = CY + 10;
  const bottomY = VB_H - 4;
  const bend = (((seed % 13) - 6) / 6) * 14; // ±14px 弯曲
  const midX = CX + bend;
  const path = `M ${CX} ${topY} Q ${midX.toFixed(1)} ${((topY + bottomY) / 2).toFixed(1)} ${(CX + bend * 0.4).toFixed(1)} ${bottomY}`;
  // 叶片：茎中段旁一片小叶（长出方向与弯曲相反）
  const leafY = (topY + bottomY) / 2 + 4;
  const leafLen = 10 * stem;
  const leaf = `M ${(CX + bend * 0.2).toFixed(1)} ${leafY.toFixed(1)} q ${(-leafLen).toFixed(1)} ${(-leafLen * 0.5).toFixed(1)} ${(-leafLen * 1.6).toFixed(1)} ${(leafLen * 0.2).toFixed(1)} q ${leafLen.toFixed(1)} ${(leafLen * 0.4).toFixed(1)} ${(leafLen * 1.6).toFixed(1)} ${(-leafLen * 0.2).toFixed(1)} Z`;
  return { path, leaf };
}

export interface FlowerSvgProps {
  flower: Flower;
  /** 花园里防同色微调（±8°） */
  hueJitter?: number;
  /** 额外 class（尺寸/动画由外部控制） */
  className?: string;
  /** 严格 SSA 版本：无动画类（分享卡导出用） */
  still?: boolean;
}

/** 声之花 SVG 组件 */
export function FlowerSvg({ flower: f, hueJitter: jitter = 0, className, still = false }: FlowerSvgProps) {
  const hue = f.hue + jitter;
  const stemColor = `hsl(${(hue + 90) % 360} 30% 42%)`;
  const leafColor = `hsl(${(hue + 90) % 360} 34% 50%)`;
  const seed = Math.round(f.hue * 100) + f.petals;
  const { path: stem, leaf } = stemPath(f.stem, seed);
  const petalW = f.petalWidth;
  const petalL = f.petalLength;
  const coreR = 7 * f.core;
  const glowR = coreR * (2.2 + f.glow * 2.6);
  const glowOpacity = 0.12 + f.glow * 0.4;

  const petals = [];
  for (let i = 0; i < f.petals; i++) {
    const angle = (360 / f.petals) * i - 90; // 第一瓣朝上
    const stagger = still ? 1 : 0.82 + 0.18 * ((i % 3) / 2); // 层叠微差
    petals.push(
      `<path d="${petalPath(angle, petalL * stagger, petalW * stagger, f.petalTiltDeg)}" fill="hsl(${hue} ${Math.round(f.saturation * 100)}% 72%)" fill-opacity="0.55" stroke="hsl(${hue} ${Math.round(f.saturation * 100)}% 55%)" stroke-opacity="0.5" stroke-width="0.6"/>`,
    );
  }

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className={className}
      role="img"
      aria-label="voice flower"
      dangerouslySetInnerHTML={{
        // SVG 全部由 Flower 纯参数拼装（无外部文本进入属性），安全
        __html: [
          `<path d="${stem}" fill="none" stroke="${stemColor}" stroke-width="2.2" stroke-linecap="round"/>`,
          `<path d="${leaf}" fill="${leafColor}" fill-opacity="0.85"/>`,
          `<circle cx="${CX}" cy="${CY}" r="${glowR.toFixed(1)}" fill="hsl(${hue} 80% 78%)" opacity="${glowOpacity.toFixed(2)}"/>`,
          ...petals,
          `<circle cx="${CX}" cy="${CY}" r="${coreR.toFixed(1)}" fill="hsl(${hue} 70% 62%)"/>`,
          `<circle cx="${CX - coreR * 0.25}" cy="${CY - coreR * 0.3}" r="${(coreR * 0.35).toFixed(1)}" fill="hsl(${hue} 60% 82%)" opacity="0.8"/>`,
        ].join(''),
      }}
    />
  );
}
