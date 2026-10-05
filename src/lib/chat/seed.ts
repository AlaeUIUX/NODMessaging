import { ADMIN, baseRoles } from "./groups";
import { msg } from "./seedkit";
import { billSeed } from "./seed-bill";
import { planSeed } from "./seed-plan";
import { projectSeed } from "./seed-project";
import type { Chat, ChatState, Message, User } from "./types";

export const USERS: User[] = [
  { id: "me", name: "Alae", fullName: "Alae", tone: "graphite", username: "alae", phone: "+43123456789", bio: "Designing NOD." },
  { id: "charles", name: "Charles", fullName: "Charles", tone: "denim", username: "charles", phone: "+436601112233", bio: "Engineering · coffee first." },
  { id: "jamshad", name: "Jamshad", fullName: "Jamshad", tone: "sage", username: "jamshad", phone: "+436602223344" },
  { id: "reema", name: "Reema", fullName: "Reema", tone: "clay", username: "reema", phone: "+436603334455", bio: "Product, and plants." },
  { id: "salman", name: "Salman", fullName: "Salman", tone: "plum", username: "salman", phone: "+436604445566" },
];

const DAY = 24 * 60 * 60 * 1000;
const cover = (q: string) => `https://images.unsplash.com/${q}?w=900&q=70&fm=jpg`;
const TEAM = ["me", "charles", "reema", "jamshad", "salman"];

/**
 * NOD Team shows what a group can be: roles (Admin, Design, Engineering), a
 * read-only #announcements for admins, and a #design only Design can see.
 * Admins (Alae and Charles) see every channel.
 */
const NOD_TEAM: Chat = {
  id: "general", name: "NOD Team", kind: "group", memberIds: TEAM, tone: "ochre",
  group: {
    description: "The people building NOD. Launch planning, design reviews and the occasional lunch vote.",
    cover: cover("photo-1522071820081-009f0129c71c"),
    roles: [
      ...baseRoles(),
      { id: "design", name: "Design", tone: "plum", permissions: [] },
      { id: "eng", name: "Engineering", tone: "denim", permissions: [] },
    ],
    memberRoles: { me: [ADMIN, "design"], charles: [ADMIN, "eng"], reema: ["design"], jamshad: ["eng"], salman: [] },
    channels: [
      { id: "general", name: "general", topic: "Everything NOD", roles: [], postRoles: [] },
      { id: "general--announcements", name: "announcements", topic: "News from the team leads", roles: [], postRoles: [ADMIN] },
      { id: "general--design", name: "design", topic: "Type, colour and the new inbox", roles: ["design"], postRoles: [] },
    ],
    invites: [],
    inviteCode: "nodteam",
    createdBy: "charles",
    createdAt: Date.now() - 60 * DAY,
  },
};

/** Reema's group, with an invitation waiting for Alae: accept it from the inbox. */
const VIENNA: Chat = {
  id: "vienna", name: "Weekend in Vienna", kind: "group", memberIds: ["reema", "salman"], tone: "sage",
  group: {
    description: "Coffee houses, the Naschmarkt and one very long museum day. November, dates TBC.",
    cover: cover("photo-1516550893923-42d28e5677af"),
    roles: baseRoles(),
    memberRoles: { reema: [ADMIN] },
    channels: [{ id: "vienna", name: "general", roles: [], postRoles: [] }],
    invites: [{ userId: "me", by: "reema", at: Date.now() - 3 * 60 * 60 * 1000 }],
    inviteCode: "vienna",
    createdBy: "reema",
    createdAt: Date.now() - 2 * DAY,
  },
};

