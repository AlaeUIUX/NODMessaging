import { ADMIN, baseRoles, syncChannels } from "./groups";
import { DEFAULT_SHIFTS, type ChannelId, type FeedEvent, type OpBroadcast, type OpLive, type OpRequest, type Presence, type Target, type Transmission } from "./operation";
import { dayStart, HOUR, MINUTE, msg } from "./seedkit";
import type { AvatarTone, Chat, Message, OperationZone, ProjectCard, Task, User } from "./types";

/**
 * The demo Operation: EWC 2026 · Riyadh, Day 2 of 3, evening shift. 29
 * people in five crews across eight zones, three requests waiting, a
 * critical broadcast everyone has read and a normal one most have, and a
 * radio that keeps talking (EWC_SCRIPT).
 *
 * Seed modules must not import people.ts or store.tsx (people.ts imports the
 * users from seed.ts).
 */

export const EWC_ID = "ewc";

/* ---- people: the crew on site, on top of the five people the app already had ---- */

const crewUser = (id: string, fullName: string, tone: AvatarTone, n: number, bio?: string): User => ({
  id, name: fullName.split(" ")[0], fullName, tone, username: id, phone: `+4366050000${String(n).padStart(2, "0")}`, ...(bio ? { bio } : {}),
});

export const OPS_CREW: User[] = [
  crewUser("noura", "Noura Al-Qahtani", "denim", 1, "AV lead, Main Arena."),
  crewUser("omar", "Omar Al-Sayed", "ochre", 2),
  crewUser("abdullah", "Abdullah Al-Malki", "sage", 3),
  crewUser("ziyad", "Ziyad Al-Omari", "clay", 4),
  crewUser("fahad", "Fahad Al-Otaibi", "graphite", 5),
  crewUser("sara", "Sara Al-Mutairi", "plum", 6),
  crewUser("rahaf", "Rahaf Al-Ghamdi", "ochre", 7, "Player Lounge lead."),
  crewUser("huda", "Huda Al-Anazi", "sage", 8),
  crewUser("majed", "Majed Al-Zahrani", "denim", 9),
  crewUser("lina", "Lina Farouk", "clay", 10),
  crewUser("yousef", "Yousef Al-Harbi", "graphite", 11),
  crewUser("hessa", "Hessa Al-Fayez", "ochre", 12),
  crewUser("faisal", "Faisal Al-Shammari", "sage", 13, "Stage B lead. Lights, sound, crowd."),
  crewUser("mona", "Mona Al-Harthi", "plum", 14),
  crewUser("khalid", "Khalid Al-Shehri", "denim", 15),
  crewUser("turki", "Turki Al-Dosari", "clay", 16),
  crewUser("dana", "Dana Al-Subaie", "ochre", 17, "Merch lead."),
  crewUser("bandar", "Bandar Al-Juhani", "graphite", 18),
  crewUser("waleed", "Waleed Al-Saud", "plum", 19, "Media Room lead."),
  crewUser("amal", "Amal Al-Dosari", "sage", 20),
  crewUser("nasser", "Nasser Al-Rashid", "denim", 21, "VIP Lounge lead."),
  crewUser("lulwa", "Lulwa Al-Saleh", "clay", 22),
  crewUser("saud", "Saud Al-Ghamdi", "ochre", 23),
  crewUser("tariq", "Tariq Al-Amri", "graphite", 24, "Runner. New this shift."),
];

/** People who aren't in the Operation yet: open a crew link as one of them ("Try it as someone new"). */
export const OPS_RECRUITS: User[] = [
  crewUser("yara", "Yara Al-Hamdan", "plum", 31, "Volunteer, starting tonight."),
  crewUser("hamad", "Hamad Al-Mansour", "denim", 32, "Security contractor."),
  crewUser("rawan", "Rawan Al-Qahtani", "sage", 33, "Hospitality, day 2 and 3."),
  crewUser("sultan", "Sultan Al-Harbi", "ochre", 34, "Runner."),
];

/* ---- roles: Command plus four crews ---- */

export const R = {
  command: "ewc-command",
  av: "ewc-av",
  security: "ewc-security",
  hospitality: "ewc-hospitality",
  runners: "ewc-runners",
} as const;

const CREW_OF: Record<string, string> = {
  me: R.command, reema: R.command,
  noura: R.av, omar: R.av, charles: R.av, lina: R.av, yousef: R.av, faisal: R.av, waleed: R.av,
  fahad: R.security, majed: R.security, jamshad: R.security, khalid: R.security, turki: R.security, saud: R.security,
  sara: R.hospitality, rahaf: R.hospitality, huda: R.hospitality, dana: R.hospitality, amal: R.hospitality, nasser: R.hospitality, lulwa: R.hospitality,
  salman: R.runners, abdullah: R.runners, ziyad: R.runners, hessa: R.runners, mona: R.runners, bandar: R.runners, tariq: R.runners,
};
export const EWC_MEMBERS = Object.keys(CREW_OF);

