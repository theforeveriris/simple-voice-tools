/**
 * 大模型结构化结果的通用渲染（分析页建议卡 / 历史页周报卡共用）
 * 总体评估 → 分维度评估（状态点 + 维度 + 状态 + 结论）→ 建议列表
 */

import { t } from '@/i18n';
import type { DictKey } from '@/i18n';
import type { AdviceAssessment, LlmAdviceResult } from '@/lib/llm';
import { cn } from '@/lib/utils';

/** 评估状态 → 圆点颜色 + 文案词条 */
const STATUS_META: Record<AdviceAssessment['status'], { dot: string; key: DictKey }> = {
  good: { dot: 'bg-accent', key: 'analysis.adviceStatusGood' },
  fair: { dot: 'bg-black/30', key: 'analysis.adviceStatusFair' },
  attention: { dot: 'bg-red-500', key: 'analysis.adviceStatusAttention' },
};

export function LlmResultView({ result }: { result: LlmAdviceResult }) {
  return (
    <div className="flex flex-col gap-2">
      {result.summary && (
        <p className="px-0.5 text-xs leading-relaxed text-ink">{result.summary}</p>
      )}
      {result.assessments.length > 0 && (
        <ul className="flex flex-col gap-1">
          {result.assessments.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
              <span
                className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', STATUS_META[a.status].dot)}
                aria-label={t(STATUS_META[a.status].key)}
                title={t(STATUS_META[a.status].key)}
              />
              <span>
                <span className="font-medium">{a.aspect}</span>
                <span className="text-ink-2"> · {t(STATUS_META[a.status].key)}</span>
                <span> — {a.comment}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {result.advice.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {result.advice.map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
