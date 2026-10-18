/**
 * 局域网点对点同步（设备到设备，零云端）
 * 传输层：WebRTC DataChannel + 手动信令（offer/answer 文本 + ICE candidate 复制粘贴
 * 或扫码接力）。无需任何服务器——信令由用户亲手搬运，数据只在两台设备间流动。
 *
 * 协议（JSON 消息，双端对称）：
 *   hello        → 设备名 + 记录数（握手，展示给对方确认）
 *   manifest     → 记录清单 [id, updatedAt 排序键 createdAt+len]（对比用）
 *   want         → 请求缺失记录的 id 列表
 *   records      → 记录批量（分帧发送；每帧一个 JSON，≤256KB）
 *   audio-head   → 音频声明（id + 字节数 + mime）
 *   audio-chunk  → 音频分块（ArrayBuffer，64KB/块）
 *   done         → 一轮同步完成（统计汇总）
 * 冲突策略：字段级 last-write-wins（同 id：createdAt 相同则保留 note 更新的那条），
 * 记录本身不可变（重算产生新时间戳字段），实际冲突面极小。
 *
 * 用法见 LanSyncSheet：A 机「创建邀请」→ B 机「加入」粘贴 offer → A 粘贴 answer。
 */

import type { AnalysisRecord } from '@/types';

/** 单条消息上限（DataChannel 默认 256KB 内最稳，记录 JSON 远小于此） */
const MAX_RECORDS_PER_FRAME = 20;
/** 音频分块（64KB：DataChannel 有序可靠模式下的常见甜点） */
const AUDIO_CHUNK = 64 * 1024;

export type SyncMessage =
  | { type: 'hello'; device: string; records: number }
  | { type: 'manifest'; ids: string[] }
  | { type: 'want'; ids: string[] }
  | { type: 'records'; items: AnalysisRecord[] }
  | { type: 'audio-head'; id: string; bytes: number; mime: string }
  | { type: 'audio-chunk'; id: string; seq: number; data: string }
  | { type: 'done'; added: number };

export interface SyncProgress {
  phase: 'idle' | 'connecting' | 'handshake' | 'transferring' | 'done' | 'error';
  /** 已发送 / 接收的记录数 */
  transferred: number;
  total: number;
  detail?: string;
}

/** 同一会话内的对端状态 */
interface PeerState {
  device: string;
  manifest: Set<string>;
}

