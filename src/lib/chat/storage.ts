import { buildSeedState, CURRENT_VERSION } from "./seed";
import type { ChatState, ChatStorage, Message } from "./types";

const STATE_KEY = "nod.chat.state";
// The first demo identity keeps the original, un-prefixed keys so existing drafts survive.
const DRAFT_KEY = (chatId: string, userId: string) =>
  userId === "me" ? `nod.chat.draft.${chatId}` : `nod.chat.draft.${userId}.${chatId}`;

/** Where one person's "last read" time for a chat lives in `ChatState.lastReadAt`. */
export const readKey = (chatId: string, userId: string) => (userId === "me" ? chatId : `${userId}:${chatId}`);

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

type LegacyMessage = Partial<Message> & Record<string, unknown>;

const PRIORITIES = new Set(["urgent", "moderate", "low"]);

/** A project board from before categories/priority/progress existed on tasks. */
function normalizeCard(card: unknown): Message["card"] {
  if (!isRecord(card) || card.type !== "project") return card as Message["card"];
  const tasks: Record<string, unknown> = {};
  for (const [id, t] of Object.entries(isRecord(card.tasks) ? card.tasks : {})) {
    if (!isRecord(t)) continue;
    tasks[id] = {
      ...t,
      priority: PRIORITIES.has(t.priority as string) ? t.priority : "moderate",
      category: typeof t.category === "string" ? t.category : null,
      progress: typeof t.progress === "number" ? t.progress : 0,
      subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    };
  }
  return { ...card, categories: Array.isArray(card.categories) ? card.categories : [], tasks } as Message["card"];
}

/**
 * Defaults a project board's newer fields, no matter how it got here — even
 * through the fast path below, whose shape check only ever looked at the
 * envelope (chats/messages/archive/lastReadAt), never at what's inside a
 * card. A version bump alone doesn't help data that was already saved back
 * out stamped with the new version number before this existed.
 */
function normalizeCardsIn(messages: Record<string, Message[]>): Record<string, Message[]> {
  const out: Record<string, Message[]> = {};
  for (const [chatId, list] of Object.entries(messages)) {
    out[chatId] = list.map((m) => (m.card ? { ...m, card: normalizeCard(m.card) } : m));
  }
  return out;
}

/**
 * Backfills a message from any earlier shape. Pre-v2 records came from the
 * prototype and carry no delivery/reaction/reply metadata.
 */
function backfillMessage(raw: LegacyMessage, chatId: string, index: number): Message {
  const id = String(raw.id ?? `migrated-${chatId}-${index}`);
  // Pre-v2 used `from: "me" | "them"` and `text` instead of authorId/body.
  const legacyFrom = raw.from as string | undefined;
  const authorId = String(raw.authorId ?? (legacyFrom === "me" ? "me" : (raw.who as string | undefined)?.toLowerCase() ?? "charles"));
  const body = String(raw.body ?? raw.text ?? "");

  return {
    id,
    clientId: String(raw.clientId ?? id),
    chatId: String(raw.chatId ?? chatId),
    authorId,
    kind: raw.kind === "card" ? "card" : raw.kind === "voice" || raw.type === "voice" ? "voice" : "text",
    body,
    createdAt: Number(raw.createdAt ?? Date.now() - (1000 - index) * 60_000),
    status: (raw.status as Message["status"]) ?? (authorId === "me" ? "read" : "delivered"),
    reactions: Array.isArray(raw.reactions)
      ? (raw.reactions as unknown[]).map((r) => {
          const rec = r as { emoji?: unknown; userIds?: unknown };
          return {
            emoji: String(rec.emoji ?? "❤️"),
            userIds: Array.isArray(rec.userIds) ? (rec.userIds as string[]) : ["charles"],
          };
        })
      : [],
    replyToId: (raw.replyToId as string | null) ?? null,
    editedAt: (raw.editedAt as number | null) ?? null,
    editHistory: Array.isArray(raw.editHistory) ? (raw.editHistory as Message["editHistory"]) : [],
    pinned: Boolean(raw.pinned ?? false),
    deletedAt: (raw.deletedAt as number | null) ?? null,
    attachments: Array.isArray(raw.attachments) ? (raw.attachments as Message["attachments"]) : [],
    durationMs: typeof raw.durationMs === "number" ? raw.durationMs : undefined,
    waveform: Array.isArray(raw.waveform) ? (raw.waveform as number[]) : undefined,
    card: normalizeCard(raw.card),
  };
}

