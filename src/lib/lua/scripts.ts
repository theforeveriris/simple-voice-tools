/**
 * Lua 鑴氭湰浠撳簱锛堝疄楠屾€с€岃剼鏈腑蹇冦€嶇殑鏁版嵁灞傦級
 * 鑴氭湰瀛?IndexedDB kv锛堜笉鍏ヨ缃?JSON锛屼綋绉彲鎺э級锛屾瘡鏉″甫鍚敤鎬佷笌鍐呯疆/鐢ㄦ埛鏍囪锛? * 鍐呯疆鑴氭湰纭紪鐮佷簬 builtin.ts锛堜笉鍙垹闄ゃ€佸彲鎭㈠锛夛紝鐢ㄦ埛鑴氭湰鍙鍏?瀵煎嚭/鍒嗕韩銆? */

import { idbGetKV, idbPutKV, idbDeleteKV } from '@/lib/storage/idb';
import { BUILTIN_SCRIPTS, type BuiltinScriptMeta } from './builtins';

/** 涓€鏉＄敤鎴疯剼鏈紙鍐呯疆鑴氭湰浠?builtin id 寮曠敤锛屼笉瀛樿繖閲岋級 */
export interface LuaUserScript {
  id: string;
  name: string;
  /** 娑堣垂鏂癸細advice = 寤鸿瑙勫垯锛堢幇闃舵浠呮涓€绉嶏紝鍚庣画鎵╁睍 filter/flower/card/praat锛?*/
  kind: 'advice';
  code: string;
  createdAt: number;
  updatedAt: number;
}

/** 缁熶竴鑴氭湰瑙嗗浘锛堝唴缃?+ 鐢ㄦ埛锛夛紝渚?UI 鍒楄〃涓庢墽琛屽眰 */
export interface LuaScriptView {
  id: string;
  name: string;
  kind: 'advice';
  code: string;
  builtin: boolean;
  enabled: boolean;
}

const KV_KEY = 'luaScripts';

/** node/vitest 鐜鐨勫唴瀛樺厹搴曪紙IndexedDB 涓嶅彲鐢ㄦ椂鑴氭湰鍒楄〃 = 浠呭唴缃級 */
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

/** 鍏ㄩ儴鐢ㄦ埛鑴氭湰锛堢畝鍗曡捣瑙佹暣瀛樻暣鍙栵紝鑴氭湰鏁伴噺绾ф槸涓綅鏁帮級 */
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

/* ------------------------- 鍚敤鎬侊紙鍐呯疆 + 鐢ㄦ埛鍏辩敤锛?------------------------- */

const ENABLED_KEY = 'luaScriptsEnabled';

async function getEnabledMap(): Promise<Record<string, boolean>> {
  return (await kvGet<Record<string, boolean>>(ENABLED_KEY)) ?? {};
}

async function setEnabledMap(map: Record<string, boolean>): Promise<void> {
  await kvPut(ENABLED_KEY, map);
}

/** 鍗曚釜鑴氭湰鍚仠锛堢己鐪?= 鍐呯疆榛樿鍚敤 / 鐢ㄦ埛鑴氭湰鍚敤锛?*/
export async function setScriptEnabled(id: string, enabled: boolean): Promise<void> {
  const map = await getEnabledMap();
  map[id] = enabled;
  await setEnabledMap(map);
}

/**
 * 鍏ㄩ儴鑴氭湰瑙嗗浘锛堝唴缃?+ 鐢ㄦ埛锛夛紝鍚堝苟鍚敤鎬併€? * 鍐呯疆榛樿鍚敤锛涚敤鎴疯剼鏈粯璁ゅ惎鐢ㄣ€傜鐢ㄦ€佸瓨 kv 鏄犲皠銆? */
export async function listScripts(): Promise<LuaScriptView[]> {
  const [users, enabled] = await Promise.all([getUserScripts(), getEnabledMap()]);
  const builtins: LuaScriptView[] = BUILTIN_SCRIPTS.map((b: BuiltinScriptMeta) => ({
    id: b.id,
    name: b.name,
    kind: 'advice',
    code: b.code,
    builtin: true,
    enabled: enabled[b.id] ?? true,
  }));
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

/** 瀵煎叆鏍煎紡锛堝垎浜?= 涓€娈?JSON锛涘鏉炬牎楠岋紝鍧忔暟鎹€愭潯涓㈠純锛?*/
export interface LuaScriptExport {
  version: 1;
  scripts: Array<{ name: string; kind: 'advice'; code: string }>;
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
      id: `lua-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: s.name.slice(0, 60),
      kind: 'advice',
      code: s.code,
      createdAt: 0,
      updatedAt: 0,
    });
    count++;
  }
  return count;
}

export function exportScripts(scripts: LuaScriptView[]): string {
  const payload: LuaScriptExport = {
    version: 1,
    scripts: scripts.map((s) => ({ name: s.name, kind: s.kind, code: s.code })),
  };
  return JSON.stringify(payload, null, 2);
}

export { idbDeleteKV };
