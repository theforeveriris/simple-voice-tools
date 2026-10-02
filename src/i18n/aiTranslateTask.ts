/**
 * AI 翻译后台任务（语言子页）
 *
 * 任务状态存于模块级单例——语言子页卸载 / 切页 / 去别的页签都不影响生成，
 * 回到语言子页时经订阅恢复完整进度与日志。同一时刻只允许一个任务；
 * 取消经 AbortSignal 中断进行中的请求（已完成的批次保留在缓存中）。
 *
 * UI：语言子页的进度卡（进度条 + 批次明细 + 日志 + 取消按钮）。
 */

import { toast } from 'sonner';
import { t } from '@/i18n';
import {
  translateMissing, generateAiLocale, missingKeys,
  type TranslateProgress,
} from './aiLocale';
import { useStore } from '@/store/useStore';
import { resolveLlmConfig, type LlmConfig } from '@/lib/llm';

export interface AITaskLogEntry {
  at: number;
  text: string;
}

export interface AITaskState {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  /** 目标语言显示名 */
  label: string;
  /** 是否增量补全 */
  missingOnly: boolean;
  progress: TranslateProgress | null;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  /** 时间线日志（最新在末尾，环形上限） */
  log: AITaskLogEntry[];
}

const LOG_MAX = 60;

let state: AITaskState = {
  status: 'idle',
  label: '',
  missingOnly: false,
  progress: null,
  startedAt: 0,
  finishedAt: null,
  error: null,
  log: [],
};

const listeners = new Set<() => void>();
let abort: AbortController | null = null;
let seq = 0;

function notify(): void {
  for (const fn of listeners) fn();
}

function log(text: string): void {
  state = { ...state, log: [...state.log.slice(-(LOG_MAX - 1)), { at: Date.now(), text }] };
  notify();
}

function patch(part: Partial<AITaskState>): void {
  state = { ...state, ...part };
  notify();
}

/** 订阅任务状态（useSyncExternalStore） */
export function subscribeAITask(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getAITaskState(): AITaskState {
  return state;
}

/** 取消进行中的翻译（已完成批次保留在缓存中，不落库） */
export function cancelAITask(): void {
  abort?.abort();
}

/**
 * 启动翻译任务（全量或增量补全）。
 * @returns false = 已有任务在进行（本次未启动）
 */
export function startAITask(label: string, missingOnly: boolean): boolean {
  if (state.status === 'running') return false;
  const settings = useStore.getState().settings;
  const cfg: LlmConfig | null = resolveLlmConfig(settings);
  if (!cfg) {
    toast.error(t('toast.aiNeedLlm'));
    return false;
  }

  const id = ++seq;
  abort = new AbortController();
  const total = missingOnly ? missingKeys(label).length : 0;
  state = {
    status: 'running',
    label,
    missingOnly,
    progress: null,
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
    log: [{ at: Date.now(), text: t('aiLog.start', { label, n: missingOnly ? total : '—' }) }],
  };
  notify();

  void (async () => {
    const opts = { glossary: settings.aiGlossary, signal: abort?.signal };
    const onProgress = (p: TranslateProgress): void => {
      // 任务可被新任务替换（status 换主）：旧回调不再写状态
      if (state.status !== 'running' || state.startedAt === 0) return;
      patch({ progress: p });
      if (p.batch > 0) {
        log(t('aiLog.batch', { batch: p.batch, total: p.totalBatches, done: p.entriesDone, all: p.entriesTotal }));
      }
    };
    try {
      const result = missingOnly
        ? await translateMissing(label, cfg, onProgress, opts)
        : await generateAiLocale(label, cfg, onProgress, opts);
      if (id !== seq) return; // 已被更新的任务取代
      state = {
        ...state,
        status: 'done',
        finishedAt: Date.now(),
        log: [...state.log, { at: Date.now(), text: t('aiLog.done', { n: Object.keys(result.dict).length }) }],
      };
      notify();
      useStore.getState().updateSettings({ aiLanguage: result.label, language: 'ai' });
      toast.success(t('toast.aiDone', { label: result.label }));
    } catch (err) {
      if (id !== seq) return;
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      const msg = err instanceof Error ? err.message : String(err);
      state = {
        ...state,
        status: aborted ? 'cancelled' : 'error',
        finishedAt: Date.now(),
        error: aborted ? null : msg,
        log: [...state.log, { at: Date.now(), text: aborted ? t('aiLog.cancelled') : t('aiLog.error', { msg }) }],
      };
      notify();
      if (aborted) toast.info(t('toast.aiCancelled'));
      else toast.error(t('toast.aiFail', { msg }));
    } finally {
      abort = null;
    }
  })();

  return true;
}
