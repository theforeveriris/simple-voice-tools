/**
 * 助手消息内的记录图表（SVG 内联渲染）
 * 模型可在回复中用 `![说明](record://<recordId>/<kind>)` 引用某次记录的图，
 * 本模块把 URI 解析为对应记录的曲线 SVG（无 Canvas、无外部依赖，随气泡排版）。
 * 支持的 kind：pitch（音高）/ formant（F1/F2）/ energy（能量）/ vowel（元音散点）。
 * 记录不存在或 kind 未知时显示占位说明（不抛错——模型可能编造 id）。
 */

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { t } from '@/i18n';
import { useHistoryStore } from '@/store/useHistoryStore';
import type { AnalysisRecord, RecordSeries } from '@/types';

const KINDS = ['pitch', 'formant', 'energy', 'vowel'] as const;
type ChartKind = (typeof KINDS)[number];

function isKind(v: string): v is ChartKind {
  return (KINDS as readonly string[]).includes(v);
}

const ACCENT = 'var(--c-accent)';
const ACCENT2 = 'var(--c-accent2)';
const BAND_COLORS: Record<string, string> = {
  low: '#8B7BD8', male: '#4E8DF5', transition: '#26242E', female: '#F58FB8', high: '#D87BB8',
};
const BAND_BOUNDS = [85, 165, 180, 255];
const W = 320;
const H = 120;

function bandOf(f: number): string {
  if (f < BAND_BOUNDS[0]) return 'low';
  if (f < BAND_BOUNDS[1]) return 'male';
  if (f < BAND_BOUNDS[2]) return 'transition';
  if (f < BAND_BOUNDS[3]) return 'female';
  return 'high';
}

/** 音高折线段（按音区分段着色）；返回逐段 <polyline> 的 points */
function pitchSegments(s: RecordSeries): { color: string; points: string }[] {
  const tMax = Math.max(0.001, s.t[s.t.length - 1] ?? 1);
  const yOf = (f: number) => H - ((Math.min(520, Math.max(60, f)) - 60) / 460) * H;
  const segs: { color: string; points: string }[] = [];
  let cur: { color: string; pts: string[] } | null = null;
  for (let i = 0; i < s.t.length; i++) {
    const f = s.f0[i];
    if (f == null || !isFinite(f)) {
      if (cur) { segs.push({ color: cur.color, points: cur.pts.join(' ') }); cur = null; }
      continue;
    }
    const color = BAND_COLORS[bandOf(f)];
    const pt = `${((s.t[i] / tMax) * W).toFixed(1)},${yOf(f).toFixed(1)}`;
    if (cur && cur.color === color) cur.pts.push(pt);
    else {
      if (cur) segs.push({ color: cur.color, points: cur.pts.join(' ') });
      cur = { color, pts: [pt] };
    }
  }
  if (cur) segs.push({ color: cur.color, points: cur.pts.join(' ') });
  return segs;
}

/** 双值折线（F1 / F2 或通用 y 轴 0–3500Hz） */
function dualSegments(s: RecordSeries, key: 'f1' | 'f2'): { color: string; points: string }[] {
  const tMax = Math.max(0.001, s.t[s.t.length - 1] ?? 1);
  const yOf = (f: number) => H - (Math.min(3500, Math.max(0, f)) / 3500) * H;
  const vals = s[key];
  const pts: string[] = [];
  for (let i = 0; i < s.t.length; i++) {
    const v = vals[i];
    if (v == null || !isFinite(v)) continue;
    pts.push(`${((s.t[i] / tMax) * W).toFixed(1)},${yOf(v).toFixed(1)}`);
  }
  return [{ color: key === 'f1' ? ACCENT : ACCENT2, points: pts.join(' ') }];
}