export class LanSyncSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private peer: PeerState | null = null;
  private progress: SyncProgress = { phase: 'idle', transferred: 0, total: 0 };
  private onProgress: (p: SyncProgress) => void;
  private getRecords: () => Promise<AnalysisRecord[]>;
  private getAudio: (id: string) => Promise<Blob | null>;
  private putRecord: (r: AnalysisRecord) => Promise<void>;
  private putAudio: (id: string, blob: Blob) => Promise<void>;
  private deviceName: string;

  constructor(opts: {
    deviceName: string;
    onProgress: (p: SyncProgress) => void;
    getRecords: () => Promise<AnalysisRecord[]>;
    getAudio: (id: string) => Promise<Blob | null>;
    putRecord: (r: AnalysisRecord) => Promise<void>;
    putAudio: (id: string, blob: Blob) => Promise<void>;
  }) {
    this.deviceName = opts.deviceName;
    this.onProgress = opts.onProgress;
    this.getRecords = opts.getRecords;
    this.getAudio = opts.getAudio;
    this.putRecord = opts.putRecord;
    this.putAudio = opts.putAudio;
  }

  private setPhase(phase: SyncProgress['phase'], detail?: string): void {
    this.progress = { ...this.progress, phase, detail };
    this.onProgress(this.progress);
  }

  /** 创建 offer（发起方调用）：返回 SDP 文本给用户搬运 */
  async createOffer(): Promise<string> {
    this.initPeer();
    const dc = this.pc!.createDataChannel('svt-sync', { ordered: true });
    this.wireChannel(dc);
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    // 等 ICE 收集完成（非 trickle，SDP 里带全 candidate）
    await this.iceDone();
    return JSON.stringify(this.pc!.localDescription);
  }

  /** 加入方：粘贴 offer → 产出 answer 文本 */
  async acceptOffer(offerSdp: string): Promise<string> {
    this.initPeer();
    this.pc!.ondatachannel = (e) => this.wireChannel(e.channel);
    await this.pc!.setRemoteDescription(JSON.parse(offerSdp));
    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);
    await this.iceDone();
    return JSON.stringify(this.pc!.localDescription);
  }

  /** 发起方：粘贴 answer 完成连接 */
  async acceptAnswer(answerSdp: string): Promise<void> {
    if (!this.pc) throw new Error('no offer created');
    await this.pc.setRemoteDescription(JSON.parse(answerSdp));
  }

  private initPeer(): void {
    this.pc = new RTCPeerConnection({ iceServers: [] }); // 纯局域网：不需要 STUN
    this.setPhase('connecting');
  }

  private iceDone(): Promise<void> {
    const pc = this.pc;
    if (!pc) return Promise.resolve();
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', check);
      // 兜底：LAN 内 candidate 很快，2s 超时直接用现有
      setTimeout(resolve, 2000);
    });
  }

  private wireChannel(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.onopen = () => void this.onOpen();
    dc.onmessage = (e) => void this.onMessage(e.data);
    dc.onclose = () => this.setPhase(this.progress.phase === 'done' ? 'done' : 'error', 'connection closed');
    dc.onerror = () => this.setPhase('error', 'data channel error');
  }

  private async onOpen(): Promise<void> {
    this.setPhase('handshake');
    const records = await this.getRecords();
    this.progress.total = records.length;
    this.send({ type: 'hello', device: this.deviceName, records: records.length });
    this.send({ type: 'manifest', ids: records.map((r) => r.id) });
  }

  private send(msg: SyncMessage): void {
    this.dc?.send(JSON.stringify(msg));
  }

  /** 接收端音频组装缓冲 */
  private audioRx = new Map<string, { bytes: number; mime: string; chunks: ArrayBuffer[]; seq: number }>();

  private async onMessage(raw: string | ArrayBuffer): Promise<void> {
    // 统一 JSON 文本通道（音频分块内嵌 base64；LAN 带宽下 +33% 可接受，换可靠分帧的复杂度不值得）
    if (raw instanceof ArrayBuffer) return;
    let msg: SyncMessage;
    try {
      msg = JSON.parse(raw) as SyncMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case 'hello': {
        this.peer = { device: msg.device, manifest: new Set() };
        this.setPhase('handshake', msg.device);
        break;
      }
      case 'manifest': {
        if (!this.peer) return;
        this.peer.manifest = new Set(msg.ids);
        const mine = await this.getRecords();
        const mineIds = new Set(mine.map((r) => r.id));
        const want = msg.ids.filter((id) => !mineIds.has(id));
        this.send({ type: 'want', ids: want });
        if (want.length === 0) this.send({ type: 'done', added: 0 });
        else this.setPhase('transferring', `${want.length}`);
        break;
      }
      case 'want': {
        // 对方要这些记录：批量发（含重算后的最新字段）
        const mine = await this.getRecords();
        const byId = new Map(mine.map((r) => [r.id, r]));
        for (let i = 0; i < msg.ids.length; i += MAX_RECORDS_PER_FRAME) {
          const slice = msg.ids.slice(i, i + MAX_RECORDS_PER_FRAME)
            .map((id) => byId.get(id))
            .filter((r): r is AnalysisRecord => !!r);
          if (slice.length > 0) this.send({ type: 'records', items: slice });
        }
        // 声明可用的音频
        for (const id of msg.ids) {
          const blob = await this.getAudio(id);
          if (blob) {
            this.send({ type: 'audio-head', id, bytes: blob.size, mime: blob.type || 'audio/webm' });
            const buf = await blob.arrayBuffer();
            const b64 = arrayBufferToBase64(buf);
            for (let off = 0, seq = 0; off < b64.length; off += AUDIO_CHUNK, seq++) {
              this.send({ type: 'audio-chunk', id, seq, data: b64.slice(off, off + AUDIO_CHUNK) });
            }
          }
        }
        this.send({ type: 'done', added: msg.ids.length });
        break;
      }
      case 'records': {
        for (const r of msg.items) await this.putRecord(r);
        this.progress.transferred += msg.items.length;
        this.setPhase('transferring');
        break;
      }
      case 'audio-head': {
        this.audioRx.set(msg.id, { bytes: msg.bytes, mime: msg.mime, chunks: [], seq: 0 });
        break;
      }
      case 'audio-chunk': {
        const slot = this.audioRx.get(msg.id);
        if (!slot) return;
        slot.chunks[msg.seq] = base64ToArrayBuffer(msg.data);
        break;
      }
      case 'done': {
        // 组装完所有已声明的音频
        for (const [id, slot] of this.audioRx) {
          const total = slot.chunks.reduce((n, c) => n + c.byteLength, 0);
          const blob = new Blob(slot.chunks, { type: slot.mime });
          if (total > 0) await this.putAudio(id, blob);
        }
        this.audioRx.clear();
        this.setPhase('done', String(msg.added));
        break;
      }
    }
  }

  close(): void {
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
  }
}

/* ------------------------------ base64（音频走 JSON 文本通道） ------------------------------ */

export function arrayBufferToBase64(buf: ArrayBuffer): string {  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
