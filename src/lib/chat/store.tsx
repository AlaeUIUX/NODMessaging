"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { sendMessage as apiSend } from "./api";
import { buildSeedState, CHATS, USERS } from "./seed";
import { localStorageAdapter } from "./storage";
import { createBroadcastTransport, prunePeers, PRESENCE_INTERVAL_MS, type Peer } from "./transport";
import type { Attachment, Card, Chat, ChatState, DeliveryStatus, Message, TransportEvent } from "./types";

/**
 * One id per browsing context, fixed at module load — two tabs get different
 * ids, which is what presence needs. Generating it during render would be
 * impure; a ref would be read during render.
 */
const CLIENT_ID = typeof window === "undefined" ? "" : Math.random().toString(36).slice(2);

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
  | { type: "load-earlier"; chatId: string }
  | { type: "typing"; chatId: string; userId: string; isTyping: boolean }
  | { type: "mark-read"; chatId: string; at: number };

function mapMessages(state: State, chatId: string, fn: (m: Message) => Message): State {
  const list = state.data.messages[chatId];
  if (!list) return state;
  return {
    ...state,
    data: { ...state.data, messages: { ...state.data.messages, [chatId]: list.map(fn) } },
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
      return mapMessages(state, action.chatId, (m) =>
        m.id === action.messageId ? { ...m, deletedAt: action.deletedAt, body: "", attachments: [] } : m,
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
            [action.chatId]: [...page, ...(state.data.messages[action.chatId] ?? [])],
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

    case "mark-read":
      return {
        ...state,
        data: { ...state.data, lastReadAt: { ...state.data.lastReadAt, [action.chatId]: action.at } },
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
  peers: Peer[];
  send: (chatId: string, body: string, opts?: { replyToId?: string | null; attachments?: Attachment[] }) => void;
  /** Sends a structured message; `summary` is what previews and quotes show. */
  sendCard: (chatId: string, card: Card, summary: string) => void;
  /** Creates a group with the current user in it, and returns it. */
  createGroup: (name: string, memberIds: string[]) => Chat;
  /** Replaces a card's state (votes, ticks, RSVPs…) and syncs it. */
  updateCard: (message: Message, update: (card: Card) => Card) => void;
  retry: (message: Message) => void;
  toggleReaction: (message: Message, emoji: string) => void;
  editMessage: (message: Message, body: string) => void;
  deleteMessage: (message: Message) => void;
  togglePin: (message: Message) => void;
  loadEarlier: (chatId: string) => void;
  hasEarlier: (chatId: string) => boolean;
  setTyping: (chatId: string, isTyping: boolean) => void;
  typingUsers: (chatId: string) => string[];
  markRead: (chatId: string) => void;
}

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
  const [state, dispatch] = useReducer(reducer, {
    data: buildSeedState(),
    typing: {},
    hydrated: false,
  });

  const [me, setMeState] = useState("me");
  const [peers, setPeers] = useState<Peer[]>([]);
  const transport = useRef(createBroadcastTransport());
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const openChatId = useRef<string | null>(null);
  // Long-lived subscriptions read the current identity without re-subscribing.
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  // Identity is per-tab so two tabs can hold a real conversation with each other.
  // Read after mount rather than in a lazy initializer: the prerendered HTML
  // always says "me", so seeding from sessionStorage during render would
  // hydrate mismatched markup.
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem("nod.chat.me");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setMeState(stored);
    } catch {
      // ignore
    }
  }, []);

  const setMe = useCallback((id: string) => {
    setMeState(id);
    try {
      window.sessionStorage.setItem("nod.chat.me", id);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    dispatch({ type: "hydrate", data: localStorageAdapter.load() ?? buildSeedState() });
  }, []);

  useEffect(() => {
    if (state.hydrated) localStorageAdapter.save(state.data);
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

  // Realtime inbound.
  useEffect(() => {
    const t = transport.current;
    const unsubscribe = t.subscribe((event) => {
      switch (event.type) {
        case "message": {
          if (event.message.authorId === meRef.current) return;
          dispatch({ type: "append", message: { ...event.message, status: "delivered" } });
          signal("in");
          dispatch({ type: "typing", chatId: event.message.chatId, userId: event.message.authorId, isTyping: false });
          // Acknowledge receipt, then read if this client is looking at the chat.
          t.publish({
            type: "status",
            chatId: event.message.chatId,
            messageId: event.message.id,
            status: "delivered",
            byUserId: meRef.current,
          });
          if (openChatId.current === event.message.chatId && document.visibilityState === "visible") {
            t.publish({
              type: "status",
              chatId: event.message.chatId,
              messageId: event.message.id,
              status: "read",
              byUserId: meRef.current,
            });
          }
          break;
        }
        case "status":
          if (event.byUserId === meRef.current) return;
          dispatch({ type: "status", chatId: event.chatId, messageId: event.messageId, status: event.status, byUserId: event.byUserId, at: Date.now() });
          break;
        case "chat":
          dispatch({ type: "add-chat", chat: event.chat });
          break;
        case "typing":
          if (event.userId === meRef.current) return;
          dispatch({ type: "typing", chatId: event.chatId, userId: event.userId, isTyping: event.isTyping });
          if (event.isTyping) clearTypingLater(event.chatId, event.userId);
          break;
        case "reaction":
          if (event.userId === meRef.current) return;
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
        case "delete":
          dispatch({
            type: "delete",
            chatId: event.chatId,
            messageId: event.messageId,
            deletedAt: event.deletedAt,
          });
          break;
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
        case "presence":
          setPeers((prev) => {
            if (event.clientId === CLIENT_ID) return prev;
            const next = prev.filter((p) => p.clientId !== event.clientId);
            next.push({ clientId: event.clientId, userId: event.userId, at: event.at });
            return prunePeers(next);
          });
          break;
        case "presence-bye":
          setPeers((prev) => prev.filter((p) => p.clientId !== event.clientId));
          break;
      }
    });
    return unsubscribe;
  }, [clearTypingLater]);

  // Presence heartbeat — drives whether the simulated peer is needed.
  useEffect(() => {
    const beat = () =>
      publish({ type: "presence", clientId: CLIENT_ID, userId: meRef.current, at: Date.now() });
    beat();
    const interval = setInterval(() => {
      beat();
      setPeers((prev) => prunePeers(prev));
    }, PRESENCE_INTERVAL_MS);
    const bye = () => publish({ type: "presence-bye", clientId: CLIENT_ID });
    window.addEventListener("pagehide", bye);
    return () => {
      clearInterval(interval);
      bye();
      window.removeEventListener("pagehide", bye);
    };
  }, [publish]);

  // Timers (simulated members, card updates) must read the freshest state,
  // not the snapshot captured when they were scheduled.
  const latest = useRef(state.data);
  useEffect(() => { latest.current = state.data; }, [state.data]);

  const simulate = useCallback(
    (sent: Message) => {
      const chat = latest.current.chats.find((c) => c.id === sent.chatId) ?? CHATS.find((c) => c.id === sent.chatId);
      const counterpart = chat?.memberIds.find((id) => id !== sent.authorId) ?? "charles";

      setTimeout(() => dispatch({ type: "status", chatId: sent.chatId, messageId: sent.id, status: "delivered" }), 700);
      setTimeout(() => {
        dispatch({ type: "typing", chatId: sent.chatId, userId: counterpart, isTyping: true });
        clearTypingLater(sent.chatId, counterpart);
      }, 1200);
      setTimeout(() => {
        dispatch({ type: "typing", chatId: sent.chatId, userId: counterpart, isTyping: false });
        const reply: Message = {
          id: `sim-${Date.now()}`,
          clientId: `sim-${Date.now()}`,
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
        signal("in");
        dispatch({ type: "status", chatId: sent.chatId, messageId: sent.id, status: "read", byUserId: counterpart, at: Date.now() });
      }, 2600);
      // In a group, everyone else reads it too, one by one.
      (chat?.memberIds ?? [])
        .filter((id) => id !== sent.authorId && id !== counterpart)
        .forEach((uid, i) => setTimeout(() => {
          dispatch({ type: "status", chatId: sent.chatId, messageId: sent.id, status: "read", byUserId: uid, at: Date.now() });
        }, 3400 + i * 1300));
    },
    [clearTypingLater],
  );

  const send = useCallback<ChatContextValue["send"]>(
    (chatId, body, opts) => {
      const trimmed = body.trim();
      if (!trimmed && !opts?.attachments?.length) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
          if (peers.length === 0) simulate(accepted);
        })
        .catch(() => {
          dispatch({ type: "patch", chatId, clientId: optimistic.clientId, patch: { status: "failed" } });
        });
    },
    [peers.length, publish, simulate],
  );

  const retry = useCallback<ChatContextValue["retry"]>(
    (message) => {
      dispatch({ type: "patch", chatId: message.chatId, clientId: message.clientId, patch: { status: "pending" } });
      apiSend(message)
        .then((accepted) => {
          dispatch({ type: "patch", chatId: message.chatId, clientId: message.clientId, patch: { status: "sent" } });
          publish({ type: "message", message: { ...accepted, status: "sent" } });
          if (peers.length === 0) simulate(accepted);
        })
        .catch(() => {
          dispatch({ type: "patch", chatId: message.chatId, clientId: message.clientId, patch: { status: "failed" } });
        });
    },
    [peers.length, publish, simulate],
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

  /** With nobody else online, the other members answer structured messages. */
  const simulateCard = useCallback(
    (sent: Message) => {
      const chat = latest.current.chats.find((c) => c.id === sent.chatId) ?? CHATS.find((c) => c.id === sent.chatId);
      const others = (chat?.memberIds ?? []).filter((id) => id !== sent.authorId);
      const card = sent.card;
      if (!card || !others.length) return;
      const act = (delay: number, fn: (c: Card) => Card) => setTimeout(() => updateCard(sent, fn), delay);
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
          ? { ...c, strokes: [...c.strokes, ...smiley().map((pts, i) => ({ id: `sim-${Date.now()}-${i}`, by, color: "blue", size: 4, pts }))] }
          : c));
      } else if (card.type === "wheel") {
        const by = others[0];
        act(4200, (c) => (c.type === "wheel" && c.spins.length === 0
          ? { ...c, spins: [{ by, index: Math.floor(Math.random() * c.options.length), at: Date.now() }] }
          : c));
      } else if (card.type === "checklist" && card.everyoneCanEdit && card.items.length) {
        act(2400, (c) => (c.type === "checklist" ? { ...c, items: c.items.map((it, j) => (j === 0 && !it.doneBy ? { ...it, doneBy: others[0] } : it)) } : c));
      }
    },
    [updateCard],
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
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
          const out: Message = { ...accepted, card };
          dispatch({ type: "patch", chatId, clientId: id, patch: { status: "sent" } });
          publish({ type: "message", message: { ...out, status: "sent" } });
          setTimeout(() => dispatch({ type: "status", chatId, messageId: id, status: "delivered" }), 700);
          if (peers.length === 0) simulateCard(out);
        })
        .catch(() => dispatch({ type: "patch", chatId, clientId: id, patch: { status: "failed" } }));
    },
    [peers.length, publish, simulateCard],
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
      openChatId.current = chatId;
      const list = state.data.messages[chatId] ?? [];
      list
        .filter((m) => m.authorId !== meRef.current && m.status !== "read")
        .forEach((m) =>
          publish({ type: "status", chatId, messageId: m.id, status: "read", byUserId: meRef.current }),
        );
      dispatch({ type: "mark-read", chatId, at: Date.now() });
    },
    [publish, state.data.messages],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      state, me, setMe, peers, send, sendCard, updateCard, createGroup, retry, toggleReaction, editMessage,
      deleteMessage, togglePin, loadEarlier, hasEarlier, setTyping, typingUsers, markRead,
    }),
    [state, me, setMe, peers, send, sendCard, updateCard, createGroup, retry, toggleReaction, editMessage,
      deleteMessage, togglePin, loadEarlier, hasEarlier, setTyping, typingUsers, markRead],
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
