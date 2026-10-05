/**
 * GitHub 私有库云备份（OAuth Device Flow，零后端）
 *
 * 用户在设置页填入自己 OAuth App / GitHub App 的 Client ID：
 *   1. POST github.com/login/device/code 换取设备码与用户码
 *   2. 用户在 github.com/login/device 输入用户码并授权
 *   3. 轮询 github.com/login/oauth/access_token 获取令牌
 *      （GitHub App 返回的用户令牌约 8 小时过期，附带 refresh_token，
 *       本模块在其过期前 1 分钟自动续期；OAuth App 令牌长期有效）
 *   4. REST API 操作仓库（要求 GitHub App 已授予 Contents 读写并安装到目标仓库）
 *
 * 备份结构（覆盖式，不做逐次历史提交堆积）：
 *   data/records.json      记录（与本地导出 JSON 同格式）
 *   audio/{id}.{ext}       录音音频
 * 通过对比 git blob SHA（本地用 WebCrypto 计算）跳过未变化的文件。
 * 开启云备份加密后，每个文件先 AES-GCM 加密再上传——确定性 IV 保证
 * 同一明文密文稳定，SHA 跳过逻辑对密文依然成立（见 backup/crypto.ts）。
 * Token 存于 IndexedDB kv 仓库，不进 localStorage。
 */

import { strToU8 } from 'fflate';
import { idbGetKV, idbPutKV, idbDeleteKV, idbPutAudio } from '@/lib/storage/idb';
import { useHistoryStore } from '@/store/useHistoryStore';
import { extFor, buildRecordsPayload, parseRecordsPayload } from '@/lib/export/backup';
import {
  isBackupEncryptionEnabled, encryptForBackup, isEncryptedBackup, decryptBackupEnvelope,
} from '@/lib/backup/crypto';
import { audioMimeOf } from '@/lib/file';
import { t } from '@/i18n';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API = 'https://api.github.com';

const KV_TOKEN = 'gh:token';
const KV_LOGIN = 'gh:login';
const KV_LAST_PUSH = 'gh:lastPush';

/** 备份文件路径约定 */
export const BACKUP_JSON_PATH = 'data/records.json';
export const BACKUP_AUDIO_DIR = 'audio/';
/** 默认仓库名（可在设置中修改） */
export const DEFAULT_REPO = 'svt-backup';

export interface GhToken {
  accessToken: string;
  /** GitHub App 用户令牌的刷新令牌（OAuth App 无此字段） */
  refreshToken?: string;
  /** 令牌过期时间（epoch ms），undefined = 长期有效 */
  expiresAt?: number;
}

/** GitHub API 错误（携带状态码，供 404 分支判断） */
class GhError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------ Device Flow ------------------------------ */

export interface DeviceCodeInfo {
  deviceCode: string;
  userCode: string;
  verifyUri: string;
  intervalSec: number;
  expiresSec: number;
}

/** 步骤 1：请求设备码 */
export async function requestDeviceCode(clientId: string): Promise<DeviceCodeInfo> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: 'repo' }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok || data.error) {
    throw new Error(data.error_description ?? data.error ?? t('gh.errDeviceCode', { status: res.status }));
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verifyUri: data.verification_uri ?? 'https://github.com/login/device',
    intervalSec: Number(data.interval ?? 5),
    expiresSec: Number(data.expires_in ?? 900),
  };
}

type PollOutcome =
  | { status: 'ok'; token: GhToken }
  | { status: 'pending'; slowDown: boolean }
  | { status: 'fatal'; message: string };

/** 步骤 3：轮询一次令牌端点 */
async function pollOnce(clientId: string, deviceCode: string): Promise<PollOutcome> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (data.access_token) {
    return {
      status: 'ok',
      token: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || undefined,
        expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : undefined,
      },
    };
  }
  if (data.error === 'authorization_pending' || data.error === 'slow_down') {
    return { status: 'pending', slowDown: data.error === 'slow_down' };
  }
  // expired_token / access_denied / unsupported_grant_type 等不可恢复错误
  return { status: 'fatal', message: data.error_description ?? data.error ?? t('gh.errToken') };
}

/**
 * 步骤 2+3 的完整等待循环：直到用户完成授权、设备码过期或调用方取消
 * @param isCancelled 调用方提供的取消检查（如对话框关闭时置位）
 */
export async function waitForToken(
  clientId: string,
  info: DeviceCodeInfo,
  isCancelled: () => boolean,
): Promise<GhToken> {
  let intervalMs = Math.max(2, info.intervalSec) * 1000;
  const deadline = Date.now() + info.expiresSec * 1000;
  while (Date.now() < deadline) {
    if (isCancelled()) throw new Error(t('gh.errCancelled'));
    await sleep(intervalMs); // 遵守服务端间隔，快于要求会触发持续 slow_down
    if (isCancelled()) throw new Error(t('gh.errCancelled'));
    let outcome: PollOutcome;
    try {
      outcome = await pollOnce(clientId, info.deviceCode);
    } catch {
      continue; // 网络抖动：继续轮询直到设备码过期
    }
    if (outcome.status === 'ok') return outcome.token;
    if (outcome.status === 'fatal') throw new Error(outcome.message);
    if (outcome.slowDown) intervalMs += 5000; // RFC 8628：slow_down 需拉长间隔
  }
  throw new Error(t('gh.errTimeout'));
}