/* ---- zones: each one a channel ---- */

const zone = (id: string, code: string, name: string, area: string, target: number, leadId: string, crews: string[], pin: { x: number; y: number }, slug: string): OperationZone =>
  ({ id, code, name, area, target, leadId, crews, pin, channelId: `${EWC_ID}--${slug}` });

export const EWC_ZONES: OperationZone[] = [
  zone("a1", "A1", "Main Arena", "Hall A", 5, "noura", [R.av, R.runners, R.security], { x: 0.17, y: 0.3 }, "a1-main-arena"),
  zone("a2", "A2", "Player Lounge", "Hall A", 3, "rahaf", [R.hospitality, R.security], { x: 0.26, y: 0.6 }, "a2-player-lounge"),
  zone("b1", "B1", "Broadcast Studio", "Hall B", 4, "charles", [R.av, R.runners], { x: 0.45, y: 0.26 }, "b1-broadcast-studio"),
  zone("b2", "B2", "Stage B", "Hall B", 5, "faisal", [R.av, R.runners], { x: 0.57, y: 0.56 }, "b2-stage-b"),
  zone("c1", "C1", "Gate 3 · Entrance", "Outdoor", 4, "jamshad", [R.security], { x: 0.86, y: 0.78 }, "c1-gate-3-entrance"),
  zone("c2", "C2", "Merch Store", "Outdoor", 2, "dana", [R.hospitality, R.runners], { x: 0.86, y: 0.3 }, "c2-merch-store"),
  zone("d1", "D1", "Media Room", "Level 2", 3, "waleed", [R.av, R.hospitality], { x: 0.18, y: 0.86 }, "d1-media-room"),
  zone("d2", "D2", "VIP Lounge", "Level 2", 3, "nasser", [R.hospitality, R.security], { x: 0.5, y: 0.86 }, "d2-vip-lounge"),
];
const Z = Object.fromEntries(EWC_ZONES.map((z) => [z.id, z])) as Record<string, OperationZone>;
const BROADCASTS = `${EWC_ID}--broadcasts`;

const NOW = Date.now();

export const EWC_GROUP: Chat = {
  id: EWC_ID,
  name: "EWC 2026 · Riyadh",
  kind: "group",
  memberIds: EWC_MEMBERS,
  tone: "graphite",
  group: {
    description: "Esports World Cup, Boulevard Riyadh City. Command, zones and crews for the three event days.",
    roles: [
      ...baseRoles(),
      { id: R.command, name: "Command", tone: "clay", permissions: ["approveRequests", "broadcast", "manageZones", "invite"] },
      { id: R.av, name: "AV & Broadcast", tone: "denim", permissions: [] },
      { id: R.security, name: "Security", tone: "sage", permissions: [] },
      { id: R.hospitality, name: "Hospitality", tone: "plum", permissions: [] },
      { id: R.runners, name: "Runners", tone: "ochre", permissions: [] },
    ],
    memberRoles: Object.fromEntries(EWC_MEMBERS.map((u) => [u, u === "me" ? [ADMIN, CREW_OF[u]] : [CREW_OF[u]]])),
    channels: [
      { id: EWC_ID, name: "general", topic: "Everyone on site", roles: [], postRoles: [] },
      { id: BROADCASTS, name: "broadcasts", topic: "Must-read announcements from Command", roles: [], postRoles: [ADMIN, R.command] },
      ...EWC_ZONES.map((z) => ({ id: z.channelId, name: z.channelId.slice(EWC_ID.length + 2), topic: `${z.code} · ${z.area}`, roles: [], postRoles: [] })),
    ],
    invites: [],
    inviteCode: "ewc2026",
    createdBy: "me",
    createdAt: NOW - 20 * 24 * HOUR,
    operation: {
      venue: "Boulevard Riyadh City",
      // Today is day 2 of 3.
      startsAt: dayStart(NOW, -1),
      days: 3,
      shifts: DEFAULT_SHIFTS,
      template: "esports",
      zones: EWC_ZONES,
      crews: [R.av, R.security, R.hospitality, R.runners],
      commandRole: R.command,
      broadcastsChannel: BROADCASTS,
      boardMessageId: "ewc-board",
      map: "ewc",
      links: [
        { code: "ewc-security", label: "Security crew", roleIds: [R.security], createdBy: "me", createdAt: NOW - 3 * 24 * HOUR },
        { code: "ewc-runners", label: "Runners · Stage B", roleIds: [R.runners], zoneId: "b2", createdBy: "reema", createdAt: NOW - 2 * 24 * HOUR },
        { code: "ewc-hosp", label: "Hospitality crew", roleIds: [R.hospitality], createdBy: "me", createdAt: NOW - 2 * 24 * HOUR },
      ],
    },
  },
};

/** The group and its channel chats, for CHATS. */
export const EWC_CHATS: Chat[] = [EWC_GROUP, ...syncChannels(EWC_GROUP, [])];

