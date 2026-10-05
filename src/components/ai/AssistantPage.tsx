/**
 * AI 助手（大模型子页面入口的独立全屏页）
 * - 顶栏：左上退出 + 右上历史侧边栏开关
 * - 消息流：AI 气泡带头像（左）/ 用户气泡（右）；点按气泡在其下方浮出
 *   复制 / 重做 / 分支（重做 = 截断到该消息之前重新生成；分支 = 以该消息为
 *   结尾复制出一个新对话）
 * - 底部输入栏：随内容自动增高（上限后内部滚动），生成中变为停止按钮
 * - 右侧抽屉：新建对话 + 历史列表（点按切换、两步删除）
 * 对话存 IndexedDB（llm:chats，封顶 30 条）；生成走活动档案 + 多轮流式接口。
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ArrowUp, Bot, Copy, GitBranch, PanelRight, Plus, RotateCcw, Square, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import { useI18n } from '@/i18n/hook';
import { isAbortError, languageName, llmChatStreamMessages } from '@/lib/llm';
import { useActiveLlmConfig } from '@/lib/llmProfiles';
import {
  addMessage, createChat, deleteChat, getChat, setMessages, useChats, type ChatMessage,
} from '@/lib/llmChats';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

/** 助手系统提示词：明确工具定位与边界，按界面语言回答 */
function systemPrompt(): string {
  return [
    '你是 Simple Voice Tool 内置的 AI 助手——一个严肃的嗓音测量、分析与训练追踪工具。',
    '回答简洁、务实、有依据；涉及嗓音训练时给出可操作的练习建议；',
    '不做医学诊断，遇到疑似嗓音疾病（持续嘶哑、疼痛等）时建议就医或咨询言语治疗师。',
    `使用「${languageName()}」回答。`,
  ].join('\n');
}

