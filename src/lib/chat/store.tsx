"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { sendMessage as apiSend } from "./api";
import { releaseMedia } from "./media";
import { reduceCardOp, tasksIn, unclaimedItems } from "./ops";
import { buildSeedState, CHATS, USERS } from "./seed";
import { localStorageAdapter, readKey } from "./storage";
import {
  createBroadcastTransport, NULL_TRANSPORT, PRESENCE_INTERVAL_MS, PRESENCE_TIMEOUT_MS, samePeers, type Peer,
} from "./transport";
import type { Attachment, Card, CardOp, Chat, ChatState, ChatTransport, DeliveryStatus, Message, TransportEvent } from "./types";

/**
 * One id per browsing context, fixed at module load — two tabs get different
 * ids, which is what presence needs. Generating it during render would be
 * impure; a ref would be read during render.
 */
const CLIENT_ID = typeof window === "undefined" ? "" : Math.random().toString(36).slice(2);

const ME_KEY = "nod.chat.me";
const TYPING_TIMEOUT_MS = 5000;
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const PAGE_SIZE = 4;

interface State {
  data: ChatState;
  typing: Record<string, Record<string, number>>;
  hydrated: boolean;
}

type Action =
  | { type: "hydrate"; data: ChatState }
  | { type: "append"; message: Message }
  | { type: "patch"; chatId: string; clientId: string; patch: Partial<Message> }
  | { type: "status"; chatId: string; messageId: string; status: DeliveryStatus; byUserId?: string; at?: number }
  | { type: "add-chat"; chat: Chat }
  | { type: "react"; chatId: string; messageId: string; emoji: string; userId: string; op: "add" | "remove" }
  | { type: "edit"; chatId: string; messageId: string; body: string; editedAt: number }
  | { type: "delete"; chatId: string; messageId: string; deletedAt: number }
  | { type: "pin"; chatId: string; messageId: string; pinned: boolean }
  | { type: "card"; chatId: string; messageId: string; card: Card }
  | { type: "card-op"; chatId: string; messageId: string; op: CardOp }
  | { type: "load-earlier"; chatId: string }
  | { type: "typing"; chatId: string; userId: string; isTyping: boolean }
  | { type: "read-by"; chatId: string; messageIds: string[]; userId: string; at: number }
  | { type: "mark-read"; chatId: string; userId: string; at: number };

