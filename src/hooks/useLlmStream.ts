/**
 * LLM 卡片共用的请求生命周期（AdviceCard / WeeklyReportCard 同一套状态机）
 * - 付费调用只由用户显式触发（start / retry / regenerate）；
 * - 缓存键变化（保存备注、同周新增录音等输入变化）绝不自动发起付费请求：
 *   新键已有缓存则静默免费重取，否则置 stale，展示旧结果 + 手动重取入口；
 * - 流式预览按 requestKey 归属，新一轮请求自动丢弃旧预览（也免去
 *   effect 内同步 setState 重置预览的必要）；
 * - 卸载不中断在途请求（跑完照常进缓存），与原有语义一致。
 */

import { useEffect, useRef, useState } from 'react';
import { isAbortError, type LlmAdviceResult } from '@/lib/llm';

export interface LlmStreamState {
  /** 已收到结果的请求键（key#nonce），与当前请求键不一致即处于加载中 */
  doneKey: string | null;
  result: LlmAdviceResult | null;
  error: string | null;
  /** 本轮请求被用户取消（区别于失败） */
  cancelled: boolean;
}

export function useLlmStream(opts: {
  /** 缓存键（null = 接口未配置） */
  key: string | null;
  /** 发起请求（signal / onDelta 透传给底层 fetch）；内部须走 cachedLlmAdvice / cachedWeeklyReport */
  run: (signal: AbortSignal, onDelta: (acc: string) => void) => Promise<LlmAdviceResult>;
  /** 该键是否已有缓存（内存或持久化）：决定键变化后能否静默免费重取 */
  checkCached: (key: string) => Promise<boolean>;
}): {
  enabled: boolean;
  start: () => void;
  /** 重试 / 重新生成：显式触发，无论缓存与否都重新走一遍缓存包装（失败重试 / 强制重取） */
  retry: () => void;
  abort: () => void;
  requestKey: string | null;
  /** 当前请求键的流式预览（{ key, text }；与 requestKey 不匹配即旧请求残留，不渲染） */
  stream: { key: string; text: string } | null;
  state: LlmStreamState;
  stale: boolean;
  loading: boolean;
} {
  const { key } = opts;
  const [enabled, setEnabled] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [stream, setStream] = useState<{ key: string; text: string } | null>(null);
  const [state, setState] = useState<LlmStreamState>({ doneKey: null, result: null, error: null, cancelled: false });
  /** 键变化后未自动重取（缓存未命中）：调用方展示旧结果并给手动重取入口 */
  const [stale, setStale] = useState(false);
  const requestKey = key ? `${key}#${nonce}` : null;

  // effect 按缓存键（值稳定）触发，输入经 ref 传递：键值不变则不重复请求
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });
  const abortRef = useRef<AbortController | null>(null);
  /** 下一次 effect 是否用户显式触发（start / retry 置位，effect 消费） */
  const explicitRef = useRef(false);

  const start = () => {
    explicitRef.current = true;
    setEnabled(true);
  };
  const retry = () => {
    explicitRef.current = true;
    setNonce((n) => n + 1);
  };
  const abort = () => abortRef.current?.abort();

  useEffect(() => {
    if (!enabled || !key || !requestKey) return;
    const cur = latest.current;
    const controller = new AbortController();
    abortRef.current = controller;
    let alive = true;
    let disposed = false;
    const explicit = explicitRef.current;
    explicitRef.current = false;

    const kickoff = () => {
      cur.run(controller.signal, (acc) => {
        if (alive) setStream({ key: requestKey, text: acc });
      })
        .then((result) => {
          if (alive) {
            setStale(false);
            setState({ doneKey: requestKey, result, error: null, cancelled: false });
          }
        })
        .catch((err: unknown) => {
          if (alive) {
            setStale(false);
            setState({
              doneKey: requestKey,
              result: null,
              error: isAbortError(err) ? null : err instanceof Error ? err.message : String(err),
              cancelled: isAbortError(err),
            });
          }
        })
        .finally(() => {
          if (abortRef.current === controller) abortRef.current = null;
        });
    };

    if (explicit) {
      kickoff();
    } else {
      // 键变化触发的自动重取：仅当已有缓存（免费）才静默取，否则停下等用户手动
      cur.checkCached(key).then((cached) => {
        if (disposed) return;
        if (!cached) {
          setStale(true);
          return;
        }
        kickoff();
      });
    }
    return () => {
      alive = false;
      disposed = true;
    };
  }, [enabled, key, requestKey]);

  const loading = enabled && !stale && state.doneKey !== requestKey;
  return { enabled, start, retry, abort, requestKey, stream, state, stale, loading };
}