/** 能量折线（-90–0 dBFS） */
function energyLine(s: RecordSeries): string {
  const tMax = Math.max(0.001, s.t[s.t.length - 1] ?? 1);
  const pts: string[] = [];
  for (let i = 0; i < s.t.length; i++) {
    const db = s.rmsDb[i];
    if (!isFinite(db)) continue;
    pts.push(`${((s.t[i] / tMax) * W).toFixed(1)},${(H - ((db + 90) / 90) * H).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** 元音散点（F1×F2，双对数倒置，与元音空间同方位） */
function vowelScatter(s: RecordSeries): { x: number; y: number }[] {
  const f1Axis: [number, number] = [200, 1100];
  const f2Axis: [number, number] = [600, 3000];
  const norm = (v: number, [lo, hi]: [number, number]) =>
    (Math.log(Math.min(hi, Math.max(lo, v))) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < s.t.length; i++) {
    const f1 = s.f1[i];
    const f2 = s.f2[i];
    if (s.f0[i] == null || f1 == null || f2 == null) continue;
    pts.push({ x: (1 - norm(f2, f2Axis)) * W, y: norm(f1, f1Axis) * H });
  }
  return pts;
}

/** 记录 → SVG（按 kind 分派）；返回 SVG 字符串（JSX 内嵌用） */
function chartSvg(rec: AnalysisRecord, kind: ChartKind): string {
  const s = rec.series;
  const frame =
    `<svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" style="background:var(--c-surface-hi);border-radius:8px">` +
    (kind === 'pitch'
      ? `<rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>`
      : '');
  let body = '';
  if (kind === 'pitch') {
    // 音区背景
    const bounds = [60, ...BAND_BOUNDS, 520];
    const names = ['low', 'male', 'transition', 'female', 'high'];
    for (let i = 0; i < 5; i++) {
      const yTop = H - ((Math.min(520, bounds[i + 1]) - 60) / 460) * H;
      const yBot = H - ((Math.max(60, bounds[i]) - 60) / 460) * H;
      body += `<rect x="0" y="${yTop.toFixed(1)}" width="${W}" height="${Math.max(0, yBot - yTop).toFixed(1)}" fill="${BAND_COLORS[names[i]]}" opacity="0.14"/>`;
    }
    for (const seg of pitchSegments(s)) {
      body += `<polyline fill="none" stroke="${seg.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${seg.points}"/>`;
    }
  } else if (kind === 'formant') {
    for (const seg of dualSegments(s, 'f1')) {
      body += `<polyline fill="none" stroke="${seg.color}" stroke-width="2" points="${seg.points}"/>`;
    }
    for (const seg of dualSegments(s, 'f2')) {
      body += `<polyline fill="none" stroke="${seg.color}" stroke-width="2" points="${seg.points}"/>`;
    }
  } else if (kind === 'energy') {
    body += `<polyline fill="none" stroke="${ACCENT}" stroke-width="1.5" points="${energyLine(s)}"/>`;
  } else {
    for (const p of vowelScatter(s)) {
      body += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="1.6" fill="${ACCENT}" opacity="0.35"/>`;
    }
  }
  return `${frame}${body}</svg>`;
}

/** 单个 record:// 引用的解析与渲染 */
function RecordImage({ recordId, kind, alt }: { recordId: string; kind: ChartKind; alt: string }) {
  const [rec, setRec] = useState<AnalysisRecord | null | 'loading'>('loading');
  useEffect(() => {
    let alive = true;
    void (async () => {
      const store = useHistoryStore.getState();
      if (!store.ready) await store.hydrate();
      const all = await store.getAllRecords();
      const hit = all.find((r) => r.id === recordId) ?? null;
      if (alive) setRec(hit);
    })();
    return () => { alive = false; };
  }, [recordId]);

  if (rec === 'loading') {
    return <span className="block h-16 animate-pulse rounded-lg bg-surface-hi/60" aria-label={alt} />;
  }
  if (rec == null) {
    return (
      <span className="flex items-center gap-1.5 rounded-lg bg-surface-hi/60 px-2.5 py-1.5 text-[10px] text-ink-2">
        <ImageOff size={11} />
        {t('assistant.chartMissing')}
      </span>
    );
  }
  const date = new Date(rec.createdAt);
  return (
    <figure className="my-1 block text-left">
      <span
        className="block [&>svg]:h-auto [&>svg]:w-full"
        // SVG 由本模块以固定常量拼装（无任何用户/模型文本进入属性），安全
        dangerouslySetInnerHTML={{ __html: chartSvg(rec, kind) }}
      />
      <figcaption className="mt-0.5 text-[10px] text-ink-2">
        {alt || t(`mode.${rec.mode ?? 'reading'}`)} · {date.getMonth() + 1}/{date.getDate()} · {t(`assistant.chart.${kind}`)}
      </figcaption>
    </figure>
  );
}

/**
 * 文本 → React 元素：先按 record:// 图片引用切分（引用独立渲染），
 * 其余文本走 Markdown。引用语法：![alt](record://<id>/<kind>)
 */
export function renderAssistantContent(text: string): { type: 'md' | 'img'; content: string; alt?: string; recordId?: string; kind?: ChartKind }[] {
  const parts: { type: 'md' | 'img'; content: string; alt?: string; recordId?: string; kind?: ChartKind }[] = [];
  const re = /!\[([^\]]*)\]\(record:\/\/([A-Za-z0-9-]+)\/(\w+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'md', content: text.slice(last, m.index) });
    const kind = m[3];
    parts.push({
      type: 'img',
      content: m[0],
      alt: m[1],
      recordId: m[2],
      kind: isKind(kind) ? kind : undefined,
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'md', content: text.slice(last) });
  return parts;
}

export { RecordImage };