/* ---- who is where right now ---- */

const ROSTER: Record<string, string[]> = {
  a1: ["noura", "omar", "salman", "abdullah", "ziyad", "fahad", "sara"],
  a2: ["rahaf", "huda", "majed"],
  b1: ["charles", "lina", "yousef", "hessa"],
  b2: ["faisal", "mona"],
  c1: ["jamshad", "khalid", "turki"],
  c2: ["dana", "bandar"],
  d1: ["waleed", "amal"],
  d2: ["nasser", "lulwa", "saud"],
};

/* ---- the threads ---- */

const opRef = (id: string, chatId: string, by: string, ref: "request" | "broadcast", refId: string, body: string, at: number) =>
  msg({ id, chatId, authorId: by, kind: "card", body, createdAt: at, card: { type: "opRef", groupId: EWC_ID, ref, id: refId } });

export function ewcMessages(now: number): Message[] {
  const t = (id: string, chatId: string, by: string, minsAgo: number, body: string) => msg({ id, chatId, authorId: by, body, createdAt: now - minsAgo * MINUTE });
  const ch = (z: string) => Z[z].channelId;
  return [
    t("ewc-g1", EWC_ID, "reema", 95, "Welcome to Day 2 everyone. The run sheet is pinned in Mind."),
    t("ewc-g2", EWC_ID, "charles", 70, "Broadcast truck is online, feeds look clean."),
    t("ewc-g3", EWC_ID, "jamshad", 41, "Reminder: wristbands are checked at every hall door today."),
    t("ewc-g4", EWC_ID, "reema", 16, "Great work on the morning shift. Evening crews: Radio is on, keep your earbuds in."),
    t("ewc-g5", EWC_ID, "sara", 5, "Lost and found is at the info desk by Gate 1."),
    t("ewc-a1-1", ch("a1"), "noura", 48, "Casters are in. Mic check at 15:40."),
    t("ewc-a1-2", ch("a1"), "omar", 44, "Desk 2 has a buzz on channel 3, swapping the cable."),
    t("ewc-a1-3", ch("a1"), "ziyad", 12, "Checked in. Taking the press pit."),
    t("ewc-a1-4", ch("a1"), "noura", 8, "We're 7 here and only need 5 now. Happy to lend people."),
    t("ewc-b2-1", ch("b2"), "faisal", 14, "Stage B lighting rig is up. Still only two of us."),
    t("ewc-b2-2", ch("b2"), "mona", 10, "Queue is past the merch stand already."),
    opRef("ewc-b2-req", ch("b2"), "faisal", "request", "r-b2", "Request: 3 people for B2", now - 6 * MINUTE),
    t("ewc-c1-1", ch("c1"), "jamshad", 30, "Bag check running on lanes 1–3."),
    opRef("ewc-c1-req", ch("c1"), "khalid", "request", "r-c1", "Issue at C1: spill near Gate 3", now - 2 * MINUTE),
    opRef("ewc-d1-req", ch("d1"), "waleed", "request", "r-d1", "Request: supplies for D1", now - 3 * MINUTE),
    opRef("ewc-a2-req", ch("a2"), "rahaf", "request", "r-a2", "Request: supplies for A2", now - 52 * MINUTE),
    t("ewc-b1-1", ch("b1"), "charles", 40, "Replay server B is the backup today."),
    t("ewc-d2-1", ch("d2"), "nasser", 22, "First VIP cars at 16:30."),
    t("ewc-c2-1", ch("c2"), "dana", 18, "Jerseys selling fast, size M is nearly out."),
    opRef("ewc-bc-gates", BROADCASTS, "reema", "broadcast", "b-gates", "Critical: Gates open at 16:00. All crews to positions.", now - 122 * MINUTE),
    opRef("ewc-bc-water", BROADCASTS, "reema", "broadcast", "b-water", "Broadcast: Water stations restocked in Hall A and B.", now - 20 * MINUTE),
    msg({ id: "ewc-board", chatId: EWC_ID, authorId: "me", kind: "card", body: "Board: Ops board", createdAt: now - 26 * HOUR, card: ewcBoard(now) }),
    ...Object.entries(DAY_TALK).flatMap(([where, lines]) =>
      lines.map(([by, minsAgo, body], i) => t(`ewc-x-${where}-${i + 1}`, where === "general" ? EWC_ID : ch(where), by, minsAgo, body))),
  ];
}

/**
 * Everyone in the Operation has read the day so far, up to 20 minutes ago:
 * what's unread is what came in since, not the whole day. The keys are
 * storage's readKey ("chatId" for me, "user:chatId" for anyone else).
 */
export function ewcReadMarks(now: number, chats: Chat[]): Record<string, number> {
  const at = now - 20 * MINUTE;
  return Object.fromEntries(chats.filter((c) => c.id === EWC_ID || c.groupId === EWC_ID).flatMap((c) => ["me", ...EWC_MEMBERS].map((u) => [u === "me" ? c.id : `${u}:${c.id}`, at])));
}

