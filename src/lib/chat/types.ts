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
      /** Requests only: an itemised invoice, billed to the one person in `from`. */
      invoice?: Invoice;
    }
  /* Artifacts: small, playful apps that live in the thread. */
  | { type: "sketch"; prompt: string; strokes: SketchStroke[] }
  | { type: "tictactoe"; players: [string, string | null]; board: (string | null)[] }
  | { type: "wheel"; question: string; options: string[]; spins: { by: string; index: number; at: number }[] }
  /* Shared work: synced as operations (see lib/chat/ops.ts), not whole-card replaces. */
  | PlanCard
  | BillCard
  | ProjectCard;

/** One line of an invoice. Money is integer cents. */
export interface InvoiceLine { id: string; description: string; quantity: number; /** Cents per unit. */ unit: number }
export interface Invoice {
  /** "INV-0003": numbered per sender. */
  number: string;
  issuedAt: number;
  dueAt: number;
  lines: InvoiceLine[];
  /** VAT, in percent, on top of the lines. */
  taxRate: number;
  /** Payment terms, bank details or a thank-you. */
  note?: string;
}

/** A small itinerary: stops grouped by day, each with an optional time and place. */
export interface PlanStop {
  id: string;
  /** Start time (ms), or null for "sometime that day". */
  at: number | null;
  title: string;
  place?: string;
  note?: string;
  url?: string;
  /** Euros per person. */
  cost?: number;
  /** Who's responsible for this stop (booking, tickets…). */
  owner?: string | null;
  doneBy: string | null;
}
export interface PlanDay { id: string; /** Local midnight (ms). */ date: number; stops: PlanStop[] }
export interface PlanCard {
  type: "plan";
  title: string;
  days: PlanDay[];
  rsvps: Record<string, Rsvp>;
  /** Same access model as checklists: when false only the owner and `editors` change stops. */
  everyoneCanEdit: boolean;
  editors: string[];
}

/** A scanned (or typed) receipt, split by who had what. Amounts are integer cents. */
export interface BillItem { id: string; name: string; quantity: number; /** Line total, cents. */ total: number }
export interface BillCard {
  type: "bill";
  merchant: string;
  currency: string;
  items: BillItem[];
  /** Cents; spread over people in proportion to what they had. */
  tax: number;
  tip: number;
  /** Receipt total, cents (items + tax + tip). */
  total: number;
  /** Who paid the bill, and is owed the shares. */
  paidBy: string;
  /** Who had each item; an item shared by several splits evenly between them. */
  claims: Record<string, string[]>;
  /** Everyone who has paid their share (or was marked settled). */
  paid: string[];
}

export interface Task {
  id: string;
  title: string;
  column: string;
  /** Position within the column; fractional so a move is one write. */
  order: number;
  assignee: string | null;
  due: number | null;
  /** The message this task was made from, if any. */
  fromMessageId?: string;
  createdBy: string;
  createdAt: number;
  /** When each field last changed: concurrent edits merge per field, newest wins. */
  updatedAt: Partial<Record<"title" | "column" | "order" | "assignee" | "due", number>>;
  deleted?: boolean;
}
export interface ProjectCard {
  type: "project";
  name: string;
  columns: { id: string; name: string }[];
  tasks: Record<string, Task>;
}

/** One change to a shared card. Applied by the reducer in every tab, in any order. */
export type CardOp =
  | { kind: "plan.tick"; stopId: string; by: string | null }
  | { kind: "plan.addStop"; dayId: string; stop: PlanStop }
  | { kind: "plan.editStop"; stopId: string; patch: Partial<Omit<PlanStop, "id" | "doneBy">> }
  | { kind: "plan.removeStop"; stopId: string }
  | { kind: "plan.addDay"; day: PlanDay }
  | { kind: "plan.rsvp"; userId: string; value: Rsvp | null }
  | { kind: "bill.claim"; itemId: string; userId: string; on: boolean }
  | { kind: "bill.claimAll"; userIds: string[] }
  | { kind: "bill.pay"; userId: string }
  | { kind: "task.add"; task: Task }
  | { kind: "task.update"; id: string; patch: Partial<Pick<Task, "title" | "column" | "order" | "assignee" | "due">>; at: number }
  | { kind: "task.remove"; id: string }
  | { kind: "column.rename"; id: string; name: string }
  | { kind: "column.add"; column: { id: string; name: string } }
  | { kind: "column.remove"; id: string };

/** One pen stroke on a shared doodle; points are x,y pairs in a 300×220 space. */
export interface SketchStroke { id: string; by: string; color: string; size: number; pts: number[] }

export interface Attachment {
  id: string;
  kind: "image" | "file";
  name: string;
  size: number;
  /** Inline bytes (seeded demo files only). */
  dataUrl?: string;
  /** A remote file (seeded demo photos). */
  url?: string;
  /** Bytes live in IndexedDB under the attachment id (see lib/chat/media). */
  stored?: "idb";
  mime?: string;
  /** Natural image size, so photos reserve their shape before loading. */
  width?: number;
  height?: number;
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
  /** Who has read this message, and when (ms). */
  readBy?: Record<string, number>;
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
  /** Last time each person read each chat (see `readKey`), for unread counts and the divider. */
  lastReadAt: Record<string, number>;
}

export type TransportEvent =
  | { type: "message"; message: Message }
  | { type: "status"; chatId: string; messageId: string; status: DeliveryStatus; byUserId: string }
  /** One person read several messages at once (opening a chat), as a single event. */
  | { type: "read-by"; chatId: string; messageIds: string[]; userId: string; at: number }
  | { type: "typing"; chatId: string; userId: string; isTyping: boolean }
  | { type: "reaction"; chatId: string; messageId: string; emoji: string; userId: string; op: "add" | "remove" }
  | { type: "edit"; chatId: string; messageId: string; body: string; editedAt: number }
  | { type: "delete"; chatId: string; messageId: string; deletedAt: number }
  | { type: "pin"; chatId: string; messageId: string; pinned: boolean }
  | { type: "card"; chatId: string; messageId: string; card: Card }
  | { type: "card-op"; chatId: string; messageId: string; op: CardOp; by: string }
  | { type: "chat"; chat: Chat }
  | { type: "presence"; clientId: string; userId: string; at: number }
  | { type: "presence-bye"; clientId: string };

export interface ChatTransport {
  publish(event: TransportEvent): void;
  subscribe(handler: (event: TransportEvent) => void): () => void;
  close(): void;
}

export interface ChatStorage {
  load(): ChatState | null;
  /** False when the write failed (quota, blocked storage). */
  save(state: ChatState): boolean;
  loadDraft(chatId: string, userId: string): string;
  saveDraft(chatId: string, userId: string, draft: string): void;
}
