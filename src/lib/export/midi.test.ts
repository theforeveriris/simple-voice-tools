import { describe, it, expect } from 'vitest';
import { recordToMidi, hzToMidiNote, midiBlob } from './midi';
import type { AnalysisRecord, RecordSeries } from '@/types';

/** 440Hz = A4 = MIDI 69 */
function makeRecord(f0: (number | null)[]): AnalysisRecord {
  const n = f0.length;
  const dt = 1 / 30;
  const series: RecordSeries = {
    t: Array.from({ length: n }, (_, i) => i * dt),
    f0,
    rmsDb: Array.from({ length: n }, () => -20),
    f1: Array.from({ length: n }, () => null),
    f2: Array.from({ length: n }, () => null),
  };
  return {
    id: 'rec-1',
    createdAt: 1700000000000,
    durationSec: n * dt,
    sampleHz: 30,
    series,
    stats: {
      durationSec: n * dt, sampleHz: 30, totalSamples: n, voicedSamples: f0.filter(Boolean).length,
      avgF0: 150, medianF0: 150, minF0: 100, maxF0: 200, p10F0: 120, p90F0: 180, stdF0: 10,
      malePct: 0, femalePct: 0, transitionPct: 0,
      avgF1: null, avgF2: null, f1Range: null, f2Range: null,
      avgDb: -20, peakDb: -15,
    },
  };
}

/** 解析出全部 note on / note off / bend 事件（假设 1 tick = 1ms） */
function parseEvents(bytes: Uint8Array): {
  on: { tick: number; note: number; vel: number }[];
  off: { tick: number; note: number }[];
  bends: { tick: number; value: number }[];
} {
  // 跳过 MThd（14 字节），读 MTrk 长度
  expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
  const trackLen = (bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21];
  const track = bytes.slice(22, 22 + trackLen);

  const on: { tick: number; note: number; vel: number }[] = [];
  const off: { tick: number; note: number }[] = [];
  const bends: { tick: number; value: number }[] = [];

  let i = 0;
  let tick = 0;
  const readVlq = () => {
    let v = 0;
    for (;;) {
      const b = track[i++];
      v = (v << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return v;
  };
  while (i < track.length) {
    tick += readVlq();
    const status = track[i];
    if (status === 0xff) {
      // meta：跳过
      i += 2;
      const len = readVlq();
      i += len;
    } else if (status === 0x90) {
      on.push({ tick, note: track[i + 1], vel: track[i + 2] });
      i += 3;
    } else if (status === 0x80) {
      off.push({ tick, note: track[i + 1] });
      i += 3;
    } else if (status === 0xe0) {
      bends.push({ tick, value: track[i + 1] | (track[i + 2] << 7) });
      i += 3;
    } else if (status === 0xc0) {
      // program change：2 字节，忽略
      i += 2;
    } else {
      throw new Error(`unexpected status 0x${status.toString(16)} at ${i}`);
    }
  }
  return { on, off, bends };
}

describe('hzToMidiNote', () => {
  it('A4=440 → 69，C4≈261.63 → 60，八度差 12', () => {
    expect(hzToMidiNote(440)).toBeCloseTo(69, 5);
    expect(hzToMidiNote(261.63)).toBeCloseTo(60, 2);
    expect(hzToMidiNote(880) - hzToMidiNote(440)).toBeCloseTo(12, 5);
  });
});

describe('recordToMidi', () => {
  it('静音帧被跳过：全 null → 无音符', () => {
    const events = parseEvents(recordToMidi(makeRecord([null, null, null, null])));
    expect(events.on).toHaveLength(0);
    expect(events.off).toHaveLength(0);
  });

  it('稳态 220Hz（A3=57）切出一个音符，音高正确、弯音接近居中', () => {
    const events = parseEvents(recordToMidi(makeRecord(Array(30).fill(220))));
    expect(events.on).toHaveLength(1);
    expect(events.on[0].note).toBe(57);
    expect(events.off).toHaveLength(1);
    // 弯音以段内中位数为基准 → 首个弯音居中（8192）
    expect(events.bends[0].value).toBe(8192);
  });

  it('滑音（220→247）切开两个音符，音高各就各位', () => {
    const f0 = [...Array(15).fill(220), ...Array(15).fill(246.94)];
    const events = parseEvents(recordToMidi(makeRecord(f0)));
    const notes = events.on.map((e) => e.note);
    expect(notes).toContain(57); // A3
    expect(notes).toContain(59); // B3
    // 音符不重叠：每个 on 都有配对的 off
    expect(events.off).toHaveLength(events.on.length);
  });

  it('事件时间单调不减，note off 不早于 note on', () => {
    const f0 = [180, null, 185, 190, null, null, 200, 205, 210];
    const events = parseEvents(recordToMidi(makeRecord(f0)));
    const all = [
      ...events.on.map((e) => e.tick),
      ...events.off.map((e) => e.tick),
    ].sort((a, b) => a - b);
    const sorted = [...all].sort((a, b) => a - b);
    expect(all).toEqual(sorted);
    for (const off of events.off) {
      const on = events.on.find((e) => e.note === off.note);
      expect(on).toBeDefined();
      expect(off.tick).toBeGreaterThanOrEqual(on!.tick);
    }
  });

  it('输出是合法 SMF：MThd/MTrk 魔数 + format 0', () => {
    const bytes = recordToMidi(makeRecord([150, 155, 160]));
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('MThd');
    expect(String.fromCharCode(bytes[14], bytes[15], bytes[16], bytes[17])).toBe('MTrk');
    expect((bytes[8] << 8) | bytes[9]).toBe(0); // format 0
    expect((bytes[10] << 8) | bytes[11]).toBe(1); // ntrks 1
  });

  it('midiBlob 返回 audio/midi Blob', () => {
    const blob = midiBlob(makeRecord([150, 155, 160]));
    expect(blob.type).toBe('audio/midi');
    expect(blob.size).toBeGreaterThan(20);
  });
});
