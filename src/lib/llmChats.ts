/**
 * AI 助手对话存储（IndexedDB kv 'llm:chats'，按 updatedAt 倒序，封顶 30 条）。
 * 内存快照 + 订阅（useSyncExternalStore），写操作经串行队列落 kv——
 * 与 llmProfiles 同一套模式。对话不含系统提示词（生成时按当前语言即时构建）。
 */

import { useSyncExternalStore } from 'react';
import { idbGetKV, idbPutKV } from '@/lib/storage/idb';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

const KV_CHATS = 'llm:chats';
const MAX_CHATS = 30;

let chats: ChatConversation[] | null = null;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const next = queue.then(task);
  queue = next.catch(() => {});
  return next;
}

function notify(): void {
  for (const fn of listeners) fn();
}

function validConversation(c: unknown): c is ChatConversation {
  const o = c as ChatConversation;
  return !!o && typeof o === 'object'
    && typeof o.id === 'string' && typeof o.title === 'string'
    && typeof o.createdAt === 'number' && typeof o.updatedAt === 'number'
    && Array.isArray(o.messages)
    && o.messages.every((m) => !!m
      && typeof m.content === 'string'
      && (m.role === 'user' || m.role === 'assistant'));
}

async function ensureLoaded(): Promise<void> {
  if (chats != null) return;
  loaded ??= (async () => {
    try {
      const raw = await idbGetKV<ChatConversation[]>(KV_CHATS);
      chats = Array.isArray(raw) ? raw.filter(validConversation) : [];
    } catch {
      chats = []; // IndexedDB 不可用：本会话内仍可对话（内存态）
    }
  })();
  await loaded;
}

/** useSyncExternalStore 订阅入口：首次订阅时触发加载 */
export function subscribeChats(fn: () => void): () => void {
  listeners.add(fn);
  void enqueue(async () => {
    await ensureLoaded();
  }).then(notify);
  return () => listeners.delete(fn);
}

/** 对话快照（updatedAt 倒序）；null = 尚未加载完成 */
export function getChatsSnapshot(): ChatConversation[] | null {
  return chats;
}

/** React 订阅：对话列表 */
export function useChats(): ChatConversation[] | null {
  return useSyncExternalStore(subscribeChats, getChatsSnapshot, getChatsSnapshot);
}

function genId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function persist(): Promise<void> {
  try {
    await idbPutKV(KV_CHATS, chats!);
  } catch {
    /* 落盘失败保持内存态，下次写操作重试 */
  }
}

function sortAndCap(list: ChatConversation[]): ChatConversation[] {
  return [...list]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CHATS);
}

function commit(next: ChatConversation[]): void {
  chats = sortAndCap(next);
  void enqueue(persist);
  notify();
}

function truncate(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** 新建对话（可带初始消息，用于分支），返回 id */
export function createChat(title: string, messages: ChatMessage[] = []): string {
  const now = Date.now();
  const conv: ChatConversation = { id: genId(), title, createdAt: now, updatedAt: now, messages };
  commit([conv, ...(chats ?? [])]);
  return conv.id;
}

export function getChat(id: string): ChatConversation | undefined {
  return chats?.find((c) => c.id === id);
}

/** 追加一条消息；首条用户消息自动成为对话标题 */
export function addMessage(id: string, msg: ChatMessage): void {
  if (!chats) return;
  commit(chats.map((c) => (c.id === id
    ? {
      ...c,
      title: c.title || (msg.role === 'user' ? truncate(msg.content, 24) : c.title),
      updatedAt: Date.now(),
      messages: [...c.messages, msg],
    }
    : c)));
}

/** 整体替换消息（重做的截断、分支的前缀裁剪） */
export function setMessages(id: string, messages: ChatMessage[]): void {
  if (!chats) return;
  commit(chats.map((c) => (c.id === id ? { ...c, updatedAt: Date.now(), messages } : c)));
}

export function deleteChat(id: string): void {
  if (!chats) return;
  commit(chats.filter((c) => c.id !== id));
}
