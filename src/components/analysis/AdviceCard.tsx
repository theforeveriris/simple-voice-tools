/**
 * 训练建议卡（实验性）
 * adviceMode = rules：本地规则引擎生成（lib/advice.ts）；
 * adviceMode = llm：调用 设置 → 实验性功能 → 大模型配置 的接口（lib/llm.ts）。
 * 传入两条记录时（对比页）按 A / B 分组给规则建议，
 * 大模型则合并两份统计生成对比性建议。
 */

import { useEffect, useRef, useState } from 'react';
import { Lightbulb, Loader2, RefreshCw } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { buildAdvice, type AdviceTarget } from '@/lib/advice';
import { cachedLlmAdvice, fetchLlmAdvice, llmAdviceKey, resolveLlmConfig } from '@/lib/llm';
import { t } from '@/i18n';
import type { AnalysisRecord } from '@/types';

/** 建议卡通用骨架：标题行 + 内容 + 底部提示 */
export function AdviceCard({ records }: { records: AnalysisRecord[] }) {
  const adviceMode = useStore((s) => s.settings.adviceMode);
  const targetEnabled = useStore((s) => s.settings.targetEnabled);
  const targetMin = useStore((s) => s.settings.targetF0Min);
  const targetMax = useStore((s) => s.settings.targetF0Max);
  const baseUrl = useStore((s) => s.settings.llmBaseUrl);
  const apiKey = useStore((s) => s.settings.llmApiKey);
  const modelId = useStore((s) => s.settings.llmModelId);
  if (adviceMode === 'none') return null;
  const target: AdviceTarget = { enabled: targetEnabled, min: targetMin, max: targetMax };
  const cfg = resolveLlmConfig({ llmBaseUrl: baseUrl, llmApiKey: apiKey, llmModelId: modelId });
  return (
    <div className="rounded-[22px] bg-card p-4 shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)]">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Lightbulb size={13} className="text-accent" />
          {t('analysis.adviceTitle')}
        </span>
        <span className="text-[10px] text-ink-2">{t('settings.labs')}</span>
      </div>
      {adviceMode === 'llm'
        ? <LlmAdvice records={records} target={target} cfg={cfg} />
        : <RuleAdvice records={records} target={target} />}
      <p className="mt-2 px-0.5 text-[10px] leading-relaxed text-ink-2">
        {t(adviceMode === 'llm' ? 'analysis.adviceHintLlm' : 'analysis.adviceHint')}
      </p>
    </div>
  );
}

/** 规则判断：本地逐条生成；两条记录时按 A / B 分组 */
function RuleAdvice({ records, target }: { records: AnalysisRecord[]; target: AdviceTarget }) {
  const paired = records.length > 1;
  return (
    <div className={paired ? 'flex flex-col gap-2.5' : undefined}>
      {records.map((rec, i) => (
        <div key={rec.id}>
          {paired && (
            <div className="mb-1 flex items-center gap-1.5">
              <span
                className={`grid size-5 place-items-center rounded-full text-[10px] font-bold text-white ${i === 0 ? 'bg-accent' : 'bg-accent2'}`}
              >
                {i === 0 ? 'A' : 'B'}
              </span>
              <span className="text-[10px] text-ink-2">{fmtDate(rec.createdAt)}</span>
            </div>
          )}
          <ul className="flex flex-col gap-1.5">
            {buildAdvice(rec, target).map((tip) => (
              <li key={tip.key} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>{t(tip.key, tip.params)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface LlmState {
  /** 已收到结果的请求键（key#nonce），与当前请求键不一致即处于加载中 */
  doneKey: string | null;
  lines: string[];
  error: string | null;
}

/** 大模型判断：异步生成（会话内缓存，失败可重试） */
function LlmAdvice({
  records,
  target,
  cfg,
}: {
  records: AnalysisRecord[];
  target: AdviceTarget;
  cfg: ReturnType<typeof resolveLlmConfig>;
}) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<LlmState>({ doneKey: null, lines: [], error: null });
  // effect 按缓存键（值稳定）触发，输入经 ref 传递：键值不变则不重复请求
  const latest = useRef({ records, target, cfg });
  useEffect(() => {
    latest.current = { records, target, cfg };
  });
  const key = cfg ? llmAdviceKey(cfg, records, target) : null;
  const requestKey = key ? `${key}#${nonce}` : null;

  useEffect(() => {
    if (!key || !requestKey) return;
    const { cfg: curCfg, records: curRecords, target: curTarget } = latest.current;
    if (!curCfg) return;
    let alive = true;
    cachedLlmAdvice(key, () => fetchLlmAdvice(curRecords, curTarget, curCfg))
      .then((lines) => {
        if (alive) setState({ doneKey: requestKey, lines, error: null });
      })
      .catch((err: unknown) => {
        if (alive) {
          setState({
            doneKey: requestKey,
            lines: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [key, requestKey]);

  if (!cfg) {
    return <p className="px-0.5 text-xs leading-relaxed text-ink-2">{t('analysis.adviceLlmNoConfig')}</p>;
  }
  const loading = state.doneKey !== requestKey;
  if (loading) {
    return (
      <p className="flex items-center gap-2 px-0.5 text-xs text-ink-2">
        <Loader2 size={13} className="animate-spin text-accent" />
        {t('analysis.adviceLlmLoading')}
      </p>
    );
  }
  if (state.error != null) {
    return (
      <div className="flex flex-col gap-1.5 px-0.5">
        <p className="text-xs leading-relaxed text-ink">
          <span className="font-medium">{t('analysis.adviceLlmError')}</span>
          <span className="ml-1 break-all text-ink-2">{state.error}</span>
        </p>
        <button
          onClick={() => setNonce((n) => n + 1)}
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-70"
        >
          <RefreshCw size={12} />
          {t('analysis.adviceLlmRetry')}
        </button>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {state.lines.map((line, i) => (
        <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
