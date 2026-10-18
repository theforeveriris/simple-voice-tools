/**
 * 音高曲线 → MIDI 导出（SMF 格式 0，单轨）
 * 把 F0 曲线量化成音符 + 弯音（pitch bend）写入标准 MIDI 文件：
 *   - 音符：按音高变化切分（相邻有声帧音分差超过阈值即开新音符），音符音高取段内音分中位数的最近半音
 *   - 弯音：音符起点对齐到实际音分（±2 半音范围），段内缓变跟随中位数漂移（每段最多 8 个弯音事件）
 * 结果：DAW 里开进来就是一个带弯音的单声部轨道，与原曲对齐对照；无弯音偏好时也可直接看音符。
 *
 * 格式依据（MIDI 1.0 SMF 规范）：
 *   - MThd 头：'MThd' + 长度 6 + format 0 + ntrks 1 + division（480 tick/四分音）
 *   - MTrk：'MTrk' + 长度 + delta-time(VLQ) + 事件
 *   - 弯音：0xE0，14 位精度（0 = -2 半音，8192 = 居中，16383 = +2 半音）
 */

import type { AnalysisRecord } from '@/types';

const TPQN = 480; // ticks per quarter note
/** 时间分辨率：1 tick = 1ms（四分音 = 500ms = 480 tick → tempo 取 120，微秒/四分音 = 500000） */
const PITCHBEND_RANGE_SEMITONES = 2;
const PITCHBEND_CENTER = 8192;
/** 音高差超过该音分数则切新音符（约 0.4 半音，语调曲线的正常滑动不应切碎音符） */
const NOTE_SPLIT_CENTS = 40;
/** 音符最短时长（秒）：过短的碎片直接丢弃 */
const MIN_NOTE_SEC = 0.06;
/** 段内弯音事件数上限（MIDI 弯音事件很密会卡某些 DAW） */
const MAX_BEND_EVENTS_PER_NOTE = 8;

