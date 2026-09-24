export type DeliveryStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export type MessageKind = "text" | "voice";

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
  /** Voice notes only. */
  durationMs?: number;
  waveform?: number[];
}

export interface User {
  id: string;
  name: string;
  avatar: string;
}

export interface Chat {
  id: string;
  name: string;
  kind: "dm" | "group";
  memberIds: string[];
  avatar: string;
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
