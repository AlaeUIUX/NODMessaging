export type DeliveryStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export type MessageKind = "text" | "voice" | "card";

export interface PollOption { id: string; label: string; votes: string[] }
export type Rsvp = "going" | "maybe" | "no";

/** Structured, interactive messages. Every change syncs as a whole-card replace. */
export type Card =
  | {
      type: "poll";
      question: string;
      options: PollOption[];
      multiple: boolean;
      anonymous: boolean;
      closesAt: number;
      closedAt: number | null;
    }
  | {
      type: "checklist";
      title: string;
      items: { id: string; label: string; doneBy: string | null }[];
      /** When false only the owner and `editors` may change it. */
      everyoneCanEdit: boolean;
      editors: string[];
      requests: string[];
    }
  | { type: "reminder"; text: string; at: number; audience: "me" | "everyone"; firedAt: number | null }
  | { type: "location"; place: string; address: string; live: boolean; until: number | null; x: number; y: number }
  | { type: "event"; title: string; startsAt: number; place: string; rsvps: Record<string, Rsvp> }
  | {
      type: "payment";
      mode: "request" | "sent";
      amount: number;
      note: string;
      /** Request: who is asked to pay. Sent: the recipient. */
      from: string[];
      paidBy: string[];
    };

export interface Attachment {
  id: string;
  kind: "image" | "file";
  name: string;
  size: number;
  /** Data URL for images small enough to inline; undefined for large/opaque files. */
  dataUrl?: string;
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface EditRecord {
  body: string;
  editedAt: number;
}

export interface Message {
  id: string;
  /** Stable across optimistic render → server ack, so retries reconcile instead of duplicating. */
  clientId: string;
  chatId: string;
  authorId: string;
  kind: MessageKind;
  body: string;
  createdAt: number;
  status: DeliveryStatus;
  reactions: Reaction[];
  replyToId: string | null;
  editedAt: number | null;
  editHistory: EditRecord[];
  pinned: boolean;
  deletedAt: number | null;
  attachments: Attachment[];
  /** Structured messages only. */
  card?: Card;
  /** Voice notes only. */
  durationMs?: number;
  waveform?: number[];
}

/** Named avatar colours — resolved to real values in `lib/chat/avatar.ts`. */
export type AvatarTone = "clay" | "sage" | "ochre" | "denim" | "plum" | "graphite";

export interface User {
  id: string;
  /** Short name used in mentions and group bylines. */
  name: string;
  fullName: string;
  tone: AvatarTone;
}

export interface Chat {
  id: string;
  name: string;
  kind: "dm" | "group";
  memberIds: string[];
  /** Groups only; DMs take their colour from the other member. */
  tone?: AvatarTone;
}

export interface ChatState {
  version: number;
  chats: Chat[];
  messages: Record<string, Message[]>;
  /** Older pages not yet pulled into the thread, keyed by chat id. */
  archive: Record<string, Message[]>;
  /** Last time the local user read each chat, for the new-messages divider. */
  lastReadAt: Record<string, number>;
}

export type TransportEvent =
  | { type: "message"; message: Message }
  | { type: "status"; chatId: string; messageId: string; status: DeliveryStatus; byUserId: string }
  | { type: "typing"; chatId: string; userId: string; isTyping: boolean }
  | { type: "reaction"; chatId: string; messageId: string; emoji: string; userId: string; op: "add" | "remove" }
  | { type: "edit"; chatId: string; messageId: string; body: string; editedAt: number }
  | { type: "delete"; chatId: string; messageId: string; deletedAt: number }
  | { type: "pin"; chatId: string; messageId: string; pinned: boolean }
  | { type: "card"; chatId: string; messageId: string; card: Card }
  | { type: "presence"; clientId: string; userId: string; at: number }
  | { type: "presence-bye"; clientId: string };

export interface ChatTransport {
  publish(event: TransportEvent): void;
  subscribe(handler: (event: TransportEvent) => void): () => void;
  close(): void;
}

export interface ChatStorage {
  load(): ChatState | null;
  save(state: ChatState): void;
  loadDraft(chatId: string): string;
  saveDraft(chatId: string, draft: string): void;
}