export function AssistantPage({ onClose }: { onClose: () => void }) {
  useI18n();
  const activeProfileId = useStore((s) => s.settings.llmActiveProfileId);
  const cfg = useActiveLlmConfig(activeProfileId);
  const chats = useChats();
  /** null = 尚未开始对话（发送第一条时创建） */
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  /** null = 空闲；否则为流式累积文本 */
  const [streamText, setStreamText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** 点按气泡浮出操作行的消息下标 */
  const [actionIdx, setActionIdx] = useState<number | null>(null);
  /** 侧边栏两步删除的待确认对话 id */
  const [delId, setDelId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const conv = activeId ? chats?.find((c) => c.id === activeId) ?? null : null;
  const messages = conv?.messages ?? [];
  const busy = streamText !== null;

  // 自动滚底：仅当用户本来就贴近底部时跟随（上翻历史时不打扰）
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamText]);

  // 输入栏随内容增高（上限 120px，之后内部滚动）
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const generate = async (convId: string, history: ChatMessage[]) => {
    if (!cfg || history.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setStreamText('');
    stickRef.current = true;
    try {
      const reply = await llmChatStreamMessages(cfg, history, {
        feature: 'assistant',
        signal: controller.signal,
        system: systemPrompt(),
        onDelta: (acc) => setStreamText(acc),
      });
      addMessage(convId, { role: 'assistant', content: reply });
    } catch (err: unknown) {
      if (!isAbortError(err)) setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreamText(null);
      abortRef.current = null;
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy || !cfg) return;
    setInput('');
    let convId = activeId;
    if (!convId) {
      convId = createChat('');
      setActiveId(convId);
    }
    addMessage(convId, { role: 'user', content: text });
    void generate(convId, getChat(convId)?.messages ?? [{ role: 'user', content: text }]);
  };

  /** 重做：截断到该消息之前重新生成（用户消息会原样重发） */
  const redo = (idx: number) => {
    if (!conv || busy) return;
    const kept = conv.messages.slice(0, idx);
    const target = conv.messages[idx];
    setActionIdx(null);
    if (target.role === 'user') {
      setMessages(conv.id, kept);
      addMessage(conv.id, { role: 'user', content: target.content });
      void generate(conv.id, [...kept, { role: 'user', content: target.content }]);
    } else {
      setMessages(conv.id, kept);
      void generate(conv.id, kept);
    }
  };

  /** 分支：以该消息为结尾复制出一个新对话并切换过去 */
  const branch = (idx: number) => {
    if (!conv) return;
    const id = createChat(
      conv.title ? `${conv.title} · ${t('assistant.branch')}` : t('assistant.title'),
      conv.messages.slice(0, idx + 1),
    );
    setActiveId(id);
    setActionIdx(null);
    setSidebarOpen(false);
    toast.success(t('assistant.branchDone'));
  };

  const copy = async (idx: number) => {
    const text = conv?.messages[idx]?.content;
    setActionIdx(null);
    if (text == null) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('assistant.copied'));
    } catch {
      /* 剪贴板不可用（权限/非安全上下文）时静默 */
    }
  };

  const newChat = () => {
    setActiveId(null);
    setSidebarOpen(false);
    setError(null);
    setActionIdx(null);
  };

  const onDeleteChat = (id: string) => {
    if (delId !== id) {
      setDelId(id);
      return;
    }
    deleteChat(id);
    if (activeId === id) setActiveId(null);
    setDelId(null);
  };

  const retry = () => {
    if (!conv || busy) return;
    void generate(conv.id, conv.messages);
  };

  const iconBtn =
    'grid size-10 place-items-center rounded-full bg-card text-ink shadow-[0_2px_14px_rgba(28,25,45,0.05),0_1px_3px_rgba(28,25,45,0.04)] transition-transform active:scale-90';

  const ActionBtn = ({ icon: Icon, label, onClick }: { icon: typeof Copy; label: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1.5 text-[10px] font-medium text-ink-2 shadow-[0_1px_6px_rgba(28,25,45,0.08)] transition-transform active:scale-90"
    >
      <Icon size={11} />
      {label}
    </button>
  );

  const Bubble = ({ m, idx, streaming = false }: { m: ChatMessage; idx: number; streaming?: boolean }) => {
    const mine = m.role === 'user';
    const active = !streaming && actionIdx === idx;
    return (
      <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
        {!mine && (
          <span className="mb-1 flex items-center gap-1.5">
            <span className="grid size-6 place-items-center rounded-full bg-accent/15 text-accent">
              <Bot size={13} />
            </span>
            <span className="text-[10px] font-medium text-ink-2">{t('assistant.title')}</span>
          </span>
        )}
        <button
          onClick={() => setActionIdx(streaming ? null : active ? null : idx)}
          className={cn(
            'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-left text-[13px] leading-relaxed text-ink',
            'shadow-[0_2px_10px_rgba(28,25,45,0.05)]',
            mine ? 'bg-accent/15' : 'bg-card',
          )}
        >
          {m.content || (streaming ? '…' : '')}
        </button>
        {active && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16 }}
            className="mt-1.5 flex items-center gap-1.5"
          >
            <ActionBtn icon={Copy} label={t('assistant.copy')} onClick={() => void copy(idx)} />
            {!streaming && <ActionBtn icon={RotateCcw} label={t('assistant.redo')} onClick={() => redo(idx)} />}
            {!streaming && <ActionBtn icon={GitBranch} label={t('assistant.branch')} onClick={() => branch(idx)} />}
          </motion.div>
        )}
      </div>
    );
  };

  const topBar = (
    <div className="flex items-center gap-2 px-3 pt-3">
      <button onClick={onClose} aria-label={t('common.back')} className={iconBtn}>
        <ArrowLeft size={18} />
      </button>
      <p className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{t('assistant.title')}</p>
      <button
        onClick={() => { setSidebarOpen(true); setDelId(null); }}
        aria-label={t('assistant.history')}
        className={iconBtn}
      >
        <PanelRight size={17} />
      </button>
    </div>
  );

  if (!cfg) {
    return (
      <div className="fixed inset-0 z-[150] flex flex-col bg-surface">
        {topBar}
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-xs text-center text-sm leading-relaxed text-ink-2">{t('assistant.needConfig')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-surface">
      {topBar}

      {/* 消息流 */}
      <div ref={scrollRef} onScroll={() => {
        const el = scrollRef.current;
        if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !busy ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-accent/15 text-accent">
              <Bot size={26} />
            </span>
            <p className="max-w-[17rem] text-[13px] leading-relaxed text-ink-2">{t('assistant.greeting')}</p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-3 pb-2">
            {messages.map((m, i) => (
              <Bubble key={`${i}-${m.role}`} m={m} idx={i} />
            ))}
            {busy && <Bubble m={{ role: 'assistant', content: streamText ?? '' }} idx={-1} streaming />}
            {error && (
              <div className="mx-auto flex flex-col items-center gap-1.5">
                <p className="max-w-md text-center text-[11px] leading-relaxed text-red-500">{error}</p>
                <button onClick={retry} className="text-[11px] font-medium text-accent">
                  {t('assistant.retry')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 输入栏 */}
      <div className="px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <div className="min-w-0 flex-1 rounded-2xl bg-card px-3.5 py-2.5 shadow-[0_2px_10px_rgba(28,25,45,0.06)]">
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('assistant.ph')}
              className="max-h-[120px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-2/60"
            />
          </div>
          <button
            onClick={busy ? () => abortRef.current?.abort() : send}
            disabled={!busy && !input.trim()}
            aria-label={busy ? t('assistant.stop') : t('assistant.send')}
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-full text-white transition-transform active:scale-90',
              'bg-accent disabled:opacity-40',
              busy && 'bg-ink text-surface',
            )}
          >
            {busy ? <Square size={14} /> : <ArrowUp size={17} />}
          </button>
        </div>
      </div>

      {/* 右侧历史抽屉 */}
      {sidebarOpen && (
        <div className="absolute inset-0 z-20">
          <div className="absolute inset-0 bg-black/20" onClick={() => setSidebarOpen(false)} />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="absolute inset-y-0 right-0 flex w-72 flex-col bg-surface shadow-[-8px_0_30px_rgba(28,25,45,0.12)]"
          >
            <button
              onClick={newChat}
              className="mx-3 mt-3 flex items-center justify-center gap-2 rounded-2xl bg-accent/15 py-2.5 text-sm font-medium text-accent transition-transform active:scale-[0.98]"
            >
              <Plus size={15} />
              {t('assistant.newChat')}
            </button>
            <p className="px-4 pb-1 pt-3 text-[11px] font-medium text-ink-2">{t('assistant.history')}</p>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {(chats ?? []).length === 0 ? (
                <p className="px-3 py-4 text-xs text-ink-2/70">{t('assistant.historyEmpty')}</p>
              ) : (
                (chats ?? []).map((c) => (
                  <div
                    key={c.id}
                    className={cn('flex items-center gap-1 rounded-xl px-1.5', c.id === activeId && 'bg-accent/10')}
                  >
                    <button
                      onClick={() => { setActiveId(c.id); setSidebarOpen(false); setError(null); setActionIdx(null); }}
                      className="min-w-0 flex-1 py-2.5 text-left"
                    >
                      <span className="block truncate text-[13px] text-ink">
                        {c.title || t('assistant.newChat')}
                      </span>
                      <span className="block text-[10px] text-ink-2">
                        {new Date(c.updatedAt).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </button>
                    <button
                      onClick={() => onDeleteChat(c.id)}
                      aria-label={t('assistant.deleteChat')}
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-full text-ink-2 transition-colors',
                        delId === c.id && 'bg-red-500/10 text-red-500',
                      )}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