/**
 * Keeps everything the person already has and adds demo messages introduced
 * by a newer seed (matched by id), so upgrades never wipe a conversation.
 */
function mergeSeed(
  seeded: Record<string, Message[]>,
  stored: Record<string, Message[]>,
  archive: Record<string, Message[]>,
): Record<string, Message[]> {
  const out: Record<string, Message[]> = { ...seeded };
  for (const [chatId, list] of Object.entries(stored)) {
    const known = new Set([...list, ...(archive[chatId] ?? [])].map((m) => m.id));
    const added = (seeded[chatId] ?? []).filter((m) => !known.has(m.id));
    out[chatId] = [...list, ...added].sort((a, b) => a.createdAt - b.createdAt);
  }
  return out;
}

/** v5 renamed two people (and their DM ids); saved history follows them. */
function renameCast<T>(raw: T): T {
  const json = JSON.stringify(raw)
    .replace(/"roya"/g, '"reema"')
    .replace(/"jamshed"/g, '"jamshad"')
    .replace(/@Roya\b/g, "@Reema")
    .replace(/@Jamshed\b/g, "@Jamshad");
  return JSON.parse(json) as T;
}

/** Pure so it can be exercised without a browser. */
export function migrate(stored: unknown): ChatState {
  const seed = buildSeedState();
  if (!stored || typeof stored !== "object") return seed;

  let raw = stored as Partial<ChatState> & { version?: number };
  if ((raw.version ?? 0) < 5) raw = renameCast(raw);
  // Current-version data is trusted only if it has the right shape; anything
  // else (a hand-edited or half-written record) goes through the backfill.
  if (
    raw.version === CURRENT_VERSION && Array.isArray(raw.chats) && isRecord(raw.messages)
    && isRecord(raw.archive) && isRecord(raw.lastReadAt)
  ) {
    return {
      ...raw,
      messages: normalizeCardsIn(raw.messages as Record<string, Message[]>),
      archive: normalizeCardsIn(raw.archive as Record<string, Message[]>),
    } as ChatState;
  }

  const messages: Record<string, Message[]> = {};
  for (const [chatId, list] of Object.entries(isRecord(raw.messages) ? raw.messages : {})) {
    if (!Array.isArray(list)) continue;
    messages[chatId] = list.map((m, i) => backfillMessage(m as LegacyMessage, chatId, i));
  }

  const archive: Record<string, Message[]> = {};
  for (const [chatId, list] of Object.entries(isRecord(raw.archive) ? raw.archive : {})) {
    if (!Array.isArray(list)) continue;
    archive[chatId] = list.map((m, i) => backfillMessage(m as LegacyMessage, chatId, i));
  }

  return {
    version: CURRENT_VERSION,
    // Chats are static config (v3 dropped photo avatars for colour tones), so
    // always take the current list and backfill threads for any new chat.
    chats: [...seed.chats, ...(Array.isArray(raw.chats) ? raw.chats : []).filter((c) => !seed.chats.some((s) => s.id === c.id))],
    messages: mergeSeed(seed.messages, messages, archive),
    archive: { ...seed.archive, ...archive },
    lastReadAt: isRecord(raw.lastReadAt) ? (raw.lastReadAt as Record<string, number>) : {},
  };
}

export const localStorageAdapter: ChatStorage = {
  load() {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      return migrate(JSON.parse(raw));
    } catch {
      return null;
    }
  },
  save(state) {
    if (typeof window === "undefined") return true;
    try {
      window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
      return true;
    } catch {
      // Quota exceeded or storage blocked: the session still works, but the caller should say so.
      return false;
    }
  },
  loadDraft(chatId, userId) {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(DRAFT_KEY(chatId, userId)) ?? "";
    } catch {
      return "";
    }
  },
  saveDraft(chatId, userId, draft) {
    if (typeof window === "undefined") return;
    try {
      if (draft) window.localStorage.setItem(DRAFT_KEY(chatId, userId), draft);
      else window.localStorage.removeItem(DRAFT_KEY(chatId, userId));
    } catch {
      // ignore
    }
  },
};
