import type { Chat, ChatState, Message, User } from "./types";

export const AVATARS = {
  me: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&q=70&fm=jpg",
  charles: "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=120&q=70&fm=jpg",
  roya: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=120&q=70&fm=jpg",
  jamshed: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&q=70&fm=jpg",
};

export const USERS: User[] = [
  { id: "me", name: "You", avatar: AVATARS.me },
  { id: "charles", name: "Charles", avatar: AVATARS.charles },
  { id: "roya", name: "Roya", avatar: AVATARS.roya },
  { id: "jamshed", name: "Jamshed", avatar: AVATARS.jamshed },
];

export const CHATS: Chat[] = [
  { id: "dm", name: "Charles", kind: "dm", memberIds: ["me", "charles"], avatar: AVATARS.charles },
  { id: "general", name: "TheNOD Team · #General", kind: "group", memberIds: ["me", "charles", "roya", "jamshed"], avatar: AVATARS.roya },
];

const HOUR = 60 * 60 * 1000;

function msg(partial: Partial<Message> & Pick<Message, "id" | "chatId" | "authorId" | "body" | "createdAt">): Message {
  return {
    clientId: partial.id,
    kind: "text",
    status: partial.authorId === "me" ? "read" : "delivered",
    reactions: [],
    replyToId: null,
    editedAt: null,
    editHistory: [],
    pinned: false,
    deletedAt: null,
    attachments: [],
    ...partial,
  };
}

export function buildSeedState(now = Date.now()): ChatState {
  const dm: Message[] = [
    msg({ id: "dm-1", chatId: "dm", authorId: "charles", body: "Hey, I've finished the requirements doc!", createdAt: now - 5 * HOUR }),
    msg({ id: "dm-2", chatId: "dm", authorId: "charles", body: "Good timing — was just looking at this.", createdAt: now - 5 * HOUR + 40_000 }),
    msg({
      id: "dm-3", chatId: "dm", authorId: "charles", body: "", createdAt: now - 4 * HOUR,
      kind: "voice", durationMs: 28_000, waveform: Array.from({ length: 26 }, (_, i) => 4 + Math.round(Math.abs(Math.sin(i * 0.9 + 3)) * 16)),
    }),
    msg({ id: "dm-4", chatId: "dm", authorId: "me", body: "I submitted a new attachment btw", createdAt: now - 2 * HOUR, status: "read" }),
    msg({ id: "dm-5", chatId: "dm", authorId: "charles", body: "Can you review the latest implementation when you get a sec?", createdAt: now - 90 * 60 * 1000 }),
    msg({
      id: "dm-6", chatId: "dm", authorId: "me", body: "Sure thing, I'll have a look at it today.", createdAt: now - 80 * 60 * 1000,
      status: "read", reactions: [{ emoji: "❤️", userIds: ["charles"] }],
    }),
  ];

  const general: Message[] = [
    msg({ id: "g-1", chatId: "general", authorId: "charles", body: "Hey team, I've finished with the requirements doc!", createdAt: now - 6 * HOUR }),
    msg({ id: "g-2", chatId: "general", authorId: "roya", body: "Same! I do like it", createdAt: now - 6 * HOUR + 60_000 }),
    msg({ id: "g-3", chatId: "general", authorId: "jamshed", body: "Don't you guys think it'd be nice to add a QR code at the end for clients?", createdAt: now - 5 * HOUR }),
    msg({ id: "g-4", chatId: "general", authorId: "me", body: "I submitted a new attachment btw", createdAt: now - 3 * HOUR, status: "read" }),
    msg({ id: "g-5", chatId: "general", authorId: "roya", body: "@Charles can you please review the latest implementation?", createdAt: now - 2 * HOUR }),
    msg({
      id: "g-6", chatId: "general", authorId: "me", body: "Sure thing, I'll have a look at it today.", createdAt: now - 100 * 60 * 1000,
      status: "read", reactions: [{ emoji: "❤️", userIds: ["roya"] }],
    }),
  ];

  const archive = {
    dm: [
      msg({ id: "dm-a1", chatId: "dm", authorId: "charles", body: "Morning! Quick one before you start —", createdAt: now - 26 * HOUR }),
      msg({ id: "dm-a2", chatId: "dm", authorId: "charles", body: "did the client sign off on the last round of changes?", createdAt: now - 26 * HOUR + 30_000 }),
      msg({ id: "dm-a3", chatId: "dm", authorId: "me", body: "They did — **final** sign-off came through Friday.", createdAt: now - 25 * HOUR, status: "read" }),
      msg({ id: "dm-a4", chatId: "dm", authorId: "charles", body: "Perfect, that unblocks the build.", createdAt: now - 25 * HOUR + 45_000 }),
    ],
    general: [
      msg({ id: "g-a1", chatId: "general", authorId: "jamshed", body: "Standup notes are in the doc if anyone missed it", createdAt: now - 28 * HOUR }),
      msg({ id: "g-a2", chatId: "general", authorId: "charles", body: "Thanks for pulling that together 🙏", createdAt: now - 28 * HOUR + 50_000 }),
      msg({ id: "g-a3", chatId: "general", authorId: "roya", body: "Anyone got the _latest_ Figma link?", createdAt: now - 27 * HOUR }),
    ],
  };

  return {
    version: CURRENT_VERSION,
    chats: CHATS,
    messages: { dm, general },
    archive,
    lastReadAt: {},
  };
}

export const CURRENT_VERSION = 2;