/** Maps one thread; returns the same state when nothing changed, so no-op events don't re-render or re-save. */
function mapMessages(state: State, chatId: string, fn: (m: Message) => Message): State {
  const list = state.data.messages[chatId];
  if (!list) return state;
  let changed = false;
  const next = list.map((m) => {
    const out = fn(m);
    if (out !== m) changed = true;
    return out;
  });
  if (!changed) return state;
  return {
    ...state,
    data: { ...state.data, messages: { ...state.data.messages, [chatId]: next } },
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return { ...state, data: action.data, hydrated: true };

    case "append": {
      const { chatId } = action.message;
      const list = state.data.messages[chatId] ?? [];
      if (list.some((m) => m.clientId === action.message.clientId)) return state;
      return {
        ...state,
        data: { ...state.data, messages: { ...state.data.messages, [chatId]: [...list, action.message] } },
      };
    }

    case "patch":
      return mapMessages(state, action.chatId, (m) =>
        m.clientId === action.clientId ? { ...m, ...action.patch } : m,
      );

    case "status":
      return mapMessages(state, action.chatId, (m) => {
        if (m.id !== action.messageId) return m;
        // Never walk a status backwards (a late `delivered` must not undo `read`).
        const order: DeliveryStatus[] = ["failed", "pending", "sent", "delivered", "read"];
        const next = order.indexOf(action.status) > order.indexOf(m.status) ? { ...m, status: action.status } : m;
        // Receipts are per person; the message status is the best of them.
        if (action.status === "read" && action.byUserId && action.byUserId !== m.authorId && !m.readBy?.[action.byUserId]) {
          return { ...next, readBy: { ...(m.readBy ?? {}), [action.byUserId]: action.at ?? Date.now() } };
        }
        return next;
      });

    case "react":
      return mapMessages(state, action.chatId, (m) => {
        if (m.id !== action.messageId) return m;
        const reactions = m.reactions.map((r) => ({ ...r, userIds: [...r.userIds] }));
        const existing = reactions.find((r) => r.emoji === action.emoji);
        if (action.op === "add") {
          if (existing) {
            if (!existing.userIds.includes(action.userId)) existing.userIds.push(action.userId);
          } else {
            reactions.push({ emoji: action.emoji, userIds: [action.userId] });
          }
        } else if (existing) {
          existing.userIds = existing.userIds.filter((id) => id !== action.userId);
        }
        return { ...m, reactions: reactions.filter((r) => r.userIds.length > 0) };
      });

    case "edit":
      return mapMessages(state, action.chatId, (m) =>
        m.id === action.messageId
          ? {
              ...m,
              editHistory: [...m.editHistory, { body: m.body, editedAt: m.editedAt ?? m.createdAt }],
              body: action.body,
              editedAt: action.editedAt,
            }
          : m,
      );

    case "delete":
      // Nothing of the old message survives in storage: not its text, earlier versions or card.
      return mapMessages(state, action.chatId, (m) =>
        m.id === action.messageId && !m.deletedAt
          ? { ...m, deletedAt: action.deletedAt, body: "", attachments: [], editHistory: [], reactions: [], card: undefined, pinned: false }
          : m,
      );

    case "pin":
      return mapMessages(state, action.chatId, (m) =>
        m.id === action.messageId ? { ...m, pinned: action.pinned } : m,
      );

    case "add-chat":
      if (state.data.chats.some((c) => c.id === action.chat.id)) return state;
      return {
        ...state,
        data: {
          ...state.data,
          chats: [...state.data.chats, action.chat],
          messages: { ...state.data.messages, [action.chat.id]: state.data.messages[action.chat.id] ?? [] },
        },
      };

    case "card":
      return mapMessages(state, action.chatId, (m) => (m.id === action.messageId ? { ...m, card: action.card } : m));

    case "card-op":
      return mapMessages(state, action.chatId, (m) => {
        if (m.id !== action.messageId || !m.card) return m;
        const card = reduceCardOp(m.card, action.op);
        return card === m.card ? m : { ...m, card };
      });

    case "load-earlier": {
      const pool = state.data.archive[action.chatId] ?? [];
      if (!pool.length) return state;
      const page = pool.slice(-PAGE_SIZE);
      return {
        ...state,
        data: {
          ...state.data,
          archive: { ...state.data.archive, [action.chatId]: pool.slice(0, -PAGE_SIZE) },
          messages: {
            ...state.data.messages,
            // Sorted, so an older seeded or synced message never lands out of order.
            [action.chatId]: [...page, ...(state.data.messages[action.chatId] ?? [])].sort((a, b) => a.createdAt - b.createdAt),
          },
        },
      };
    }

    case "typing": {
      const forChat = { ...(state.typing[action.chatId] ?? {}) };
      if (action.isTyping) forChat[action.userId] = Date.now();
      else delete forChat[action.userId];
      return { ...state, typing: { ...state.typing, [action.chatId]: forChat } };
    }

    case "read-by": {
      // Receipts are per person; the message status is the best of them.
      const ids = new Set(action.messageIds);
      return mapMessages(state, action.chatId, (m) =>
        ids.has(m.id) && m.authorId !== action.userId && !m.readBy?.[action.userId]
          ? { ...m, status: m.status === "failed" ? m.status : "read", readBy: { ...(m.readBy ?? {}), [action.userId]: action.at } }
          : m,
      );
    }

    case "mark-read":
      return {
        ...state,
        data: { ...state.data, lastReadAt: { ...state.data.lastReadAt, [readKey(action.chatId, action.userId)]: action.at } },
      };

    default:
      return state;
  }
}

function autoReply(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("review") || t.includes("look")) return "Appreciate it — no rush though.";
  if (t.includes("thanks") || t.includes("thank")) return "Anytime 🙂";
  if (t.includes("call") || t.includes("meet")) return "Works for me, I'll send an invite.";
  const pool = ["Sounds good.", "Got it, thank you!", "Perfect, talk soon.", "👍", "Makes sense to me."];
  return pool[Math.floor(Math.random() * pool.length)];
}