/**
 * A day's worth of talk in every channel (minutes ago), so a channel opens
 * deep in the conversation the way it would at a real event, not on its
 * first message.
 */
const DAY_TALK: Record<string, [by: string, minsAgo: number, body: string][]> = {
  general: [
    ["reema", 410, "Morning all. Doors for crew at 10:00, briefing in the Media Room at 10:30."],
    ["charles", 402, "Broadcast crew is on site, coffee is in B1 if anyone needs it."],
    ["jamshad", 395, "Security briefing moved to 10:45, same room."],
    ["noura", 380, "Main Arena lights are on, we're walking the rows now."],
    ["salman", 371, "Parking B is open for crew. Use the side entrance, not Gate 1."],
    ["rahaf", 360, "Player Lounge is set. Teams arrive from 12:00."],
    ["reema", 348, "Run sheet v3 is pinned in Mind. Please read it before your shift."],
    ["dana", 333, "Merch store is stocked. Card machines are being charged."],
    ["waleed", 318, "Media accreditation desk opens at 11:30."],
    ["huda", 296, "Anyone have spare HDMI adapters? Lounge TV needs one."],
    ["yousef", 291, "Two in the B1 cupboard, I'll bring one over."],
    ["nasser", 270, "VIP guest list is final. 140 names, 12 plus-ones."],
    ["reema", 244, "Lunch for crew is in the Hall B break room from 13:00 to 14:30, in turns please."],
    ["khalid", 230, "Gate 3 queue barriers are up."],
    ["sara", 211, "Info desk is open. Lost and found starts there too."],
    ["faisal", 186, "Stage B soundcheck done, sounds great."],
    ["jamshad", 160, "Wristband colours today: green for crew, blue for media, gold for VIP."],
    ["reema", 140, "Gates open in 20 minutes. Positions please."],
    ["lina", 120, "Stream is live on all platforms."],
    ["omar", 96, "Casters are happy with the desk now, thanks B1."],
    ["mona", 75, "Stage B queue is building early, heads up."],
    ["reema", 58, "We're at 9,200 through the gates. Busiest hour is next, stay sharp."],
    ["bandar", 33, "Size M jerseys almost gone. Restock coming from storage."],
    ["amal", 24, "Post-match press conference at 18:15 in D1."],
    ["charles", 11, "Replay server failover test passed."],
  ],
  a1: [
    ["noura", 400, "Main Arena crew, check in when you're here please."],
    ["omar", 392, "Here. Starting with the casters' desk."],
    ["salman", 388, "Here. Taking the floor section."],
    ["abdullah", 380, "On my way, five minutes."],
    ["noura", 362, "Row numbers on the lower bowl are wrong from row K. Can someone fix the signs?"],
    ["sara", 355, "On it, I have the spare signs."],
    ["fahad", 330, "LED wall test at 12:00, please keep the stage clear."],
    ["omar", 301, "Desk mic 3 crackles, swapping it."],
    ["noura", 276, "Thanks Omar. Lunch in turns, two at a time."],
    ["abdullah", 240, "Aisle 4 has boxes from the vendors, moving them now."],
    ["salman", 205, "Fire exits all clear and checked."],
    ["noura", 150, "Doors in 10. Everyone to your section."],
    ["sara", 132, "First fans are in. Lower bowl filling fast."],
    ["fahad", 104, "LED wall flickered for a second, it's fine now. Watching it."],
    ["ziyad", 70, "Press pit is short on water, grabbing a case."],
    ["omar", 52, "Casters on air in 5."],
    ["abdullah", 31, "Someone dropped a phone in row M, handed to the info desk."],
    ["salman", 19, "Crowd is loud, earbuds in everyone."],
  ],
  a2: [
    ["rahaf", 398, "Lounge crew, morning! Teams start arriving at 12:00."],
    ["huda", 391, "Morning. I'll set up the warm-up room."],
    ["majed", 384, "Fridges are stocked. Halal snacks in the left one, the rest on the right."],
    ["rahaf", 350, "Team Falcons asked for an extra monitor in their room."],
    ["huda", 342, "Asked B1 for an HDMI adapter."],
    ["majed", 317, "Team Liquid's manager is here early, showing them around."],
    ["rahaf", 288, "Lunch boxes came. 6 teams × 8, one tray short."],
    ["huda", 280, "I'll call catering."],
    ["huda", 262, "Catering says 20 minutes for the last tray."],
    ["majed", 230, "Warm-up PCs updated and tested."],
    ["rahaf", 196, "Quiet hour 14:00–15:00, no visitors in the lounge please."],
    ["huda", 158, "Team Falcons on their way to Main Arena."],
    ["majed", 121, "Lounge TV is showing the stream now."],
    ["rahaf", 84, "Running low on water and towels."],
    ["huda", 46, "Thanks Command, supplies arrived."],
    ["majed", 27, "Next match teams are warming up."],
  ],
  b1: [
    ["charles", 405, "Studio crew, we start at 10:15. Coffee's on."],
    ["lina", 399, "Here. Replay servers booting."],
    ["yousef", 392, "Here. Labelling the return feeds."],
    ["hessa", 386, "Graphics laptop up, templates loaded."],
    ["charles", 350, "Stream test in 10 minutes."],
    ["lina", 338, "Stream test fine, 1080p60 on all outputs."],
    ["yousef", 300, "Return feed 4 has no audio, checking the patch."],
    ["yousef", 290, "Fixed, wrong patch point."],
    ["hessa", 262, "Lower thirds for the casters are approved."],
    ["charles", 220, "Everyone have earbuds? Radio is the fastest way to me."],
    ["lina", 180, "Replay B on standby."],
    ["hessa", 141, "Scoreboard graphic ready for the first match."],
    ["charles", 118, "We're live. Good job everyone."],
    ["yousef", 63, "Feeds labelled, crossed off on the board."],
    ["lina", 29, "Failover test at 17:30 if it's quiet."],
  ],
  b2: [
    ["faisal", 397, "Stage B: morning. We're short today, only Mona and me so far."],
    ["mona", 390, "Here. Starting with the cable runs."],
    ["faisal", 360, "Lighting rig is being hung, need a hand at 11:00."],
    ["mona", 344, "I'll be there."],
    ["faisal", 302, "Rig is up. Testing the cues."],
    ["mona", 266, "Downstage cables need tape before doors."],
    ["faisal", 238, "Sound check at 13:30."],
    ["mona", 205, "Sound check done, levels are good."],
    ["faisal", 170, "Asked Command for more hands for the queue tonight."],
    ["mona", 92, "Queue is already past the merch stand."],
    ["faisal", 61, "We need barriers, people are pushing at the front."],
    ["mona", 35, "Two security from C1 helping for now."],
  ],
  c1: [
    ["jamshad", 402, "Gate 3 crew, briefing at 10:45 in D1."],
    ["khalid", 394, "Here. Setting up the bag check tables."],
    ["turki", 388, "Here. Cones and signs out."],
    ["jamshad", 336, "Lanes 1–3 for bag check, lane 4 for crew and media."],
    ["khalid", 310, "Scanners charged and tested."],
    ["turki", 290, "Wheelchair access lane is marked on the left."],
    ["jamshad", 250, "Prohibited items list is on the tables. No glass, no power banks over 20,000 mAh."],
    ["khalid", 182, "First queue forming outside."],
    ["jamshad", 140, "Gates open. Steady pace, no rushing."],
    ["turki", 117, "Queue moving well, about 4 minutes each."],
    ["khalid", 85, "Lane 2 scanner is slow, restarting it."],
    ["jamshad", 62, "Ice cream spilled at the lane 3 entrance, someone get a cone."],
    ["turki", 48, "Cones out."],
    ["khalid", 14, "Big spill near the gate now, it's slippery. Reporting it."],
  ],
  c2: [
    ["dana", 399, "Merch crew, morning! Stock count at 10:30."],
    ["bandar", 391, "Here. Opening the boxes."],
    ["dana", 352, "Jerseys: S 80, M 120, L 110, XL 60."],
    ["bandar", 320, "Scarves and caps are on the wall."],
    ["dana", 290, "Card machines charged, cash float counted."],
    ["bandar", 210, "Price tags are done."],
    ["dana", 150, "First customers in, all on card so far."],
    ["bandar", 100, "Line is 15 deep, opening the second till."],
    ["dana", 64, "M jerseys going fast, 30 left."],
    ["bandar", 40, "Getting more M from storage."],
    ["dana", 25, "Someone asked for a signed jersey, sending them to the info desk."],
  ],
  d1: [
    ["waleed", 401, "Media Room: briefing is here at 10:30, chairs are out."],
    ["amal", 395, "Here. Setting up the press badges."],
    ["waleed", 345, "Wi-Fi password is on the cards on every table."],
    ["amal", 312, "Accreditation desk is open, 40 badges handed out."],
    ["waleed", 268, "Interview backdrop is up."],
    ["amal", 220, "The printer is jammed again, using the spare."],
    ["waleed", 166, "Coffee for the press is running low."],
    ["amal", 123, "92 badges handed out."],
    ["waleed", 71, "Mixed zone after the first match, 2 players."],
    ["amal", 38, "Chairs for the post-match interviews still to do."],
  ],
  d2: [
    ["nasser", 403, "VIP Lounge crew, morning. Guest list in Mind."],
    ["lulwa", 396, "Here. Setting up the qahwa station."],
    ["saud", 389, "Here. Checking the entrance."],
    ["nasser", 340, "VIP wristbands are gold today."],
    ["lulwa", 298, "Dates and qahwa at 17:00, ready to go."],
    ["saud", 255, "Gate 1 knows to send VIPs straight up."],
    ["nasser", 213, "Two guests changed to tomorrow, list updated."],
    ["lulwa", 160, "Lounge looks great."],
    ["saud", 110, "First VIP guests arrived."],
    ["nasser", 66, "Ministry delegation at 18:00, 8 people."],
    ["lulwa", 37, "Qahwa refilled."],
  ],
};