/** GitHub App 用户令牌续期 */
async function refreshAccessToken(clientId: string, refreshToken: string): Promise<GhToken> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!data.access_token) throw new Error(data.error_description ?? t('gh.errRefresh'));
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : undefined,
  };
}

/* ------------------------------ 令牌存取 ------------------------------ */

export async function storeGhToken(token: GhToken): Promise<void> {
  await idbPutKV(KV_TOKEN, token);
}

/** 连接收尾：保存令牌并记录登录名，返回 login */
export async function completeConnection(token: GhToken): Promise<string> {
  await storeGhToken(token);
  const login = await fetchLogin(token.accessToken);
  await idbPutKV(KV_LOGIN, login);
  return login;
}

export async function getStoredLogin(): Promise<string | null> {
  return (await idbGetKV<string>(KV_LOGIN)) ?? null;
}

export async function getLastPush(): Promise<number | null> {
  return (await idbGetKV<number>(KV_LAST_PUSH)) ?? null;
}

/** 断开连接：清除本地令牌与账号信息 */
export async function disconnectGithub(): Promise<void> {
  await idbDeleteKV(KV_TOKEN);
  await idbDeleteKV(KV_LOGIN);
  await idbDeleteKV(KV_LAST_PUSH);
}

/** 取可用令牌：过期前自动用 refresh_token 续期 */
export async function getValidToken(clientId: string): Promise<string> {
  const tok = await idbGetKV<GhToken>(KV_TOKEN);
  if (!tok) throw new Error(t('gh.errNotConnected'));
  const marginMs = 60_000;
  if (!tok.expiresAt || tok.expiresAt - marginMs > Date.now()) return tok.accessToken;
  if (!tok.refreshToken) throw new Error(t('gh.errExpired'));
  const fresh = await refreshAccessToken(clientId, tok.refreshToken);
  await idbPutKV(KV_TOKEN, fresh);
  return fresh.accessToken;
}

/* ------------------------------ REST 基础 ------------------------------ */

async function gh<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new GhError(res.status, body.message ?? t('gh.errApi', { status: res.status }));
  }
  return (await res.json()) as T;
}

async function ghRaw(path: string, token: string): Promise<ArrayBuffer> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new GhError(res.status, t('gh.errApi', { status: res.status }));
  return res.arrayBuffer();
}

export async function fetchLogin(token: string): Promise<string> {
  const user = await gh<{ login: string }>('/user', token);
  return user.login;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function toBase64(data: Uint8Array): string {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** 本地计算 git blob SHA-1，用于跳过未变化的文件 */
async function gitBlobSha(data: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${data.length}\0`);
  const merged = new Uint8Array(header.length + data.length);
  merged.set(header);
  merged.set(data, header.length);
  const digest = await crypto.subtle.digest('SHA-1', merged);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 确保私有备份库存在，返回 { owner, repo }（GitHub App 无建库权限时给出手动指引） */
async function ensureRepo(token: string, repoName: string): Promise<string> {
  const { login } = await gh<{ login: string }>('/user', token);
  try {
    const repo = await gh<{ private: boolean }>(`/repos/${encodeURIComponent(login)}/${encodeURIComponent(repoName)}`, token);
    if (!repo.private) throw new Error(t('gh.errNotPrivate', { repo: `${login}/${repoName}` }));
    return login;
  } catch (err) {
    if (!(err instanceof GhError) || err.status !== 404) throw err;
  }
  try {
    await gh('/user/repos', token, {
      method: 'POST',
      body: JSON.stringify({ name: repoName, private: true, description: t('gh.repoDesc') }),
    });
  } catch (err) {
    throw new Error(
      t('gh.errCreateRepo', {
        detail: err instanceof Error ? err.message : String(err),
        repo: repoName,
      }),
    );
  }
  return login;
}

/** 一次拉取远端文件树（path → blob sha）；空仓库返回空表 */
async function fetchRemoteShas(token: string, owner: string, repo: string): Promise<Map<string, string>> {
  try {
    const tree = await gh<{ tree: { path: string; sha: string; type: string }[] }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/HEAD?recursive=1`,
      token,
    );
    const map = new Map<string, string>();
    for (const e of tree.tree) if (e.type === 'blob') map.set(e.path, e.sha);
    return map;
  } catch {
    return new Map();
  }
}

function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const run = async (): Promise<void> => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      await worker(item);
    }
  };
  return Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run)).then(() => undefined);
}

/* ------------------------------ 推 / 拉 ------------------------------ */

export interface PushResult {
  pushed: number;
  skipped: number;
  records: number;
}

