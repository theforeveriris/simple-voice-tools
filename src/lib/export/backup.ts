/**
 * 完整备份（ZIP，含录音音频）
 * 结构：
 *   records.json        与「导出 JSON」完全相同的格式（records 数组）
 *   audio/{id}.{ext}    录音音频（扩展名由 blob.type 映射）
 * 恢复时按 id 去重合并记录，音频仅挂载到已存在的记录上。
 */

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { idbPutAudio } from '@/lib/storage/idb';
import { useHistoryStore } from '@/store/useHistoryStore';

const JSON_NAME = 'records.json';

/** 音频 Blob 类型 → 备份文件扩展名 */
export function extFor(blob: Blob): string {
  const t = blob.type || '';
  if (t.includes('webm')) return '.webm';
  if (t.includes('mp4')) return '.m4a';
  if (t.includes('ogg')) return '.ogg';
  if (t.includes('wav')) return '.wav';
  return '.bin';
}

function extMime(name: string): string {
  if (name.endsWith('.webm')) return 'audio/webm';
  if (name.endsWith('.m4a')) return 'audio/mp4';
  if (name.endsWith('.ogg')) return 'audio/ogg';
  if (name.endsWith('.wav')) return 'audio/wav';
  return 'application/octet-stream';
}

/** 下载任意 Blob（复用与 CSV 导出一致的触发方式） */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 打包并下载完整备份
 * 记录取自 IndexedDB 全量（界面列表有 200 条截断，直接读内存会漏掉更早的记录）
 * @returns 导出的记录条数与音频条数
 */
export async function exportFullBackup(): Promise<{ records: number; audio: number }> {
  const store = useHistoryStore.getState();
  const records = await store.getAllRecords();
  if (records.length === 0) return { records: 0, audio: 0 };

  const payload = {
    app: 'simple-voice-tools',
    version: 2,
    exportedAt: new Date().toISOString(),
    records,
  };
  // 音频已是压缩编码（Opus/AAC），只对 JSON 做压缩，音频用 store 直存省 CPU
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    [JSON_NAME]: [strToU8(JSON.stringify(payload)), { level: 6 }],
  };
  let audio = 0;
  for (const rec of records) {
    const blob = await store.getAudio(rec.id);
    if (!blob) continue;
    files[`audio/${rec.id}${extFor(blob)}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
    audio++;
  }
  const zipped = zipSync(files);
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  downloadBlob(
    `voice-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.zip`,
    new Blob([zipped], { type: 'application/zip' }),
  );
  return { records: records.length, audio };
}

export interface BackupImportResult {
  /** 新合并入的记录条数（不含已存在的） */
  records: number;
  /** 挂载的音频条数 */
  audio: number;
}

/**
 * 从 ZIP 备份恢复（记录按 id 去重合并，音频挂载到已存在的记录上）
 * @throws ZIP 损坏或缺少 records.json 时抛错
 */
export async function importFullBackup(file: File): Promise<BackupImportResult> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const jsonEntry = files[JSON_NAME] ?? files[`data/${JSON_NAME}`];
  if (!jsonEntry) throw new Error('备份中缺少 records.json');

  const parsed = JSON.parse(strFromU8(jsonEntry)) as { records?: unknown };
  const incoming = Array.isArray(parsed) ? parsed : parsed.records;
  if (!Array.isArray(incoming)) throw new Error('records.json 格式不正确');

  const store = useHistoryStore.getState();
  const added = store.importRecords(incoming as never);

  // 音频：文件名（去扩展名）即记录 id，只挂载到本地存在的记录
  const validIds = new Set(useHistoryStore.getState().records.map((r) => r.id));
  let audio = 0;
  for (const [name, data] of Object.entries(files)) {
    if (!name.startsWith('audio/') || name.endsWith('/')) continue;
    const base = name.slice('audio/'.length);
    const dot = base.lastIndexOf('.');
    const id = dot > 0 ? base.slice(0, dot) : base;
    if (!validIds.has(id)) continue;
    await idbPutAudio(id, new Blob([data], { type: extMime(name) }));
    audio++;
  }
  return { records: added, audio };
}
