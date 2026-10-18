/**
 * Lua 沙箱（wasmoon，Lua 5.4 WASM）
 * 统一入口：惰性加载 VM（动态 import + wasm 独立 chunk，不占首屏与 SW 预缓存），
 * 脚本执行带超时（wasmoon 内建 debug-hook 看门狗），标准库白名单化：
 * 屏蔽 os / io / require / load* —— 脚本无 IO、无动态编译，宿主数据只经参数注入。
 * 五个消费方（建议规则 / 过滤器 / 花朵 / 分享卡 / Praat 桥）共用此模块。
 */

import type { LuaEngine } from 'wasmoon';

/** 解析 wasmoon 自带 glue.wasm 的绝对路径（浏览器走 Vite ?url 指纹资源；node/vitest 走文件系统） */
async function glueWasmUri(): Promise<string> {
  if (typeof document !== 'undefined') {
    // ?url 让 Vite 把 wasm 作为资源指纹打包（否则 wasmoon 默认去 unpkg CDN 拉，离线即挂）
    const mod = await import('wasmoon/dist/glue.wasm?url');
    return mod.default;
  }
  const { pathToFileURL } = await import('node:url');
  const path = await import('node:path');
  // vitest(node) 环境无 Vite 资源管线：直接从包目录读
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'wasmoon', 'dist', 'glue.wasm'),
  ];
  for (const p of candidates) {
    const fs = await import('node:fs');
    if (fs.existsSync(p)) return pathToFileURL(p).href;
  }
  throw new Error('glue.wasm not found');
}

/** 单次脚本执行上限（毫秒）：主线程协作式中断，防死循环卡 UI */
export const LUA_TIMEOUT_MS = 500;

let enginePromise: Promise<LuaEngine> | null = null;

/** 惰性创建全局共享 VM（首个 Lua 消费方触发，之后复用） */
export function getLuaEngine(): Promise<LuaEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const { LuaFactory } = await import('wasmoon');
      // env 显式给干净表：emscripten 会用 process.argv[1] 作 "_"（程序路径）注入环境，
      // 含非 latin1 字符（如中文目录名）时 wasm environ_get 的 latin1 断言直接 Abort
      const factory = new LuaFactory(await glueWasmUri(), {
        _: 'simple-voice-tool',
      } as Record<string, string>);
      const engine = await factory.createEngine({ functionTimeout: LUA_TIMEOUT_MS });
      // 收紧标准库：io/os 整表移除；require/load* 置 nil（无 IO、无常驻、无动态编译）
      await engine.doString(`
        os = nil
        io = nil
        require = nil
        load = nil
        loadstring = nil
        dofile = nil
        loadfile = nil
        collectgarbage = nil
      `);
      return engine;
    })().catch((err) => {
      enginePromise = null; // 失败可重试
      throw err;
    });
  }
  return enginePromise;
}

/** 执行结果：成功带值，失败带消息（UI 层展示） */
export type LuaResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** 递归把 null → undefined（Lua nil 语义），只处理可序列化数据 */
function stripNulls(v: unknown): unknown {
  if (v === null) return undefined;
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const stripped = stripNulls(val);
      if (stripped !== undefined) out[k] = stripped; // Lua 表本就没有「存在但 nil」的键
    }
    return out;
  }
  return v;
}

/**
 * 执行一段用户脚本，然后调用其定义的全局函数并取回返回值。
 * 调用方约定：脚本里必须定义 `fnName` 指定的全局函数。
 * 例：runLuaFn<number>('function double(x) return x*2 end', 'double', [21])
 * 超时/脚本错误统一折叠为 { ok: false, error }。
 */
export async function runLuaFn<T>(
  code: string,
  fnName: string,
  args: unknown[],
): Promise<LuaResult<T>> {
  let engine: LuaEngine;
  try {
    engine = await getLuaEngine();
  } catch (err) {
    return { ok: false, error: `Lua VM 加载失败：${String(err)}` };
  }
  try {
    await engine.doString(code);
    const fn = engine.global.get(fnName);
    if (typeof fn !== 'function') {
      return { ok: false, error: `脚本未定义全局函数 ${fnName}` };
    }
    // wasmoon 对 JS null 的压栈路径有缺陷（null.then Abort）：
    // 先 JSON 序列化剥离 undefined 函数/符号，null 由 stripNulls 转为 undefined（Lua 侧即 nil）
    const safeArgs = args.map(stripNulls);
    const result = await fn(...safeArgs);
    return { ok: true, value: result as T };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
