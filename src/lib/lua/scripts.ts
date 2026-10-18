/**
 * Lua 脚本仓库（实验性「脚本中心」的数据层）
 * 脚本存 IndexedDB kv（不入设置 JSON，体积可控），每条带启用态与内置/用户标记；
 * 内置脚本以 .lua 文件维护于 lua-scripts/（builtins.ts ?raw 导入），不可删除、可恢复；
 * 用户脚本可导入 .lua 单文件 / JSON 打包，可导出/分享。
 */

import { idbGetKV, idbPutKV } from '@/lib/storage/idb';
import {
  BUILTIN_SCRIPTS, BUILTIN_CARD_SCRIPTS, BUILTIN_EXPORT_SCRIPTS,
  type BuiltinScriptMeta,
} from './builtins';

/** 一条用户脚本（内置脚本以 builtin id 引用，不存这里） */
export interface LuaUserScript {
  id: string;
  name: string;
  /** 消费方：advice 建议规则 / card 分享卡模板 / flower 花朵生成 / export 自定义格式导出桥 */
  kind: 'advice' | 'card' | 'flower' | 'export';
  code: string;
  createdAt: number;
  updatedAt: number;
}

/** 统一脚本视图（内置 + 用户），供 UI 列表与执行层 */
export interface LuaScriptView {
  id: string;
  name: string;
  kind: 'advice' | 'card' | 'flower' | 'export';
  code: string;
  builtin: boolean;
  enabled: boolean;
}

const KV_KEY = 'luaScripts';

/** node/vitest 环境的内存兜底（IndexedDB 不可用时脚本列表 = 仅内置） */
const memoryStore = new Map<string, unknown>();
let idbBroken = false;

async function kvGet<T>(key: string): Promise<T | undefined> {
  if (idbBroken) return memoryStore.get(key) as T | undefined;
  try {
    return await idbGetKV<T>(key);
  } catch {
    idbBroken = true;
    return memoryStore.get(key) as T | undefined;
  }
}

async function kvPut(key: string, value: unknown): Promise<void> {
  memoryStore.set(key, value);
  if (idbBroken) return;
  try {
    await idbPutKV(key, value);
  } catch {
    idbBroken = true;
  }
}

/** 全部用户脚本（简单起见整存整取，脚本数量级是个位数） */
export async function getUserScripts(): Promise<LuaUserScript[]> {
  const list = await kvGet<LuaUserScript[]>(KV_KEY);
  return list ?? [];
}

export async function putUserScript(script: LuaUserScript): Promise<void> {
  const list = await getUserScripts();
  const now = Date.now();
  const next = list.filter((s) => s.id !== script.id);
  next.push({ ...script, createdAt: script.createdAt || now, updatedAt: now });
  await kvPut(KV_KEY, next);
}

export async function deleteUserScript(id: string): Promise<void> {
  const list = await getUserScripts();
  await kvPut(KV_KEY, list.filter((s) => s.id !== id));
}

/* ------------------------- 启用态（内置 + 用户共用） ------------------------- */

const ENABLED_KEY = 'luaScriptsEnabled';

async function getEnabledMap(): Promise<Record<string, boolean>> {
  return (await kvGet<Record<string, boolean>>(ENABLED_KEY)) ?? {};
}

async function setEnabledMap(map: Record<string, boolean>): Promise<void> {
  await kvPut(ENABLED_KEY, map);
}

/** 单个脚本启停（缺省 = 内置默认启用 / 用户脚本启用） */
export async function setScriptEnabled(id: string, enabled: boolean): Promise<void> {
  const map = await getEnabledMap();
  map[id] = enabled;
  await setEnabledMap(map);
}

/**
 * 全部脚本视图（内置 + 用户），合并启用态。
 * 内置默认启用；用户脚本默认启用。禁用态存 kv 映射。
 */
export async function listScripts(): Promise<LuaScriptView[]> {
  const [users, enabled] = await Promise.all([getUserScripts(), getEnabledMap()]);
  const fromBuiltin = (b: BuiltinScriptMeta, kind: LuaScriptView['kind']): LuaScriptView => ({
    id: b.id,
    name: b.name,
    kind,
    code: b.code,
    builtin: true,
    enabled: enabled[b.id] ?? true,
  });
  const builtins = [
    ...BUILTIN_SCRIPTS.map((b) => fromBuiltin(b, 'advice')),
    ...BUILTIN_CARD_SCRIPTS.map((b) => fromBuiltin(b, 'card')),
    ...BUILTIN_EXPORT_SCRIPTS.map((b) => fromBuiltin(b, 'export')),
  ];
  const userViews: LuaScriptView[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    kind: u.kind,
    code: u.code,
    builtin: false,
    enabled: enabled[u.id] ?? true,
  }));
  return [...builtins, ...userViews];
}

/** 导入格式（分享 = 一段 JSON；宽松校验，坏数据逐条丢弃） */
export interface LuaScriptExport {
  version: 1;
  scripts: Array<{ name: string; kind: 'advice' | 'card' | 'flower' | 'export'; code: string }>;
}

/** 新脚本 id（导入/新建共用） */
function newId(): string {
  return `lua-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function importScripts(raw: string): Promise<number> {
  const parsed = JSON.parse(raw) as LuaScriptExport;
  if (parsed?.version !== 1 || !Array.isArray(parsed.scripts)) {
    throw new Error('invalid script export');
  }
  let count = 0;
  for (const s of parsed.scripts) {
    if (typeof s?.name !== 'string' || typeof s?.code !== 'string' || !s.code.trim()) continue;
    await putUserScript({
      id: newId(),
      name: s.name.slice(0, 60),
      kind: s.kind === 'card' ? 'card' : 'advice',
      code: s.code,
      createdAt: 0,
      updatedAt: 0,
    });
    count++;
  }
  return count;
}

/**
 * 导入单个 .lua 文件：文件名（去扩展名）即脚本名，kind 固定 advice。
 * 返回导入数量（0 = 内容为空）。
 */
export async function importLuaFile(fileName: string, code: string): Promise<number> {
  const trimmed = code.trim();
  if (!trimmed) return 0;
  await putUserScript({
    id: newId(),
    name: (fileName.replace(/\.lua$/i, '').trim() || 'script').slice(0, 60),
    kind: 'advice',
    code: trimmed,
    createdAt: 0,
    updatedAt: 0,
  });
  return 1;
}

/** 导入 .lua 单文件或 JSON 打包（按扩展名/内容自动分派） */
export async function importAny(fileName: string, content: string): Promise<number> {
  if (/\.lua$/i.test(fileName) || !content.trimStart().startsWith('{')) {
    return importLuaFile(fileName, content);
  }
  return importScripts(content);
}

export function exportScripts(scripts: LuaScriptView[]): string {
  const payload: LuaScriptExport = {
    version: 1,
    scripts: scripts.map((s) => ({ name: s.name, kind: s.kind, code: s.code })),
  };
  return JSON.stringify(payload, null, 2);
}