interface ChatContextValue {
  state: State;
  me: string;
  setMe: (id: string) => void;
  /** Other tabs, and who is signed in to each. */
  peers: Peer[];
  /** Whether another tab is signed in as this person (so a real human answers, not the simulation). */
  isOnline: (userId: string) => boolean;
  /** When the signed-in person last read a chat (ms, 0 if never). */
  lastReadAt: (chatId: string) => number;
  /** True once a save failed (storage full or blocked); changes since then live only in this tab. */
  saveFailed: boolean;
  send: (chatId: string, body: string, opts?: { replyToId?: string | null; attachments?: Attachment[] }) => void;
  /** Sends a structured message; `summary` is what previews and quotes show. Returns its id. */
  sendCard: (chatId: string, card: Card, summary: string) => string;
  /** Creates a group with the current user in it, and returns it. */
  createGroup: (name: string, memberIds: string[]) => Chat;
  /** Replaces a card's state (votes, ticks, RSVPs…) and syncs it. */
  updateCard: (message: Message, update: (card: Card) => Card) => void;
  /** Applies one change to a shared card (plans, bills, projects) here and in every tab. */
  cardOp: (message: Message, op: CardOp) => void;
  retry: (message: Message) => void;
  toggleReaction: (message: Message, emoji: string) => void;
  editMessage: (message: Message, body: string) => void;
  deleteMessage: (message: Message) => void;
  togglePin: (message: Message) => void;
  loadEarlier: (chatId: string) => void;
  hasEarlier: (chatId: string) => boolean;
  setTyping: (chatId: string, isTyping: boolean) => void;
  typingUsers: (chatId: string) => string[];
  /** Marks everything in the chat read by the signed-in person, sending receipts once per message. */
  markRead: (chatId: string) => void;
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const ChatContext = createContext<ChatContextValue | null>(null);

/** Lets the page around the prototype react to activity inside it (see StageField). */
function signal(dir: "out" | "in") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nod:activity", { detail: { dir } }));
}

