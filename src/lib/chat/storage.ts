import { buildSeedState, CURRENT_VERSION } from "./seed";
import type { ChatState, ChatStorage, Message } from "./types";

const STATE_KEY = "nod.chat.state";
const DRAFT_KEY = (chatId: string) => `nod.chat.draft.${chatId}`;

type LegacyMessage = Partial<Message> & Record<string, unknown>;

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
    card: raw.card as Message["card"],
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
  if (raw.version === CURRENT_VERSION && raw.messages) return raw as ChatState;

  const messages: Record<string, Message[]> = {};
  for (const [chatId, list] of Object.entries(raw.messages ?? {})) {
    if (!Array.isArray(list)) continue;
    messages[chatId] = list.map((m, i) => backfillMessage(m as LegacyMessage, chatId, i));
  }

  const archive: Record<string, Message[]> = {};
  for (const [chatId, list] of Object.entries(raw.archive ?? {})) {
    if (!Array.isArray(list)) continue;
    archive[chatId] = list.map((m, i) => backfillMessage(m as LegacyMessage, chatId, i));
  }

  return {
    version: CURRENT_VERSION,
    // Chats are static config (v3 dropped photo avatars for colour tones), so
    // always take the current list and backfill threads for any new chat.
    chats: [...seed.chats, ...(raw.chats ?? []).filter((c) => !seed.chats.some((s) => s.id === c.id))],
    messages: mergeSeed(seed.messages, messages, archive),
    archive: { ...seed.archive, ...archive },
    lastReadAt: raw.lastReadAt ?? {},
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
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded (large inlined attachments) — drop silently, the session still works.
    }
  },
  loadDraft(chatId) {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(DRAFT_KEY(chatId)) ?? "";
    } catch {
      return "";
    }
  },
  saveDraft(chatId, draft) {
    if (typeof window === "undefined") return;
    try {
      if (draft) window.localStorage.setItem(DRAFT_KEY(chatId), draft);
      else window.localStorage.removeItem(DRAFT_KEY(chatId));
    } catch {
      // ignore
    }
  },
};