/** Public groups, found on Explore. Nobody in the demo has invited Alae; anyone can join. */
const publicGroup = (id: string, name: string, tone: Chat["tone"], members: string[], admin: string, description: string, cover: string, topics: string[], total: number): Chat => ({
  id, name, kind: "group", memberIds: members, tone,
  group: {
    description, cover: `https://images.unsplash.com/${cover}?w=900&q=70&fm=jpg`,
    roles: baseRoles(), memberRoles: { [admin]: [ADMIN] },
    channels: [{ id, name: "general", roles: [], postRoles: [] }],
    invites: [], inviteCode: id, createdBy: admin, createdAt: Date.now() - 120 * DAY,
    discover: { topics, members: total },
  },
});
const PUBLIC_GROUPS: Chat[] = [
  publicGroup("pub-german", "German Learners Vienna", "sage", ["jamshad", "salman"], "salman",
    "Stammtisch on Thursdays, flashcard swaps every day. All levels welcome.", "photo-1512820790803-83ca734da794", ["german", "language", "vienna"], 1240),
  publicGroup("pub-design", "Product Designers DACH", "plum", ["reema", "charles"], "reema",
    "Crits, jobs and the odd meetup for product designers in Germany, Austria and Switzerland.", "photo-1497366216548-37526070297c", ["design", "work"], 3400),
  publicGroup("pub-coffee", "Vienna Coffee Club", "ochre", ["salman"], "salman",
    "One new café a week, and a Saturday walk to try it together.", "photo-1495474472287-4d71bcdd2085", ["coffee", "vienna", "food"], 860),
  publicGroup("pub-founders", "Indie Founders", "denim", ["charles"], "charles",
    "Small teams shipping real things. Weekly wins, honest numbers.", "photo-1522071820081-009f0129c71c", ["startups", "work"], 2100),
  publicGroup("pub-hikers", "Alps Weekend Hikers", "graphite", ["jamshad"], "jamshad",
    "Day hikes and hut weekends from Vienna. Routes for every pace.", "photo-1506905925346-21bda4d32df4", ["hiking", "travel"], 540),
];

export const CHATS: Chat[] = [
  { id: "dm", name: "Charles", kind: "dm", memberIds: ["me", "charles"] },
  NOD_TEAM,
  { id: "general--announcements", name: "NOD Team · #announcements", kind: "group", groupId: "general", memberIds: TEAM, tone: "ochre" },
  { id: "general--design", name: "NOD Team · #design", kind: "group", groupId: "general", memberIds: ["me", "charles", "reema"], tone: "ochre" },
  VIENNA,
  ...PUBLIC_GROUPS,
  { id: "reema", name: "Reema", kind: "dm", memberIds: ["me", "reema"] },
  { id: "jamshad", name: "Jamshad", kind: "dm", memberIds: ["me", "jamshad"] },
  { id: "salman", name: "Salman", kind: "dm", memberIds: ["me", "salman"] },
];