/* ---- the Ops board: one board, every task tagged with its zone ---- */

function ewcBoard(now: number): ProjectCard {
  let order = 0;
  const task = (id: string, title: string, zoneId: string, column: "todo" | "doing" | "done", priority: Task["priority"], dueMins: number, assignee: string | null): Task => ({
    id: `ewc-t-${id}`, title, column, order: ++order, assignee, due: now + dueMins * MINUTE, priority, zone: zoneId,
    createdBy: "reema", createdAt: now - 5 * HOUR, updatedAt: column === "todo" ? {} : { column: now - 30 * MINUTE },
  });
  const list: Task[] = [
    task("sound", "Sound check, casters' desk", "a1", "doing", "high", 25, "omar"),
    task("aisle", "Clear aisle 4 before doors", "a1", "todo", "medium", 40, "abdullah"),
    task("water", "Restock water at the press pit", "a1", "done", "low", -30, "ziyad"),
    task("ushers", "Brief ushers on row numbering", "a1", "todo", "medium", 60, "sara"),
    task("warmup", "Team Falcons warm-up room ready", "a2", "doing", "high", 20, "huda"),
    task("snacks", "Snack trays for 6 teams", "a2", "todo", "low", 90, "rahaf"),
    task("replay", "Replay server failover test", "b1", "todo", "high", 35, "lina"),
    task("feeds", "Label return feeds", "b1", "done", "low", -45, "yousef"),
    task("lights", "Check stage lights", "b2", "todo", "high", 15, "faisal"),
    task("cables", "Tape cable runs downstage", "b2", "todo", "medium", 30, "mona"),
    task("barrier", "Barrier line for the stage queue", "b2", "todo", "high", 20, null),
    task("bands", "Wristband check, lane 2", "c1", "doing", "high", 10, "khalid"),
    task("cones", "Cones around the wet floor", "c1", "todo", "high", 5, "turki"),
    task("bags", "Bag-check tables set", "c1", "done", "medium", -60, "jamshad"),
    task("cards", "Card machines charged", "c2", "done", "medium", -20, "dana"),
    task("jerseys", "Restock size M jerseys", "c2", "todo", "low", 120, "bandar"),
    task("badges", "Press badges at the door", "d1", "doing", "medium", 15, "amal"),
    task("chairs", "Post-match interview chairs", "d1", "todo", "low", 75, "waleed"),
    task("guests", "Guest list sync with Gate 1", "d2", "todo", "high", 25, "nasser"),
    task("qahwa", "Dates and qahwa service at 17:00", "d2", "todo", "medium", 50, "lulwa"),
  ];
  return {
    type: "project",
    name: "Ops board",
    columns: [{ id: "todo", name: "To do" }, { id: "doing", name: "Doing" }, { id: "done", name: "Done" }],
    tasks: Object.fromEntries(list.map((x) => [x.id, x])),
  };
}