/** A little hand-drawn smiley, for simulated doodle replies. */
function smiley(): number[][] {
  const ring: number[] = [];
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 16) ring.push(+(230 + Math.cos(a) * 34).toFixed(1), +(150 + Math.sin(a) * 34).toFixed(1));
  const smile: number[] = [];
  for (let a = 0.2 * Math.PI; a <= 0.8 * Math.PI + 0.01; a += Math.PI / 14) smile.push(+(230 + Math.cos(a) * 20).toFixed(1), +(152 + Math.sin(a) * 18).toFixed(1));
  return [ring, [218, 140, 218.5, 141], [242, 140, 242.5, 141], smile];
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, (): State => ({
    data: buildSeedState(),
    typing: {},
    hydrated: false,
  }));

  const [me, setMeState] = useState("me");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
  // Opened after mount and closed on unmount; until then publishes are dropped.
  const transport = useRef<ChatTransport>(NULL_TRANSPORT);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  // Heartbeat times live here; `peers` only changes when someone arrives or leaves.
  const peerSeen = useRef(new Map<string, Peer>());
  // Long-lived subscriptions read the current identity without re-subscribing.
  const meRef = useRef(me);
  const peersRef = useRef(peers);
  // Timers, subscriptions and child effects must read the freshest state, not
  // the snapshot captured when they were scheduled. A layout effect updates it
  // before any passive effect (ChatView's markRead among them) runs.
  const latest = useRef(state.data);
  useLayoutEffect(() => {
    meRef.current = me;
    peersRef.current = peers;
    latest.current = state.data;
  }, [me, peers, state.data]);

  /** A timeout that is cleared if the provider unmounts first. */
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    const typing = typingTimers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
      Object.values(typing).forEach(clearTimeout);
    };
  }, []);

  // Identity is per-tab so two tabs can hold a real conversation with each other.
  // `?as=charles` signs a fresh tab in as someone else (the "second window"
  // link uses it). Read after mount rather than in a lazy initializer: the
  // prerendered HTML always says "me", so reading it during render would
  // hydrate mismatched markup.
  useEffect(() => {
    let id: string | null = null;
    try {
      const url = new URL(window.location.href);
      const as = url.searchParams.get("as");
      if (as && USERS.some((u) => u.id === as)) {
        id = as;
        window.sessionStorage.setItem(ME_KEY, as);
        url.searchParams.delete("as");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      } else {
        id = window.sessionStorage.getItem(ME_KEY);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) setMeState(id);
  }, []);

  const setMe = useCallback((id: string) => {
    setMeState(id);
    try {
      window.sessionStorage.setItem(ME_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    dispatch({ type: "hydrate", data: localStorageAdapter.load() ?? buildSeedState() });
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const ok = localStorageAdapter.save(state.data);
    // Surfaced once, so the page can say changes won't survive a reload.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaveFailed((was) => was || !ok);
  }, [state.data, state.hydrated]);

  const publish = useCallback((event: TransportEvent) => transport.current.publish(event), []);

  const clearTypingLater = useCallback((chatId: string, userId: string) => {
    const key = `${chatId}:${userId}`;
    clearTimeout(typingTimers.current[key]);
    typingTimers.current[key] = setTimeout(
      () => dispatch({ type: "typing", chatId, userId, isTyping: false }),
      TYPING_TIMEOUT_MS,
    );
  }, []);

  const chatOf = useCallback(
    (chatId: string) => latest.current.chats.find((c) => c.id === chatId) ?? CHATS.find((c) => c.id === chatId),
    [],
  );

  // Realtime: one channel per tab, plus presence. Every tab stores every
  // event (localStorage is shared, the way a server would be); what each
  // person sees is filtered by chat membership in the UI.
  useEffect(() => {
    const t = createBroadcastTransport();
    transport.current = t;

    const syncPeers = () => {
      const now = Date.now();
      for (const [id, p] of peerSeen.current) if (now - p.at >= PRESENCE_TIMEOUT_MS) peerSeen.current.delete(id);
      const next = [...peerSeen.current.values()].sort((a, b) => a.clientId.localeCompare(b.clientId));
      setPeers((prev) => (samePeers(prev, next) ? prev : next));
    };

    const unsubscribe = t.subscribe((event) => {
      switch (event.type) {
        case "message": {
          const m = event.message;
          // Sent by this same person from another tab: show it as-is, no receipts.
          const own = m.authorId === meRef.current;
          dispatch({ type: "append", message: own ? m : { ...m, status: "delivered" } });
          if (own || !chatOf(m.chatId)?.memberIds.includes(meRef.current)) break;
          signal("in");
          dispatch({ type: "typing", chatId: m.chatId, userId: m.authorId, isTyping: false });
          // Acknowledge receipt; ChatView marks it read if the chat is on screen.
          t.publish({ type: "status", chatId: m.chatId, messageId: m.id, status: "delivered", byUserId: meRef.current });
          break;
        }
        case "status":
          dispatch({ type: "status", chatId: event.chatId, messageId: event.messageId, status: event.status, byUserId: event.byUserId, at: Date.now() });
          break;
        case "read-by":
          dispatch({ type: "read-by", chatId: event.chatId, messageIds: event.messageIds, userId: event.userId, at: event.at });
          break;
        case "chat":
          // Known right away, so a message that follows in the same tick passes the membership check.
          if (!latest.current.chats.some((c) => c.id === event.chat.id)) {
            latest.current = { ...latest.current, chats: [...latest.current.chats, event.chat] };
          }
          dispatch({ type: "add-chat", chat: event.chat });
          break;
        case "typing":
          if (event.userId === meRef.current) return;
          dispatch({ type: "typing", chatId: event.chatId, userId: event.userId, isTyping: event.isTyping });
          if (event.isTyping) clearTypingLater(event.chatId, event.userId);
          break;
        case "reaction":
          // Adding and removing are idempotent, so this person's other tabs apply theirs too.
          dispatch({
            type: "react",
            chatId: event.chatId,
            messageId: event.messageId,
            emoji: event.emoji,
            userId: event.userId,
            op: event.op,
          });
          break;
        case "edit":
          dispatch({
            type: "edit",
            chatId: event.chatId,
            messageId: event.messageId,
            body: event.body,
            editedAt: event.editedAt,
          });
          break;
        case "delete": {
          const gone = latest.current.messages[event.chatId]?.find((m) => m.id === event.messageId);
          if (gone) releaseMedia(gone.attachments.filter((a) => a.stored === "idb").map((a) => a.id));
          dispatch({
            type: "delete",
            chatId: event.chatId,
            messageId: event.messageId,
            deletedAt: event.deletedAt,
          });
          break;
        }
        case "pin":
          dispatch({
            type: "pin",
            chatId: event.chatId,
            messageId: event.messageId,
            pinned: event.pinned,
          });
          break;
        case "card":
          dispatch({ type: "card", chatId: event.chatId, messageId: event.messageId, card: event.card });
          break;
        case "card-op":
          dispatch({ type: "card-op", chatId: event.chatId, messageId: event.messageId, op: event.op });
          break;
        case "presence":
          if (event.clientId === CLIENT_ID) return;
          peerSeen.current.set(event.clientId, { clientId: event.clientId, userId: event.userId, at: event.at });
          syncPeers();
          break;
        case "presence-bye":
          peerSeen.current.delete(event.clientId);
          syncPeers();
          break;
      }
    });

    // Presence heartbeat — drives whether the simulated members are needed.
    const beat = () => t.publish({ type: "presence", clientId: CLIENT_ID, userId: meRef.current, at: Date.now() });
    beat();
    const interval = setInterval(() => {
      beat();
      syncPeers();
    }, PRESENCE_INTERVAL_MS);
    const bye = () => t.publish({ type: "presence-bye", clientId: CLIENT_ID });
    window.addEventListener("pagehide", bye);

    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", bye);
      bye();
      unsubscribe();
      t.close();
      transport.current = NULL_TRANSPORT;
    };
  }, [chatOf, clearTypingLater]);

  // Switching identity announces the new person straight away.
  useEffect(() => {
    publish({ type: "presence", clientId: CLIENT_ID, userId: me, at: Date.now() });
  }, [me, publish]);

  /** Someone other than me who is in this chat has a tab open, so they answer for themselves. */
  const memberOnline = useCallback(
    (chatId: string) => {
      const members = chatOf(chatId)?.memberIds ?? [];
      return peersRef.current.some((p) => p.userId !== meRef.current && members.includes(p.userId));
    },
    [chatOf],
  );

  /** Applies a receipt here and in every other tab. */
  const receipt = useCallback(
    (chatId: string, messageId: string, status: DeliveryStatus, byUserId: string) => {
      dispatch({ type: "status", chatId, messageId, status, byUserId, at: Date.now() });
      publish({ type: "status", chatId, messageId, status, byUserId });
    },
    [publish],
  );

  // Simulated members act through the same events a real tab would send, so
  // this person's other tabs see the replies too.
  const simulate = useCallback(
    (sent: Message) => {
      const chat = chatOf(sent.chatId);
      const counterpart = chat?.memberIds.find((id) => id !== sent.authorId) ?? "charles";
      const typing = (isTyping: boolean) => {
        dispatch({ type: "typing", chatId: sent.chatId, userId: counterpart, isTyping });
        publish({ type: "typing", chatId: sent.chatId, userId: counterpart, isTyping });
      };

      later(() => receipt(sent.chatId, sent.id, "delivered", counterpart), 700);
      later(() => {
        typing(true);
        clearTypingLater(sent.chatId, counterpart);
      }, 1200);
      later(() => {
        typing(false);
        const id = `sim-${newId()}`;
        const reply: Message = {
          id,
          clientId: id,
          chatId: sent.chatId,
          authorId: counterpart,
          kind: "text",
          body: autoReply(sent.body),
          createdAt: Date.now(),
          status: "delivered",
          reactions: [],
          replyToId: null,
          editedAt: null,
          editHistory: [],
          pinned: false,
          deletedAt: null,
          attachments: [],
        };
        dispatch({ type: "append", message: reply });
        publish({ type: "message", message: reply });
        signal("in");
        receipt(sent.chatId, sent.id, "read", counterpart);
      }, 2600);
      // In a group, everyone else reads it too, one by one.
      (chat?.memberIds ?? [])
        .filter((id) => id !== sent.authorId && id !== counterpart)
        .forEach((uid, i) => later(() => receipt(sent.chatId, sent.id, "read", uid), 3400 + i * 1300));
    },
    [chatOf, clearTypingLater, later, publish, receipt],
  );

  const send = useCallback<ChatContextValue["send"]>(
    (chatId, body, opts) => {
      const trimmed = body.trim();
      if (!trimmed && !opts?.attachments?.length) return;
      const id = newId();
      const optimistic: Message = {
        id,
        clientId: id,
        chatId,
        authorId: meRef.current,
        kind: "text",
        body: trimmed,
        createdAt: Date.now(),
        status: "pending",
        reactions: [],
        replyToId: opts?.replyToId ?? null,
        editedAt: null,
        editHistory: [],
        pinned: false,
        deletedAt: null,
        attachments: opts?.attachments ?? [],
      };

      dispatch({ type: "append", message: optimistic });
      signal("out");

      apiSend(optimistic)
        .then((accepted) => {
          dispatch({ type: "patch", chatId, clientId: optimistic.clientId, patch: { status: "sent" } });
          publish({ type: "message", message: { ...accepted, status: "sent" } });
          if (!memberOnline(chatId)) simulate(accepted);
        })
        .catch(() => {
          dispatch({ type: "patch", chatId, clientId: optimistic.clientId, patch: { status: "failed" } });
        });
    },
    [memberOnline, publish, simulate],
  );

  const retry = useCallback<ChatContextValue["retry"]>(
    (message) => {
      dispatch({ type: "patch", chatId: message.chatId, clientId: message.clientId, patch: { status: "pending" } });
      apiSend(message)
        .then((accepted) => {
          dispatch({ type: "patch", chatId: message.chatId, clientId: message.clientId, patch: { status: "sent" } });
          publish({ type: "message", message: { ...accepted, status: "sent" } });
          if (!memberOnline(message.chatId)) simulate(accepted);
        })
        .catch(() => {
          dispatch({ type: "patch", chatId: message.chatId, clientId: message.clientId, patch: { status: "failed" } });
        });
    },
    [memberOnline, publish, simulate],
  );

  const updateCard = useCallback<ChatContextValue["updateCard"]>(
    (message, update) => {
      const current = latest.current.messages[message.chatId]?.find((m) => m.id === message.id) ?? message;
      if (!current.card) return;
      const card = update(current.card);
      latest.current = {
        ...latest.current,
        messages: {
          ...latest.current.messages,
          [message.chatId]: (latest.current.messages[message.chatId] ?? []).map((m) => (m.id === message.id ? { ...m, card } : m)),
        },
      };
      dispatch({ type: "card", chatId: message.chatId, messageId: message.id, card });
      publish({ type: "card", chatId: message.chatId, messageId: message.id, card });
    },
    [publish],
  );

  const cardOp = useCallback<ChatContextValue["cardOp"]>(
    (message, op) => {
      dispatch({ type: "card-op", chatId: message.chatId, messageId: message.id, op });
      publish({ type: "card-op", chatId: message.chatId, messageId: message.id, op, by: meRef.current });
    },
    [publish],
  );

  /** With nobody else online, the other members answer structured messages. */
  const simulateCard = useCallback(
    (sent: Message) => {
      const others = (chatOf(sent.chatId)?.memberIds ?? []).filter((id) => id !== sent.authorId);
      const card = sent.card;
      if (!card || !others.length) return;
      const act = (delay: number, fn: (c: Card) => Card) => later(() => updateCard(sent, fn), delay);
      if (card.type === "poll") {
        others.forEach((uid, i) => act(1400 + i * 1100, (c) => {
          if (c.type !== "poll" || c.closedAt) return c;
          const pick = (i + uid.charCodeAt(0)) % c.options.length;
          return { ...c, options: c.options.map((o, j) => (j === pick && !o.votes.includes(uid) ? { ...o, votes: [...o.votes, uid] } : o)) };
        }));
      } else if (card.type === "event") {
        const answers: ("going" | "maybe" | "no")[] = ["going", "going", "maybe"];
        others.forEach((uid, i) => act(1600 + i * 1200, (c) => (c.type === "event" ? { ...c, rsvps: { ...c.rsvps, [uid]: answers[i % answers.length] } } : c)));
      } else if (card.type === "payment" && card.mode === "request") {
        card.from.slice(0, 1).forEach((uid) => act(3200, (c) => (c.type === "payment" && !c.paidBy.includes(uid) ? { ...c, paidBy: [...c.paidBy, uid] } : c)));
      } else if (card.type === "sketch") {
        // Someone adds a little smiley to the corner of the doodle.
        const by = others[0];
        act(2600, (c) => (c.type === "sketch"
          ? { ...c, strokes: [...c.strokes, ...smiley().map((pts, i) => ({ id: `sim-${newId()}-${i}`, by, color: "blue", size: 4, pts }))] }
          : c));
      } else if (card.type === "wheel") {
        const by = others[0];
        act(4200, (c) => (c.type === "wheel" && c.spins.length === 0
          ? { ...c, spins: [{ by, index: Math.floor(Math.random() * c.options.length), at: Date.now() }] }
          : c));
      } else if (card.type === "checklist" && card.everyoneCanEdit && card.items.length) {
        act(2400, (c) => (c.type === "checklist" ? { ...c, items: c.items.map((it, j) => (j === 0 && !it.doneBy ? { ...it, doneBy: others[0] } : it)) } : c));
      } else if (card.type === "plan") {
        // Everyone says whether they're in, one by one.
        const answers = ["going", "going", "maybe"] as const;
        others.forEach((uid, i) => later(() => cardOp(sent, { kind: "plan.rsvp", userId: uid, value: answers[i % answers.length] }), 1500 + i * 1100));
      } else if (card.type === "bill") {
        // Each person claims an unclaimed item, then pays their share a little later.
        const open = unclaimedItems(card);
        others.forEach((uid, i) => {
          const item = open[i];
          if (item) later(() => cardOp(sent, { kind: "bill.claim", itemId: item.id, userId: uid, on: true }), 1600 + i * 1200);
          if (item) later(() => cardOp(sent, { kind: "bill.pay", userId: uid }), 4200 + i * 1500);
        });
      } else if (card.type === "project") {
        // Someone picks up the first task.
        const first = card.columns[0] && card.columns[1] ? tasksIn(card, card.columns[0].id)[0] : undefined;
        if (first) {
          later(() => cardOp(sent, {
            kind: "task.update", id: first.id, at: Date.now(),
            patch: { column: card.columns[1].id, assignee: first.assignee ?? others[0] },
          }), 3000);
        }
      }
    },
    [cardOp, chatOf, later, updateCard],
  );

  const createGroup = useCallback<ChatContextValue["createGroup"]>(
    (name, memberIds) => {
      const tones = ["plum", "sage", "denim", "clay", "ochre"] as const;
      const chat: Chat = {
        id: `group-${Date.now().toString(36)}`,
        name: name.trim() || "New group",
        kind: "group",
        memberIds: [meRef.current, ...memberIds.filter((id) => id !== meRef.current)],
        tone: tones[Math.floor(Math.random() * tones.length)],
      };
      dispatch({ type: "add-chat", chat });
      publish({ type: "chat", chat });
      return chat;
    },
    [publish],
  );

  const sendCard = useCallback<ChatContextValue["sendCard"]>(
    (chatId, card, summary) => {
      const id = newId();
      const message: Message = {
        id,
        clientId: id,
        chatId,
        authorId: meRef.current,
        kind: "card",
        body: summary,
        card,
        createdAt: Date.now(),
        status: "pending",
        reactions: [],
        replyToId: null,
        editedAt: null,
        editHistory: [],
        pinned: false,
        deletedAt: null,
        attachments: [],
      };
      dispatch({ type: "append", message });
      signal("out");
      apiSend(message)
        .then((accepted) => {
          // Whatever changed while it was sending (a task added, a stop ticked) goes out with it:
          // other tabs dropped those ops, since the message didn't exist for them yet.
          const current = latest.current.messages[chatId]?.find((m) => m.id === id);
          const out: Message = { ...accepted, card: current?.card ?? card };
          dispatch({ type: "patch", chatId, clientId: id, patch: { status: "sent" } });
          publish({ type: "message", message: { ...out, status: "sent" } });
          if (!memberOnline(chatId)) {
            const to = chatOf(chatId)?.memberIds.find((m) => m !== meRef.current) ?? "charles";
            later(() => receipt(chatId, id, "delivered", to), 700);
            simulateCard(out);
          }
        })
        .catch(() => dispatch({ type: "patch", chatId, clientId: id, patch: { status: "failed" } }));
      return id;
    },
    [chatOf, later, memberOnline, publish, receipt, simulateCard],
  );

  const toggleReaction = useCallback<ChatContextValue["toggleReaction"]>(
    (message, emoji) => {
      const mine = message.reactions.find((r) => r.emoji === emoji)?.userIds.includes(meRef.current);
      const op = mine ? "remove" : "add";
      if (op === "add") signal("out");
      dispatch({ type: "react", chatId: message.chatId, messageId: message.id, emoji, userId: meRef.current, op });
      publish({ type: "reaction", chatId: message.chatId, messageId: message.id, emoji, userId: meRef.current, op });
    },
    [publish],
  );

  const editMessage = useCallback<ChatContextValue["editMessage"]>(
    (message, body) => {
      const editedAt = Date.now();
      dispatch({ type: "edit", chatId: message.chatId, messageId: message.id, body, editedAt });
      publish({ type: "edit", chatId: message.chatId, messageId: message.id, body, editedAt });
    },
    [publish],
  );

  const deleteMessage = useCallback<ChatContextValue["deleteMessage"]>(
    (message) => {
      const deletedAt = Date.now();
      releaseMedia(message.attachments.filter((a) => a.stored === "idb").map((a) => a.id));
      dispatch({ type: "delete", chatId: message.chatId, messageId: message.id, deletedAt });
      publish({ type: "delete", chatId: message.chatId, messageId: message.id, deletedAt });
    },
    [publish],
  );

  const togglePin = useCallback<ChatContextValue["togglePin"]>(
    (message) => {
      const pinned = !message.pinned;
      dispatch({ type: "pin", chatId: message.chatId, messageId: message.id, pinned });
      publish({ type: "pin", chatId: message.chatId, messageId: message.id, pinned });
    },
    [publish],
  );

  const loadEarlier = useCallback((chatId: string) => dispatch({ type: "load-earlier", chatId }), []);
  const hasEarlier = useCallback(
    (chatId: string) => (state.data.archive[chatId] ?? []).length > 0,
    [state.data.archive],
  );

  const setTyping = useCallback<ChatContextValue["setTyping"]>(
    (chatId, isTyping) => publish({ type: "typing", chatId, userId: meRef.current, isTyping }),
    [publish],
  );

  const typingUsers = useCallback(
    (chatId: string) => {
      const forChat = state.typing[chatId] ?? {};
      const now = Date.now();
      return Object.entries(forChat)
        .filter(([, at]) => now - at < TYPING_TIMEOUT_MS)
        .map(([userId]) => userId);
    },
    [state.typing],
  );

  const markRead = useCallback(
    (chatId: string) => {
      const who = meRef.current;
      const list = latest.current.messages[chatId] ?? [];
      const unread = list.filter((m) => m.authorId !== who && !m.readBy?.[who]);
      const at = Date.now();
      if (unread.length) {
        // One event for the lot: opening a long chat must not send a receipt per message.
        const messageIds = unread.map((m) => m.id);
        dispatch({ type: "read-by", chatId, messageIds, userId: who, at });
        publish({ type: "read-by", chatId, messageIds, userId: who, at });
      }
      const newest = list[list.length - 1]?.createdAt ?? 0;
      if (unread.length || newest > (latest.current.lastReadAt[readKey(chatId, who)] ?? 0)) {
        dispatch({ type: "mark-read", chatId, userId: who, at });
      }
    },
    [publish],
  );

  const isOnline = useCallback((userId: string) => peers.some((p) => p.userId === userId), [peers]);
  const lastReadAt = useCallback(
    (chatId: string) => state.data.lastReadAt[readKey(chatId, me)] ?? 0,
    [state.data.lastReadAt, me],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      state, me, setMe, peers, isOnline, lastReadAt, saveFailed, send, sendCard, updateCard, cardOp, createGroup, retry,
      toggleReaction, editMessage, deleteMessage, togglePin, loadEarlier, hasEarlier, setTyping, typingUsers, markRead,
    }),
    [state, me, setMe, peers, isOnline, lastReadAt, saveFailed, send, sendCard, updateCard, cardOp, createGroup, retry,
      toggleReaction, editMessage, deleteMessage, togglePin, loadEarlier, hasEarlier, setTyping, typingUsers, markRead],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}

export function userById(id: string) {
  return USERS.find((u) => u.id === id) ?? { id, name: id, fullName: id, tone: "graphite" as const };
}

/** Consecutive messages from one author inside the window collapse together. */
export function isGrouped(previous: Message | undefined, message: Message) {
  if (!previous) return false;
  if (previous.authorId !== message.authorId) return false;
  return message.createdAt - previous.createdAt < GROUP_WINDOW_MS;
}