const HOUR = 60 * 60 * 1000;

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

  // Analytics demos (Vanessa's branch): something in every bucket, so each widget has a story to tell.
  general.push(
    msg({
      id: "g-13", chatId: "general", authorId: "reema", kind: "card", body: "Event: Design crit", createdAt: now - 45 * 60 * 1000,
      card: { type: "event", title: "Design crit", startsAt: now + 2 * 24 * HOUR, place: "Studio Loft", rsvps: { reema: "going", jamshad: "going" } },
    }),
    msg({
      id: "g-14", chatId: "general", authorId: "charles", kind: "card", body: "Reminder: Send the investor update", createdAt: now - 44 * 60 * 1000,
      card: { type: "reminder", text: "Send the investor update", at: now + 3 * HOUR, audience: "everyone", firedAt: null },
    }),
    msg({
      id: "g-15", chatId: "general", authorId: "charles", kind: "card", body: "Poll: Which font pairing?", createdAt: now - 42 * 60 * 1000,
      card: {
        type: "poll",
        question: "Which font pairing?",
        options: [
          { id: "fo1", label: "Geist / Geist Mono", votes: ["me", "reema"] },
          { id: "fo2", label: "Inter / JetBrains Mono", votes: ["jamshad"] },
        ],
        multiple: false,
        anonymous: false,
        closesAt: now + 5 * HOUR,
        closedAt: null,
      },
    }),
    msg({
      id: "g-16", chatId: "general", authorId: "jamshad", kind: "card", body: "Poll: Standup time?", createdAt: now - 41 * 60 * 1000,
      card: {
        type: "poll",
        question: "Standup time?",
        options: [
          { id: "so1", label: "9:30am", votes: ["jamshad", "salman"] },
          { id: "so2", label: "10:00am", votes: ["me", "charles", "reema"] },
        ],
        multiple: false,
        anonymous: false,
        closesAt: now - 2 * HOUR,
        closedAt: now - 2 * HOUR,
      },
    }),
    msg({
      id: "g-17", chatId: "general", authorId: "me", kind: "card", body: "Payment request: Studio Loft deposit", createdAt: now - 36 * HOUR,
      card: { type: "payment", mode: "request", amount: 45, note: "Studio Loft deposit", from: ["charles", "reema"], paidBy: [] },
    }),
  );

  const reema: Message[] = [
    msg({ id: "r-1", chatId: "reema", authorId: "reema", body: "Moodboard for the new inbox is up. Leaning warm neutrals with one sharp accent.", createdAt: now - 30 * HOUR }),
    msg({ id: "r-2", chatId: "reema", authorId: "me", body: "Yes. Less chrome, more content.", createdAt: now - 29 * HOUR, status: "read" }),
    msg({ id: "r-3", chatId: "reema", authorId: "reema", body: "Exactly. Sending the type scale tonight ✨", createdAt: now - 29 * HOUR + 60_000, reactions: [{ emoji: "❤️", userIds: ["me"] }] }),
    msg({
      id: "r-4", chatId: "reema", authorId: "me", kind: "card", body: "Checklist: Inbox redesign", createdAt: now - 28 * HOUR,
      card: {
        type: "checklist",
        title: "Inbox redesign",
        items: [
          { id: "ic1", label: "Warm neutral palette", doneBy: "reema" },
          { id: "ic2", label: "One sharp accent colour", doneBy: "me" },
          { id: "ic3", label: "Type scale", doneBy: null },
          { id: "ic4", label: "Content audit", doneBy: null },
        ],
        everyoneCanEdit: false,
        editors: ["reema"],
        requests: ["jamshad"],
      },
    }),
  ];

  const jamshad: Message[] = [
    msg({ id: "j-1", chatId: "jamshad", authorId: "me", body: "Did the QR idea make it into the deck?", createdAt: now - 52 * HOUR, status: "read" }),
    msg({ id: "j-2", chatId: "jamshad", authorId: "jamshad", body: "Slide 9. Clients loved it.", createdAt: now - 51 * HOUR }),
    msg({
      id: "j-3", chatId: "jamshad", authorId: "jamshad", kind: "card", body: "Checklist: Standup agenda", createdAt: now - 20 * HOUR,
      card: {
        type: "checklist",
        title: "Standup agenda",
        items: [
          { id: "ja1", label: "Yesterday's blockers", doneBy: "jamshad" },
          { id: "ja2", label: "Today's focus", doneBy: "me" },
          { id: "ja3", label: "Anything for design review", doneBy: "jamshad" },
        ],
        everyoneCanEdit: true,
        editors: [],
        requests: [],
      },
    }),
  ];

  const salman: Message[] = [
    msg({ id: "s-1", chatId: "salman", authorId: "salman", body: "Hello Alae, hope you're well. Can you join us for a few mins?", createdAt: now - 26 * HOUR }),
    msg({ id: "s-2", chatId: "salman", authorId: "me", body: "On my way 👋", createdAt: now - 26 * HOUR + 90_000, status: "read" }),
    msg({
      id: "s-3", chatId: "salman", authorId: "me", kind: "card", body: "Checklist: Move prep", createdAt: now - 10 * HOUR,
      card: {
        type: "checklist",
        title: "Move prep",
        items: [
          { id: "sa1", label: "Book the van", doneBy: "me" },
          { id: "sa2", label: "Pack the kitchen", doneBy: null },
          { id: "sa3", label: "Label boxes by room", doneBy: null },
          { id: "sa4", label: "Forward the mail", doneBy: null },
          { id: "sa5", label: "Confirm the new lease", doneBy: null },
        ],
        everyoneCanEdit: true,
        editors: [],
        requests: [],
      },
    }),
  ];

  // Feature demos (plans, bills, boards) live in their own seed files and slot into their chats by time.
  // NOD Team's other channels, and Reema's Vienna group.
  const announcements: Message[] = [
    msg({ id: "an-1", chatId: "general--announcements", authorId: "charles", body: "📣 Launch moves to Thursday the 15th. Thanks everyone for the push this week.", createdAt: now - 26 * HOUR }),
    msg({ id: "an-2", chatId: "general--announcements", authorId: "me", body: "Design freeze is Monday. Anything after that goes into 1.1 ✨", createdAt: now - 3 * HOUR, status: "read" }),
  ];
  const design: Message[] = [
    msg({ id: "de-1", chatId: "general--design", authorId: "reema", body: "Type scale v2 is up: tighter headings, Geist all the way.", createdAt: now - 7 * HOUR }),
    msg({ id: "de-2", chatId: "general--design", authorId: "me", body: "Love it. Can we try 15px for body text?", createdAt: now - 6 * HOUR, status: "read" }),
    msg({ id: "de-3", chatId: "general--design", authorId: "reema", body: "On it. Mock coming after lunch 🎨", createdAt: now - 6 * HOUR + 120_000 }),
  ];
  const vienna: Message[] = [
    msg({ id: "vi-1", chatId: "vienna", authorId: "reema", body: "Who's in for Vienna in November? Thinking Friday to Sunday.", createdAt: now - 4 * HOUR }),
    msg({ id: "vi-2", chatId: "vienna", authorId: "salman", body: "In! I'll look at trains.", createdAt: now - 3 * HOUR - 20 * 60 * 1000 }),
  ];

  // Something to read once you join a public group.
  const pub = (id: string, chatId: string, authorId: string, body: string, ago: number) => msg({ id, chatId, authorId, body, createdAt: now - ago });
  const publicThreads: Record<string, Message[]> = {
    "pub-german": [pub("pg-1", "pub-german", "salman", "Stammtisch this Thursday at Café Ritter, 7pm. Beginners very welcome 🇩🇪", 9 * HOUR), pub("pg-2", "pub-german", "jamshad", "Bringing my separable-verbs flashcards. Who wants to swap?", 7 * HOUR)],
    "pub-design": [pub("pd-1", "pub-design", "reema", "Crit night next Tuesday: bring one screen you're unsure about.", 20 * HOUR), pub("pd-2", "pub-design", "charles", "Sharing our token naming doc in a sec.", 18 * HOUR)],
    "pub-coffee": [pub("pc-1", "pub-coffee", "salman", "This week: Café Sperl. Saturday 10am, meet by the door ☕", 30 * HOUR)],
    "pub-founders": [pub("pf-1", "pub-founders", "charles", "Win of the week: first paying team on NOD 🎉 What's yours?", 2 * DAY)],
    "pub-hikers": [pub("ph-1", "pub-hikers", "jamshad", "Schneeberg on Sunday if the weather holds. 5h loop, steady pace.", 3 * DAY)],
  };

  const messages: Record<string, Message[]> = {
    dm, general, reema, jamshad, salman, "general--announcements": announcements, "general--design": design, vienna, ...publicThreads,
  };
  for (const m of [...planSeed(now), ...billSeed(now), ...projectSeed(now)]) {
    (messages[m.chatId] ??= []).push(m);
  }
  for (const list of Object.values(messages)) list.sort((a, b) => a.createdAt - b.createdAt);

  return {
    version: CURRENT_VERSION,
    chats: CHATS,
    messages,
    archive,
    lastReadAt: {},
  };
}

// v7/v8 added the plan, bill and board demos; existing threads keep theirs and gain these
// (v8 again, for anyone who loaded v7 before the demos were filled in). v9 adds the Analytics demos,
// v10 groups: NOD Team's roles and channels, and the Vienna invitation. v11 public groups for Explore.
export const CURRENT_VERSION = 11;