/* ---- live: presence, requests, broadcasts, feed, radio ---- */

export function ewcLive(now: number): OpLive {
  const presence: Record<string, Presence> = {};
  Object.entries(ROSTER).forEach(([zoneId, ids]) => ids.forEach((u, i) => {
    presence[u] = { zoneId, since: now - (40 + i * 17) * MINUTE, via: i % 3 === 0 ? "qr" : "tap" };
  }));
  presence.tariq = { zoneId: null, since: now - 30 * MINUTE, via: "tap" };

  const requests: OpRequest[] = [
    { id: "r-b2", kind: "staff", zoneId: "b2", count: 3, note: "Doors open in 20 and the queue for Stage B is already long. Need hands for barriers and seating.", urgency: "urgent", status: "pending", by: "faisal", at: now - 6 * MINUTE, accepts: {}, chatId: Z.b2.channelId },
    { id: "r-d1", kind: "supplies", zoneId: "d1", note: "2 extension leads and a spare HDMI for the press desk.", urgency: "normal", status: "pending", by: "waleed", at: now - 3 * MINUTE, accepts: {}, chatId: Z.d1.channelId },
    { id: "r-c1", kind: "issue", zoneId: "c1", note: "Spill near Gate 3, people slipping. Need a cleaner and cones.", photo: true, urgency: "urgent", status: "pending", by: "khalid", at: now - 2 * MINUTE, accepts: {}, chatId: Z.c1.channelId },
    { id: "r-a2", kind: "supplies", zoneId: "a2", note: "Ice for the players' cooler.", urgency: "normal", status: "done", by: "rahaf", at: now - 52 * MINUTE, decidedBy: "reema", decidedAt: now - 47 * MINUTE, accepts: {}, chatId: Z.a2.channelId },
    { id: "r-d2", kind: "move", zoneId: "d2", fromZoneId: "c2", count: 1, people: ["bandar"], note: "One more pair of hands for VIP arrivals.", urgency: "normal", status: "declined", by: "nasser", at: now - 34 * MINUTE, decidedBy: "me", decidedAt: now - 25 * MINUTE, accepts: {} },
  ];

  const crew = EWC_MEMBERS.filter((u) => u !== "me" && u !== "reema");
  const acksAll = Object.fromEntries(EWC_MEMBERS.map((u, i) => [u, now - 120 * MINUTE + i * 9000]));
  const readSome: Record<string, number> = Object.fromEntries(crew.filter((_, i) => i % 3 !== 1).map((u, i) => [u, now - 18 * MINUTE + i * 20000]));
  readSome.reema = now - 20 * MINUTE;
  // Salman (muted) and Tariq (new) haven't read the latest one: try it as them.
  delete readSome.salman;
  delete readSome.tariq;
  const broadcasts: OpBroadcast[] = [
    { id: "b-gates", level: "critical", text: "Gates open at 16:00. All crews to positions.", audience: { all: true }, by: "reema", at: now - 122 * MINUTE, acks: acksAll },
    { id: "b-water", level: "normal", text: "Water stations restocked in Hall A and B. Take breaks in turns, one per zone at a time.", audience: { all: true }, by: "reema", at: now - 20 * MINUTE, acks: readSome },
  ];

  type Bare = FeedEvent extends infer E ? (E extends FeedEvent ? Omit<E, "id" | "at"> : never) : never;
  const f = (id: string, minsAgo: number, e: Bare) => ({ id, at: now - minsAgo * MINUTE, ...e }) as FeedEvent;
  // Day one, so the log has a yesterday to fold away.
  const DAY1 = 24 * 60;
  const feed: FeedEvent[] = [
    f("f-d1", DAY1 + 300, { kind: "checkin", userId: "reema", zoneId: "a1", via: "qr" }),
    f("f-d2", DAY1 + 260, { kind: "task", title: "Walk the stage barriers", zoneId: "a1", by: "ziyad" }),
    f("f-d3", DAY1 + 200, { kind: "zone", zoneId: "c1", status: "busy", by: "khalid" }),
    f("f-d4", DAY1 + 150, { kind: "move", userId: "yousef", fromZoneId: "a2", zoneId: "b1" }),
    f("f-d5", DAY1 + 90, { kind: "checkout", userId: "nasser", zoneId: "d2" }),
    f("f1", 122, { kind: "broadcast", broadcastId: "b-gates" }),
    f("f2", 52, { kind: "request", requestId: "r-a2", by: "rahaf" }),
    f("f3", 47, { kind: "decision", requestId: "r-a2", by: "reema", approved: true }),
    f("f4", 45, { kind: "task", title: "Label return feeds", zoneId: "b1", by: "yousef" }),
    f("f5", 34, { kind: "request", requestId: "r-d2", by: "nasser" }),
    f("f6", 25, { kind: "decision", requestId: "r-d2", by: "me", approved: false }),
    f("f7", 20, { kind: "broadcast", broadcastId: "b-water" }),
    f("f8", 15, { kind: "task", title: "Restock water at the press pit", zoneId: "a1", by: "ziyad" }),
    f("f9", 12, { kind: "checkin", userId: "ziyad", zoneId: "a1", via: "qr" }),
    f("f10", 9, { kind: "zone", zoneId: "b2", status: "busy", by: "faisal" }),
    f("f11", 6, { kind: "request", requestId: "r-b2", by: "faisal" }),
    f("f12", 3, { kind: "request", requestId: "r-d1", by: "waleed" }),
    f("f13", 2, { kind: "zone", zoneId: "c1", status: "issue", by: "khalid" }),
    f("f14", 2, { kind: "request", requestId: "r-c1", by: "khalid" }),
  ];

  const joined: Record<string, ChannelId> = { me: "command", reema: "command" };
  for (const u of EWC_MEMBERS) {
    if (joined[u]) continue;
    const z = presence[u]?.zoneId;
    joined[u] = z ? `zone:${z}` : `crew:${CREW_OF[u]}`;
  }
  const tx = (by: string, minsAgo: number, target: Target, text: string): Transmission =>
    ({ id: `x-${by}-${minsAgo}`, by, at: now - minsAgo * MINUTE, endedAt: now - minsAgo * MINUTE + 4000, target, text, source: "sim" });

  return {
    presence,
    zoneStatus: { a1: "busy", b2: "busy", c1: "issue" },
    requests,
    broadcasts,
    feed,
    shift: "evening",
    headcount: [
      { h: "08", value: 6 }, { h: "10", value: 14 }, { h: "12", value: 19 }, { h: "14", value: 22 }, { h: "16", value: 26 }, { h: "Now", value: 26 },
    ],
    radio: {
      joined,
      seen: { me: now - 4 * MINUTE, salman: now - 9 * MINUTE },
      tx: [
        tx("reema", 22, { all: true }, "All crews, radio check. Semi-final one starts at 18:00, doors at 16:00 as planned."),
        tx("noura", 18, { channel: "zone:a1" }, "A1, casters are live. Keep aisle four clear for the camera dolly."),
        tx("abdullah", 15, { channel: "zone:a1" }, "Copy. Aisle four is clear."),
        tx("faisal", 12, { channel: "zone:b2" }, "Stage B, we're only two. The queue is past the merch stand."),
        tx("jamshad", 9, { channel: `crew:${R.security}` }, "Security, bag check on Gate 3 is backing up. Lane two stays open."),
        tx("reema", 7, { channel: "command" }, "Leads, hold all moves after 17:45 unless it's urgent."),
        tx("noura", 6, { channel: "zone:a1" }, "We're seven in A1, we can lend people if Command asks."),
        tx("khalid", 3, { channel: "zone:c1" }, "Spill near Gate 3, people are slipping. Need cones."),
        tx("ziyad", 2, { channel: `crew:${R.runners}` }, "Runners, water run to Hall B in five. Who's free?"),
      ],
    },
  };
}