/**
 * 推送完整备份到私有仓库（覆盖式：记录 + 音频，未变化的文件自动跳过）
 */
export async function pushBackup(
  clientId: string,
  repoName: string,
  onProgress?: (done: number, total: number, phase: string) => void,
): Promise<PushResult> {
  const token = await getValidToken(clientId);
  const owner = await ensureRepo(token, repoName);
  const store = useHistoryStore.getState();
  // 全量记录：界面列表有截断，备份必须读 IndexedDB 全量，否则会静默漏掉更早的记录
  const records = await store.getAllRecords();
  if (records.length === 0) throw new Error(t('gh.errNoRecords'));

  onProgress?.(0, 1, t('gh.progressReadAudio'));
  const entries: { path: string; data: Uint8Array }[] = [];
  const payload = buildRecordsPayload(records);
  entries.push({ path: BACKUP_JSON_PATH, data: strToU8(JSON.stringify(payload)) });
  for (const rec of records) {
    const blob = await store.getAudio(rec.id);
    if (!blob) continue;
    entries.push({ path: `${BACKUP_AUDIO_DIR}${rec.id}${extFor(blob)}`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  // 云备份加密：逐文件加密后再算 blob SHA。未解锁时在联网前即抛 BackupLockedError，
  // 由 UI 弹口令框后整体重试（此时尚无任何远端写入，重试是干净的）
  if (await isBackupEncryptionEnabled()) {
    for (const entry of entries) entry.data = await encryptForBackup(entry.data);
  }

  const remoteShas = await fetchRemoteShas(token, owner, repoName);
  let done = 0;
  let pushed = 0;
  let skipped = 0;
  await runPool(entries, 4, async (entry) => {
    const sha = await gitBlobSha(entry.data);
    const existing = remoteShas.get(entry.path);
    if (existing && existing === sha) {
      skipped++;
    } else {
      const body: Record<string, unknown> = {
        message: `backup: update ${entry.path}`,
        content: toBase64(entry.data),
      };
      if (existing) body.sha = existing;
      await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/contents/${encodePath(entry.path)}`, token, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      pushed++;
    }
    done++;
    onProgress?.(done, entries.length, t('gh.progressUpload'));
  });

  const at = Date.now();
  await idbPutKV(KV_LAST_PUSH, at);
  return { pushed, skipped, records: records.length };
}

export interface PullResult {
  records: number;
  audio: number;
}

/**
 * 从私有仓库拉取备份并合并到本地（记录按 id 去重；音频仅补齐本地缺失的）
 */
export async function pullBackup(
  clientId: string,
  repoName: string,
  onProgress?: (done: number, total: number, phase: string) => void,
): Promise<PullResult> {
  const token = await getValidToken(clientId);
  const { login } = await gh<{ login: string }>('/user', token);
  const owner = login;

  const remoteShas = await fetchRemoteShas(token, owner, repoName);
  if (!remoteShas.has(BACKUP_JSON_PATH)) throw new Error(t('gh.errNoBackup', { repo: repoName }));

  onProgress?.(0, 1, t('gh.progressFetchRecords'));
  const rawJson = await ghRaw(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/contents/${encodePath(BACKUP_JSON_PATH)}`, token);
  // 旧备份为明文，新备份可能整文件加密——按 magic 判断后解密
  const jsonBytes = isEncryptedBackup(new Uint8Array(rawJson))
    ? await decryptBackupEnvelope(new Uint8Array(rawJson))
    : rawJson;
  // 与 ZIP 恢复同一套格式/版本校验（v1/v2 可读，更新版本拒绝）
  const { records: incoming } = parseRecordsPayload(new TextDecoder().decode(jsonBytes));
  const added = useHistoryStore.getState().importRecords(incoming);

  // 云端音频中，本地缺失的部分
  const store = useHistoryStore.getState();
  const validIds = new Set(useHistoryStore.getState().records.map((r) => r.id));
  const audioPaths: { path: string; id: string }[] = [];
  for (const path of remoteShas.keys()) {
    if (!path.startsWith(BACKUP_AUDIO_DIR)) continue;
    const base = path.slice(BACKUP_AUDIO_DIR.length);
    const dot = base.lastIndexOf('.');
    const id = dot > 0 ? base.slice(0, dot) : base;
    if (!validIds.has(id)) continue;
    if (await store.getAudio(id)) continue; // 本地已有，跳过
    audioPaths.push({ path, id });
  }

  let done = 0;
  await runPool(audioPaths, 4, async ({ path, id }) => {
    const raw = await ghRaw(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/contents/${encodePath(path)}`, token);
    const bytes = isEncryptedBackup(new Uint8Array(raw)) ? await decryptBackupEnvelope(new Uint8Array(raw)) : raw;
    await idbPutAudio(id, new Blob([bytes], { type: audioMimeOf(path) }));
    done++;
    onProgress?.(done, audioPaths.length, t('gh.progressFetchAudio'));
  });

  return { records: added, audio: audioPaths.length };
}
