/**
 * 氛围彩蛋引擎
 * 三个不声不响的环境效果，共享一个 20Hz 心跳：
 *
 * - 声音染色（voiceTint）：麦克风活跃（录音或监听练习）时，色板种子色相
 *   随实时音高在蓝（255°）→ 粉（335°）弧上滑动，整个界面（含 Canvas 图表，
 *   经 app:themechange 失效调色板缓存）随之流动。仅在色相变化越过 1.5°
 *   时重写令牌，平稳发声时几乎零样式开销；关闭或麦克风停止后恢复基准主题。
 * - 音量呼吸（volumeBreath）：骄傲旗渐变浓度（--pride-breath 倍率，CSS 与
 *   --pride-glow 相乘）随麦克风响度起伏，快起慢落形成呼吸感；
 *   仅 pride 渐变主题下可见。
 * - 凌晨极光：本地时间 3:00–4:59 给 <html> 加 aurora 类，pride 渐变
 *   自动换成极光配色（index.css），无任何提示。
 */

import { applyTheme, presetSpec } from './monet';
import { recorder } from '@/lib/audio/recorder';
import { useStore } from '@/store/useStore';
import type { AppSettings } from '@/types';

/** 心跳间隔（ms）：染色与呼吸的平滑都按该周期推进 */
const TICK_MS = 50;
/** 染色色相弧：低音蓝端 → 高音粉端（OKLCH 色相） */
const HUE_LOW = 255;
const HUE_HIGH = 335;
/** 音高映射范围（Hz，对数刻度）：约覆盖男声低音到女声高音 */
const PITCH_LOW = 80;
const PITCH_HIGH = 400;
/** 响度映射范围（dBFS）：-50 dB 以下视为静音，-10 dB 视为满格 */
const DB_LOW = -50;
const DB_HIGH = -10;
/** 色相重写阈值（度，最短弧）：低于该变化不触碰样式 */
const HUE_WRITE_EPS = 1.5;
/** 呼吸增益：响度满格时渐变浓度提升的最大倍率 */
const BREATH_GAIN = 0.5;

/** 色相最短弧差（-180, 180] */
function hueArcDelta(from: number, to: number): number {
  const d = (((to - from) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/** 音高 → 染色色相（对数映射到蓝→粉弧，越界夹取） */
function pitchHue(freq: number): number {
  const t = Math.min(1, Math.max(0, Math.log2(freq / PITCH_LOW) / Math.log2(PITCH_HIGH / PITCH_LOW)));
  return HUE_LOW + t * (HUE_HIGH - HUE_LOW);
}

/** 按设置计算深浅模式（与 App.tsx 的判定一致） */
function isDark(s: AppSettings): boolean {
  return s.theme === 'dark'
    || (s.theme === 'system'
      && typeof window !== 'undefined'
      && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/** 恢复基准主题（当前设置所对应的色板，无染色） */
function restoreBase(s: AppSettings): void {
  const p = presetSpec(s.huePreset, s.hue, s.prideFlag);
  applyTheme(p.hue, isDark(s), p.accentHue, p.spec, s.prideFlag);
}

let timer: ReturnType<typeof setInterval> | null = null;
/** 当前染色色相（null = 未激活） */
let curHue: number | null = null;
let lastWrittenHue = -999;
/** 呼吸平滑值（0-1）与是否处于呼吸态（用于一次性复位） */
let breath = 0;
let breathOn = false;

function tick(): void {
  const s = useStore.getState().settings;
  const micActive = recorder.isRecording() || recorder.isMonitoring();

  /* ---- 声音染色 ---- */
  if (s.voiceTint && micActive) {
    // 取最近约 0.5s 内最后一个有声帧的音高：静音段保持色相（色相不因停顿跌落）
    const live = recorder.getLive();
    let freq = 0;
    for (let i = live.f0.length - 1, end = Math.max(0, live.f0.length - 30); i >= end; i--) {
      const v = live.f0[i];
      if (v != null && isFinite(v) && v > 0) {
        freq = v;
        break;
      }
    }
    if (freq > 0) {
      const target = pitchHue(freq);
      curHue = curHue == null ? target : curHue + hueArcDelta(curHue, target) * 0.18;
      const h = ((curHue % 360) + 360) % 360;
      if (Math.abs(hueArcDelta(lastWrittenHue, h)) >= HUE_WRITE_EPS) {
        lastWrittenHue = h;
        // 种子色相与强调色相取同一染色值：表面（低彩度铺底）微动，强调色明显流动；
        // 预设的明度/彩度规格保留，pride 渐变背景不受影响（走 CSS）
        const p = presetSpec(s.huePreset, s.hue, s.prideFlag);
        applyTheme(h, isDark(s), h, p.spec, s.prideFlag);
      }
    }
  } else if (curHue != null) {
    curHue = null;
    lastWrittenHue = -999;
    restoreBase(s);
  }

  /* ---- 音量呼吸 ---- */
  if (s.volumeBreath && micActive && s.huePreset === 'pride') {
    const live = recorder.getLive();
    const db = live.rmsDb.length > 0 ? live.rmsDb[live.rmsDb.length - 1] : -90;
    const norm = Math.min(1, Math.max(0, (db - DB_LOW) / (DB_HIGH - DB_LOW)));
    // 快起慢落：亮起跟得上发声，落下拖出余韵
    breath += (norm - breath) * (norm > breath ? 0.35 : 0.08);
    breathOn = true;
    document.documentElement.style.setProperty('--pride-breath', (1 + breath * BREATH_GAIN).toFixed(3));
  } else if (breathOn) {
    breathOn = false;
    breath = 0;
    document.documentElement.style.setProperty('--pride-breath', '1');
  }
}

/** 启动氛围心跳（幂等；App 挂载前调用，随应用存活） */
export function startAmbientLoop(): void {
  if (timer !== null) return;
  timer = setInterval(tick, TICK_MS);
}

/**
 * 凌晨极光：本地时间 3:00–4:59 给 <html> 加 aurora 类，
 * pride 渐变自动换成极光配色，无任何提示。启动时先判一次（首帧前，不闪旗面），
 * 之后每分钟复查（跨过 3 点 / 5 点边界时生效 / 退场）。
 */
export function watchAuroraHours(): void {
  const apply = () => {
    const h = new Date().getHours();
    document.documentElement.classList.toggle('aurora', h >= 3 && h < 5);
  };
  apply();
  setInterval(apply, 60_000);
}