/* ---- the venue's radio chatter: someone keys up somewhere every few seconds ---- */

export const EWC_SCRIPT: { by: string; target: Target; text: string }[] = [
  { by: "faisal", target: { channel: "zone:b2" }, text: "B2, barrier line is up. Need one more on the left door." },
  { by: "mona", target: { channel: "zone:b2" }, text: "Queue's moving, about two hundred people now." },
  { by: "noura", target: { channel: "zone:a1" }, text: "A1, mic check in two minutes, everyone off the stage." },
  { by: "omar", target: { channel: "zone:a1" }, text: "Desk two is fixed, it was the cable on channel three." },
  { by: "sara", target: { channel: "zone:a1" }, text: "A1, ushers to rows K to P, the gates are opening." },
  { by: "fahad", target: { channel: "zone:a1" }, text: "Security in A1, I need one more at the camera pit barrier." },
  { by: "ziyad", target: { channel: "zone:a1" }, text: "Press pit is restocked, water and towels." },
  { by: "noura", target: { channel: "zone:a1" }, text: "Two minutes to walk-on. Lights going down, phones away." },
  { by: "jamshad", target: { channel: "zone:c1" }, text: "Gate 3, lane two is open again. Keep them moving." },
  { by: "khalid", target: { channel: "zone:c1" }, text: "Cones are out by the spill, the cleaner is on the way." },
  { by: "fahad", target: { channel: `crew:${R.security}` }, text: "Security, two of you to Gate 1, bag check backlog." },
  { by: "charles", target: { channel: `crew:${R.av}` }, text: "AV, replay server B is live. A is on standby." },
  { by: "lina", target: { channel: "zone:b1" }, text: "B1, we're on air in thirty seconds. Quiet in the studio." },
  { by: "ziyad", target: { channel: `crew:${R.runners}` }, text: "Runners, I need a hand with ice for the player lounge." },
  { by: "hessa", target: { channel: `crew:${R.runners}` }, text: "On my way from B1 with the ice, two minutes." },
  { by: "reema", target: { channel: "command" }, text: "Command, how are we on Stage B? I want it full before 17:30." },
  { by: "jamshad", target: { channel: "command" }, text: "Command, Gate 3 is clear now, back to normal flow." },
  { by: "faisal", target: { channel: "command" }, text: "Command, B2 is filling up fast. Those three people would help." },
  { by: "reema", target: { channel: "command" }, text: "Semi-final one is on time. Hold the walk-on until the casters are seated." },
  { by: "reema", target: { channel: "command" }, text: "Alae, can you check the D1 supplies? The press desk is asking again." },
  { by: "reema", target: { channel: "command" }, text: "Heads up: the Minister's party arrives at Gate 1 at 18:20. Keep the VIP lane clear." },
  { by: "reema", target: { channel: "command" }, text: "Good job on Gate 3. Let's keep two of security there until the doors close." },
  { by: "noura", target: { channel: "command" }, text: "Command, A1 is ready for walk-on. Lights in two minutes." },
  { by: "nasser", target: { channel: "command" }, text: "Command, VIP lounge is at capacity, holding new guests at the door." },
  { by: "waleed", target: { channel: "command" }, text: "Command, press conference moved to 19:15, please let the casters know." },
  { by: "nasser", target: { channel: "zone:d2" }, text: "D2, first VIP cars are at the drop-off. Dates and qahwa ready." },
  { by: "dana", target: { channel: "zone:c2" }, text: "Merch is out of size M jerseys, restocking from Hall A storage." },
  { by: "waleed", target: { channel: "zone:d1" }, text: "Media room, the press conference moves to 19:15." },
  { by: "rahaf", target: { channel: "zone:a2" }, text: "Player lounge, Team Falcons are in. Keep the corridor clear." },
];
