/**
 * WebDAV 云同步（零后端）
 * 复用完整备份管线：上传 / 下载单个 voice-backup-latest.zip（记录 + 全部录音音频），
 * 恢复走 importFullBackup（按 id 去重合并，音频仅补齐缺失）。
 * 凭据存于 IndexedDB kv 仓库，不进 localStorage。
 * 开启云备份加密后，ZIP 整体 AES-GCM 加密后再上传，拉取时按 magic 检测并解密
 * （见 backup/crypto.ts）。
 *
 * 注意：浏览器直连 WebDAV 要求服务器允许跨域（CORS），坚果云等部分服务商不支持；
 * 网络层失败会提示检查网络与跨域限制。
 */

import { idbGetKV, idbPutKV } from '@/lib/storage/idb';
import { buildFullBackupZip, importFullBackup, type BackupImportResult } from '@/lib/export/backup';
import {
  isBackupEncryptionEnabled, encryptForBackup, isEncryptedBackup, decryptBackupEnvelope,
} from '@/lib/backup/crypto';
import { t } from '@/i18n';

const KV_CONFIG = 'webdav:config';
const KV_LAST_PUSH = 'webdav:lastPush';

/** 云端固定文件名（同步语义：始终覆盖为最新一次上传） */
export const WEBDAV_BACKUP_NAME = 'voice-backup-latest.zip';

export interface WebdavConfig {
  /** 服务器地址（如 https://dav.jianguoyun.com/dav/ 或 NAS 地址） */
  url: string;
  username: string;
  password: string;
  /** 远程目录（可选，默认 svt-backup/） */
  dir?: string;
}

export async function getWebdavConfig(): Promise<WebdavConfig | null> {
  return (await idbGetKV<WebdavConfig>(KV_CONFIG)) ?? null;
}

export async function saveWebdavConfig(cfg: WebdavConfig): Promise<void> {
  await idbPutKV(KV_CONFIG, cfg);
}

export async function getWebdavLastPush(): Promise<number | null> {
  return (await idbGetKV<number>(KV_LAST_PUSH)) ?? null;
}

/** 已带本地化文案的错误（网络层兜底时原样放行） */
class WebdavError extends Error {}

function fail(status: number): never {
  throw new WebdavError(
    status === 401 || status === 403
      ? t('webdav.errAuth')
      : t('webdav.errHttp', { status }),
  );
}

/** fetch 抛出的网络层错误 → 本地化文案；已本地化的错误原样放行 */
function netFail(err: unknown): never {
  if (err instanceof WebdavError) throw err;
  console.error('WebDAV 请求失败:', err);
  throw new WebdavError(t('webdav.errNetwork'));
}

/** 规范化服务器地址（去尾斜杠）并拼接远程文件路径 */
function remoteUrl(cfg: WebdavConfig, filename: string): string {
  const base = cfg.url.replace(/\/+$/, '');
  const dir = (cfg.dir ?? 'svt-backup').replace(/^\/+|\/+$/g, '');
  const path = [dir, filename].filter(Boolean).join('/');
  return `${base}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function authHeader(cfg: WebdavConfig): string {
  return `Basic ${btoa(`${cfg.username}:${cfg.password}`)}`;
}

/** 连接测试：OPTIONS 请求，401/403 视为凭据错误 */
export async function testWebdav(cfg: WebdavConfig): Promise<void> {
  let res: Response;
  try {
    res = await fetch(remoteUrl(cfg, ''), {
      method: 'OPTIONS',
      headers: { Authorization: authHeader(cfg) },
    });
  } catch (err) {
    netFail(err);
  }
  if (!res.ok) fail(res.status);
}

export interface WebdavPushResult {
  records: number;
  audio: number;
}

/** 上传完整备份（记录 + 全部录音音频 ZIP），覆盖云端固定名文件；加密开启时整体加密 */
export async function pushWebdavBackup(cfg: WebdavConfig): Promise<WebdavPushResult> {
  const built = await buildFullBackupZip();
  if (!built) throw new WebdavError(t('toast.nothingToExport'));
  let body: BodyInit = built.blob;
  let contentType = 'application/zip';
  // 加密在联网前完成：未解锁时抛 BackupLockedError，由 UI 弹口令框后重试
  if (await isBackupEncryptionEnabled()) {
    body = await encryptForBackup(new Uint8Array(await built.blob.arrayBuffer()));
    contentType = 'application/octet-stream';
  }
  try {
    const res = await fetch(remoteUrl(cfg, WEBDAV_BACKUP_NAME), {
      method: 'PUT',
      headers: { Authorization: authHeader(cfg), 'Content-Type': contentType },
      body,
    });
    if (!res.ok) fail(res.status);
  } catch (err) {
    netFail(err);
  }
  await idbPutKV(KV_LAST_PUSH, Date.now());
  return { records: built.records, audio: built.audio };
}

/** 从 WebDAV 拉取备份并合并到本地（加密包自动检测并解密） */
export async function pullWebdavBackup(cfg: WebdavConfig): Promise<BackupImportResult> {
  let buf: ArrayBuffer;
  try {
    const res = await fetch(remoteUrl(cfg, WEBDAV_BACKUP_NAME), {
      headers: { Authorization: authHeader(cfg) },
    });
    if (res.status === 404) throw new WebdavError(t('webdav.errNoBackup'));
    if (!res.ok) fail(res.status);
    buf = await res.arrayBuffer();
  } catch (err) {
    netFail(err);
  }
  const raw = new Uint8Array(buf);
  const bytes = isEncryptedBackup(raw) ? await decryptBackupEnvelope(raw) : raw;
  const file = new File([bytes], WEBDAV_BACKUP_NAME, { type: 'application/zip' });
  return importFullBackup(file);
}