/** A4 = 440Hz 的 MIDI 音符编号 69 */
export function hzToMidiNote(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

interface NoteSeg {
  startSec: number;
  endSec: number;
  /** 段内音分中位数对应的频率（Hz），弯音以此为基准 */
  medianHz: number;
  midiNote: number;
}

/** 把有声帧切成音符段（滑动中位数窗口平滑后再切，抗孤帧毛刺） */
function segmentNotes(t: number[], f0: (number | null)[]): NoteSeg[] {
  // 有声帧序列 [time, hz]
  const voiced: [number, number][] = [];
  for (let i = 0; i < t.length; i++) {
    const f = f0[i];
    if (f != null && isFinite(f) && f > 0) voiced.push([t[i], f]);
  }
  if (voiced.length === 0) return [];

  // 滑动中位数（窗口 3）：去孤帧毛刺，不破坏真实滑音
  const smoothed: [number, number][] = voiced.map(([tt], i) => {
    const a = voiced[Math.max(0, i - 1)][1];
    const b = voiced[i][1];
    const c = voiced[Math.min(voiced.length - 1, i + 1)][1];
    const three = [a, b, c].sort((x, y) => x - y);
    return [tt, three[1]];
  });

  // 按音分跳变切段
  const segs: NoteSeg[] = [];
  let segStart = 0;
  const centsOf = (hz: number) => hzToMidiNote(hz) * 100;
  for (let i = 1; i <= smoothed.length; i++) {
    const boundary = i === smoothed.length
      || Math.abs(centsOf(smoothed[i][1]) - centsOf(smoothed[i - 1][1])) > NOTE_SPLIT_CENTS;
    if (!boundary) continue;
    const slice = smoothed.slice(segStart, i);
    const startSec = slice[0][0];
    const endSec = i < smoothed.length ? smoothed[i][0] : slice[slice.length - 1][0] + frameGap(smoothed);
    if (endSec - startSec >= MIN_NOTE_SEC) {
      const hzs = slice.map(([, h]) => h).sort((a, b) => a - b);
      const medianHz = hzs[Math.floor(hzs.length / 2)];
      segs.push({
        startSec,
        endSec,
        medianHz,
        midiNote: Math.round(hzToMidiNote(medianHz)),
      });
    }
    segStart = i;
  }
  return segs;
}

/** 帧间距估计（最后一段的结束时间用「末帧时间 + 平均帧距」兜底） */
function frameGap(voiced: [number, number][]): number {
  if (voiced.length < 2) return 0.033;
  const span = voiced[voiced.length - 1][0] - voiced[0][0];
  return span / (voiced.length - 1);
}

/* ------------------------------ VLQ 与字节流 ------------------------------ */

/** 可变长度数量（variable-length quantity）编码 */
function vlq(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const buf = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    buf.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return buf;
}

class ByteBuf {
  private bytes: number[] = [];

  push(...bs: number[]): void {
    this.bytes.push(...bs);
  }

  pushStr(s: string): void {
    for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i));
  }

  pushU32(v: number): void {
    this.bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  }

  pushU16(v: number): void {
    this.bytes.push((v >>> 8) & 0xff, v & 0xff);
  }

  get length(): number {
    return this.bytes.length;
  }

  bytes8(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/** Hz → 弯音 14 位值（以 medianHz 为 0 偏移基准，范围 ±2 半音） */
function bendValue(hz: number, centerHz: number): number {
  const semitones = 12 * Math.log2(hz / centerHz);
  const clamped = Math.max(-PITCHBEND_RANGE_SEMITONES, Math.min(PITCHBEND_RANGE_SEMITONES, semitones));
  return Math.round(PITCHBEND_CENTER + (clamped / PITCHBEND_RANGE_SEMITONES) * (PITCHBEND_CENTER - 1));
}

/**
 * F0 曲线 → MIDI 文件字节（format 0 单轨）。
 * 1 tick = 1ms；tempo 120（500000 µs/qn）配 TPQN=480。
 */
export function recordToMidi(record: AnalysisRecord): Uint8Array {
  const segs = segmentNotes(record.series.t, record.series.f0);
  const buf = new ByteBuf();

  // ---- MThd ----
  buf.pushStr('MThd');
  buf.pushU32(6);
  buf.pushU16(0); // format 0
  buf.pushU16(1); // ntrks
  buf.pushU16(TPQN);

  // ---- MTrk ----
  const track = new ByteBuf();
  // tempo meta：120 BPM
  track.push(...vlq(0), 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20);
  // program change：0 号 Acoustic Grand（音色不重要，看音符与弯音）
  track.push(...vlq(0), 0xc0, 0x00);

  interface Ev { tick: number; order: number; data: number[] }
  const events: Ev[] = [];
  const secToTick = (s: number) => Math.max(0, Math.round(s * 1000));

  for (const seg of segs) {
    const startTick = secToTick(seg.startSec);
    const endTick = Math.max(startTick + 1, secToTick(seg.endSec));
    const vel = 90;

    // 音符起点弯音：实际音分偏移
    const startBend = bendValue(seg.medianHz, 440 * Math.pow(2, (seg.midiNote - 69) / 12));
    events.push({ tick: startTick, order: 0, data: [0xe0, startBend & 0x7f, (startBend >> 7) & 0x7f] });
    events.push({ tick: startTick, order: 1, data: [0x90, seg.midiNote & 0x7f, vel] });

    // 段内漂移弯音：最多 MAX_BEND_EVENTS_PER_NOTE 个均匀采样
    const drift = seg.endSec - seg.startSec > 0.12 ? Math.min(MAX_BEND_EVENTS_PER_NOTE, Math.floor((seg.endSec - seg.startSec) * 20)) : 0;
    for (let k = 1; k <= drift; k++) {
      const frac = k / (drift + 1);
      // 段内取对应位置的帧频率（线性插值）
      const time = seg.startSec + frac * (seg.endSec - seg.startSec);
      const hz = hzAt(voicedFrames(record), time);
      if (hz == null) continue;
      const bv = bendValue(hz, 440 * Math.pow(2, (seg.midiNote - 69) / 12));
      events.push({ tick: secToTick(time), order: 0, data: [0xe0, bv & 0x7f, (bv >> 7) & 0x7f] });
    }

    // note off（顺序放 tick 末尾：先 bend 后 off 由 order 排）
    events.push({ tick: endTick, order: 0, data: [0x80, seg.midiNote & 0x7f, 0x40] });
  }

  // 同 tick 排序：弯音在 note on 前、note off 在其他前 —— 用 order 稳定排序
  // note off 特殊：需要先于下一音符的 bend+on。统一策略：off order = -1，bend order = 0，on order = 1
  for (const e of events) {
    if (e.data[0] === 0x80) e.order = -1;
    else if (e.data[0] === 0x90) e.order = 1;
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  let lastTick = 0;
  for (const e of events) {
    track.push(...vlq(e.tick - lastTick), ...e.data);
    lastTick = e.tick;
  }
  // end of track
  track.push(...vlq(0), 0xff, 0x2f, 0x00);

  buf.pushStr('MTrk');
  buf.pushU32(track.length);
  buf.push(...track.bytes8());

  return buf.bytes8();
}

/** 供弯音漂移采样用的有声帧（时间升序） */
function voicedFrames(record: AnalysisRecord): [number, number][] {
  const out: [number, number][] = [];
  const { t, f0 } = record.series;
  for (let i = 0; i < t.length; i++) {
    const f = f0[i];
    if (f != null && isFinite(f) && f > 0) out.push([t[i], f]);
  }
  return out;
}

/** 时间处 Hz（线性插值；区间外 null） */
function hzAt(frames: [number, number][], time: number): number | null {
  if (frames.length === 0) return null;
  if (time <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t0, f0] = frames[i - 1];
    const [t1, f1] = frames[i];
    if (time <= t1) return f0 + (f1 - f0) * ((time - t0) / (t1 - t0 || 1e-9));
  }
  return null;
}

/** MIDI 文件 Blob（下载用） */
export function midiBlob(record: AnalysisRecord): Blob {
  return new Blob([recordToMidi(record) as unknown as BlobPart], { type: 'audio/midi' });
}
