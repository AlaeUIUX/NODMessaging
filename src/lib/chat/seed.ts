import type { Chat, ChatState, Message, User } from "./types";

export const USERS: User[] = [
  { id: "me", name: "Alae", fullName: "Alae", tone: "graphite" },
  { id: "charles", name: "Charles", fullName: "Charles", tone: "denim" },
  { id: "jamshad", name: "Jamshad", fullName: "Jamshad", tone: "sage" },
  { id: "reema", name: "Reema", fullName: "Reema", tone: "clay" },
  { id: "salman", name: "Salman", fullName: "Salman", tone: "plum" },
];

export const CHATS: Chat[] = [
  { id: "dm", name: "Charles", kind: "dm", memberIds: ["me", "charles"] },
  { id: "general", name: "NOD Team", kind: "group", memberIds: ["me", "charles", "reema", "jamshad", "salman"], tone: "ochre" },
  { id: "reema", name: "Reema", kind: "dm", memberIds: ["me", "reema"] },
  { id: "jamshad", name: "Jamshad", kind: "dm", memberIds: ["me", "jamshad"] },
  { id: "salman", name: "Salman", kind: "dm", memberIds: ["me", "salman"] },
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
    msg({ id: "dm-2", chatId: "dm", authorId: "charles", body: "Took longer than planned, but the edge cases are all in there now.", createdAt: now - 5 * HOUR + 40_000 }),
    msg({
      id: "dm-3", chatId: "dm", authorId: "charles", body: "", createdAt: now - 4 * HOUR,
      kind: "voice", durationMs: 28_000, waveform: Array.from({ length: 26 }, (_, i) => 4 + Math.round(Math.abs(Math.sin(i * 0.9 + 3)) * 16)),
    }),
    msg({
      id: "dm-4", chatId: "dm", authorId: "me", body: "Listened on the way in. The offline section is exactly what we needed.", createdAt: now - 2 * HOUR,
      status: "read", replyToId: "dm-3", reactions: [{ emoji: "🙏", userIds: ["charles"] }],
    }),
    msg({ id: "dm-5", chatId: "dm", authorId: "charles", body: "Can you review the latest implementation when you get a sec?", createdAt: now - 90 * 60 * 1000 }),
    msg({
      id: "dm-6", chatId: "dm", authorId: "me", body: "Sure thing, I'll have a look at it today.", createdAt: now - 80 * 60 * 1000,
      status: "read", reactions: [{ emoji: "❤️", userIds: ["charles"] }],
    }),
  ];

  const general: Message[] = [
    msg({ id: "g-1", chatId: "general", authorId: "charles", body: "Hey team, I've finished with the requirements doc!", createdAt: now - 6 * HOUR }),
    msg({ id: "g-2", chatId: "general", authorId: "reema", body: "Same! I do like it", createdAt: now - 6 * HOUR + 60_000 }),
    msg({ id: "g-3", chatId: "general", authorId: "jamshad", body: "Don't you guys think it'd be nice to add a QR code at the end for clients?", createdAt: now - 5 * HOUR }),
    msg({
      id: "g-4", chatId: "general", authorId: "me", body: "Love that. I'll mock it up in the handoff screen.", createdAt: now - 3 * HOUR,
      status: "read", replyToId: "g-3", reactions: [{ emoji: "🔥", userIds: ["jamshad", "reema"] }],
    }),
    msg({ id: "g-5", chatId: "general", authorId: "reema", body: "@Charles can you please review the latest implementation?", createdAt: now - 2 * HOUR }),
    msg({
      id: "g-6", chatId: "general", authorId: "me", body: "Sure thing, I'll have a look at it today.", createdAt: now - 100 * 60 * 1000,
      status: "read", reactions: [{ emoji: "❤️", userIds: ["reema"] }],
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
      msg({ id: "g-a1", chatId: "general", authorId: "jamshad", body: "Standup notes are in the doc if anyone missed it", createdAt: now - 28 * HOUR }),
      msg({ id: "g-a2", chatId: "general", authorId: "charles", body: "Thanks for pulling that together 🙏", createdAt: now - 28 * HOUR + 50_000 }),
      msg({ id: "g-a3", chatId: "general", authorId: "reema", body: "Anyone got the _latest_ Figma link?", createdAt: now - 27 * HOUR }),
    ],
  };

  // Structured content for the team chat: a long-form brief, a file, a poll
  // that is still open, and a checklist only its owner can edit.
  const brief = [
    "# Kickoff brief — Spaces v2",
    "Scope: messaging surfaces only.",
    "Owners: @Jamshad and @Reema · Target: **March 14**",
    "- Composer with rich text",
    "- Polls, checklists and reminders",
    "> Keep it calm. Less chrome, more content.",
  ].join("\n");
  const claudeMd = "# CLAUDE.md\n\nProject notes for the NOD prototype.\n\n- Next.js app router\n- Geist everywhere\n";
  general.push(
    msg({ id: "g-7", chatId: "general", authorId: "charles", body: brief, createdAt: now - 95 * 60 * 1000 }),
    msg({
      id: "g-8", chatId: "general", authorId: "charles", body: "", createdAt: now - 94 * 60 * 1000,
      attachments: [{
        id: "claude-md", kind: "file", name: "CLAUDE.md", size: claudeMd.length,
        dataUrl: `data:text/markdown;charset=utf-8,${encodeURIComponent(claudeMd)}`,
      }],
    }),
    msg({
      id: "g-9", chatId: "general", authorId: "reema", kind: "card", body: "Poll: Where for lunch on Friday?", createdAt: now - 60 * 60 * 1000,
      card: {
        type: "poll",
        question: "Where for lunch on Friday?",
        options: [
          { id: "o1", label: "Konjō Ramen", votes: ["charles"] },
          { id: "o2", label: "The Mexicano", votes: ["reema", "jamshad"] },
          { id: "o3", label: "Brewhouse Pies", votes: [] },
        ],
        multiple: false,
        anonymous: false,
        closesAt: now + 23 * HOUR,
        closedAt: null,
      },
    }),
    msg({
      id: "g-10", chatId: "general", authorId: "charles", kind: "card", body: "Checklist: Launch checklist", createdAt: now - 50 * 60 * 1000,
      card: {
        type: "checklist",
        title: "Launch checklist",
        items: [
          { id: "c1", label: "Finalise hero copy", doneBy: "charles" },
          { id: "c2", label: "QA Spaces flow on iOS", doneBy: "reema" },
          { id: "c3", label: "Send investor preview", doneBy: null },
          { id: "c4", label: "Record the demo video", doneBy: null },
        ],
        everyoneCanEdit: false,
        editors: ["reema"],
        requests: [],
      },
    }),
  );

  // A shared moodboard: several photos in one message, shown as a collection.
  const photo = (id: string, q: string, width: number, height: number) => ({
    id, kind: "image" as const, name: `${id}.jpg`, size: 240_000, width, height,
    url: `https://images.unsplash.com/${q}?w=900&q=70&fm=jpg`,
  });
  general.push(msg({
    id: "g-11", chatId: "general", authorId: "reema", body: "", createdAt: now - 40 * 60 * 1000,
    attachments: [
      photo("photo-1618221195710-dd6b41faaea6", "photo-1618221195710-dd6b41faaea6", 900, 1125),
      photo("photo-1600210492486-724fe5c67fb0", "photo-1600210492486-724fe5c67fb0", 900, 600),
      photo("photo-1586023492125-27b2c045efd7", "photo-1586023492125-27b2c045efd7", 900, 600),
      photo("photo-1616486338812-3dadae4b4ace", "photo-1616486338812-3dadae4b4ace", 900, 1200),
    ],
  }));
  general.push(msg({
    id: "g-12", chatId: "general", authorId: "reema", body: "Moodboard for the Spaces launch ✨", createdAt: now - 40 * 60 * 1000 + 20_000,
  }));

  const reema: Message[] = [
    msg({ id: "r-1", chatId: "reema", authorId: "reema", body: "Moodboard for the new inbox is up. Leaning warm neutrals with one sharp accent.", createdAt: now - 30 * HOUR }),
    msg({ id: "r-2", chatId: "reema", authorId: "me", body: "Yes. Less chrome, more content.", createdAt: now - 29 * HOUR, status: "read" }),
    msg({ id: "r-3", chatId: "reema", authorId: "reema", body: "Exactly. Sending the type scale tonight ✨", createdAt: now - 29 * HOUR + 60_000, reactions: [{ emoji: "❤️", userIds: ["me"] }] }),
  ];

  const jamshad: Message[] = [
    msg({ id: "j-1", chatId: "jamshad", authorId: "me", body: "Did the QR idea make it into the deck?", createdAt: now - 52 * HOUR, status: "read" }),
    msg({ id: "j-2", chatId: "jamshad", authorId: "jamshad", body: "Slide 9. Clients loved it.", createdAt: now - 51 * HOUR }),
  ];

  const salman: Message[] = [
    msg({ id: "s-1", chatId: "salman", authorId: "salman", body: "Hello Alae, hope you're well. Can you join us for a few mins?", createdAt: now - 26 * HOUR }),
    msg({ id: "s-2", chatId: "salman", authorId: "me", body: "On my way 👋", createdAt: now - 26 * HOUR + 90_000, status: "read" }),
  ];

  return {
    version: CURRENT_VERSION,
    chats: CHATS,
    messages: { dm, general, reema, jamshad, salman },
    archive,
    lastReadAt: {},
  };
}

export const CURRENT_VERSION = 6;
