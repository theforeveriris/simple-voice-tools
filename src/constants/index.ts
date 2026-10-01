/**
 * 应用常量定义
 * 音高区间、莫奈主题预设、音符换算、默认设置
 */

import type { AppSettings, PitchBand, TestMode } from '@/types';

/**
 * 音符名称列表
 */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * 男女声音高区间定义（Hz）
 * < 85            low         偏低（淡紫）
 * 85  - 165       male        男声区（淡蓝）
 * 165 - 180       transition  男女过渡区（黑）
 * 180 - 255       female      女声区（淡粉）
 * > 255           high        偏高（淡紫）
 */
export const BAND_RANGES: Record<PitchBand, [number, number]> = {
  low: [50, 85],
  male: [85, 165],
  transition: [165, 180],
  female: [180, 255],
  high: [255, 520],
};

/**
 * 音高区间配色（固定，不随主题变化）
 * 曲线分段着色 / 区间背景 / 徽标
 */
export const BAND_COLORS: Record<PitchBand, string> = {
  low: '#BBA7EA',
  male: '#8FB8EC',
  transition: '#35343D',
  female: '#F0A2C0',
  high: '#BBA7EA',
};

/** 区间中文名 */
export const BAND_LABELS: Record<PitchBand, string> = {
  low: '偏低',
  male: '男声区',
  transition: '过渡区',
  female: '女声区',
  high: '偏高',
};

/**
 * 判断频率所属音高区间
 */
export function bandOf(freq: number): PitchBand {
  if (freq < BAND_RANGES.male[0]) return 'low';
  if (freq < BAND_RANGES.transition[0]) return 'male';
  if (freq < BAND_RANGES.female[0]) return 'transition';
  if (freq <= BAND_RANGES.female[1]) return 'female';
  return 'high';
}

/**
 * 频率 → 钢琴音符（十二平均律，A4 = 440Hz）
 * 无效频率（无声录音 avgF0=0 等）返回占位符，避免出现 NaN
 */
export function freqToNote(freq: number): { name: string; midi: number; cents: number } {
  if (!isFinite(freq) || freq <= 0) return { name: '—', midi: 0, cents: 0 };
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  const exact = 440 * Math.pow(2, (midi - 69) / 12);
  const cents = Math.round(1200 * Math.log2(freq / exact));
  return { name, midi, cents };
}

/**
 * 莫奈取色预设（种子色相）
 * 主题系统基于 OKLCH 色彩空间由色相生成全套 M3 风格色板
 */
export const THEME_PRESETS: { id: string; hue: number; label: string }[] = [
  { id: 'indigo', hue: 285, label: '雾鸢蓝' },
  { id: 'sky', hue: 240, label: '晴空蓝' },
  { id: 'cyan', hue: 205, label: '湖水青' },
  { id: 'green', hue: 150, label: '柑绿' },
  { id: 'amber', hue: 95, label: '柚黄' },
  { id: 'orange', hue: 55, label: '蜜橙' },
  { id: 'rose', hue: 15, label: '山桃红' },
  { id: 'purple', hue: 330, label: '堇紫' },
];

/**
 * 默认应用设置
 */
export const DEFAULT_SETTINGS: AppSettings = {
  hue: 15,
  theme: 'system',
  language: 'zh-CN',
  showGrid: true,
  maxDurationSec: 120,
  autoEnterAnalysis: true,
  micDeviceId: '',
  audioSave: true,
  testMode: 'reading',
  syncChartRange: true,
  targetEnabled: false,
  targetF0Min: 165,
  targetF0Max: 255,
  // 实验性功能
  showSpectrogram: true,
  liveSpectrum: false,
  adviceEnabled: true,
};

/**
 * 测试模式元信息
 * autoStopSec：模式自带的最长录音秒数（0 = 沿用设置里的最长录音时长）
 * silenceStopSec：发声开始后持续静音达到该秒数自动结束（0 = 不启用）
 */
export const MODE_META: Record<TestMode, {
  autoStopSec: number;
  silenceStopSec: number;
}> = {
  reading: { autoStopSec: 0, silenceStopSec: 0 },
  sustained: { autoStopSec: 0, silenceStopSec: 1 },
  glide: { autoStopSec: 20, silenceStopSec: 0 },
};

/** 音高曲线纵轴范围（Hz） */
export const PITCH_AXIS: [number, number] = [50, 520];

/** 共振峰曲线纵轴范围（Hz） */
export const FORMANT_AXIS: [number, number] = [0, 3500];

/** 能量曲线纵轴范围（dB） */
export const ENERGY_AXIS: [number, number] = [-90, 0];

/** 实时曲线滚动窗口长度（秒） */
export const LIVE_WINDOW_SEC = 12;

/* ------------------------------ 元音空间散点图 ------------------------------ */

/** 元音空间 F1 纵轴范围（Hz，对数刻度，倒置：低 F1=开口小 在上） */
export const VOWEL_AXIS_F1: [number, number] = [200, 1100];
/** 元音空间 F2 横轴范围（Hz，对数刻度，倒置：高 F2=舌位靠前 在左） */
export const VOWEL_AXIS_F2: [number, number] = [500, 3400];

/**
 * 元音空间参考元音（典型共振峰位置，取 Peterson & Barney 平均值附近）
 * 叠加为半透明虚线圈，帮助定位自己的发音落点
 */
export const VOWEL_REFS: { label: string; zh: string; f1: number; f2: number }[] = [
  { label: 'i', zh: '衣', f1: 280, f2: 2250 },
  { label: 'a', zh: '啊', f1: 730, f2: 1090 },
  { label: 'u', zh: '乌', f1: 300, f2: 870 },
];

/* -------------------------------- 声域图 VRP -------------------------------- */

/** VRP 声域图纵轴范围（MIDI 音符号）：C2=36 到 C6=84，覆盖绝大多数人声 */
export const VRP_NOTE_MIN = 36;
export const VRP_NOTE_MAX = 84;

/** 历史记录最多保留条数（记录与音频均存于 IndexedDB，容量充裕） */
export const MAX_HISTORY = 200;

/* ------------------------------ 语谱图参数 ------------------------------ */

/** 语谱图频带数（每行的采样点数） */
export const SPEC_BANDS = 64;
/** 语谱图频率范围（Hz），对数分带 */
export const SPEC_FMIN = 80;
export const SPEC_FMAX = 5000;
/** 语谱图动态范围（dB），映射到 0-255 */
export const SPEC_DB_MIN = -90;
export const SPEC_DB_MAX = -15;
/** 语谱图最多保留行数（约 2 分钟 @30Hz），超长录音截断尾部以约束体积 */
export const SPEC_MAX_ROWS = 3600;
