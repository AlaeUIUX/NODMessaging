import type { AvatarTone } from "@/lib/chat/types";
import type { RadioState } from "./radio";

/* ---------------------------------------------------------------------------
   Command: a group switched into an Operation. Zones (physical places), crews
   (roles), requests, broadcasts and an ops feed. Prototype data model, kept
   apart from the chat store so the showcase can't disturb the live app.
--------------------------------------------------------------------------- */

export type CrewId = "command" | "av" | "security" | "hospitality" | "runners";
export type ZoneStatus = "ok" | "busy" | "issue" | "closed";
export type Priority = "high" | "medium" | "low";
export type Step = "todo" | "doing" | "done";

export interface Person { id: string; name: string; tone: AvatarTone; crew: CrewId; title?: string }
export interface Crew { id: CrewId; name: string; color: string }
export interface Zone {
  id: string;
  code: string;
  name: string;
  area: string;
  target: number;
  leadId?: string;
  crews: CrewId[];
  pin: { x: number; y: number };
  status: ZoneStatus;
}
export interface Presence { zoneId: string | null; since: number; via: "tap" | "qr" | "assigned" }
export interface Task { id: string; title: string; zoneId: string; assignee?: string; priority: Priority; step: Step; due: number; doneAt?: number }
export type RequestKind = "staff" | "move" | "supplies" | "issue";
export interface OpRequest {
  id: string;
  kind: RequestKind;
  zoneId: string;
  fromZoneId?: string;
  count?: number;
  people?: string[];
  note: string;
  photo?: boolean;
  urgency: "normal" | "urgent";
  status: "pending" | "approved" | "declined" | "done";
  by: string;
  at: number;
  /** Still queued on the device (bad signal): "Sending…" until it lands. */
  sending?: boolean;
  decidedBy?: string;
  decidedAt?: number;
  accepts: Record<string, "pending" | "accepted" | "declined">;
}
export interface Audience { all?: true; crews?: CrewId[]; zones?: string[] }
export interface Broadcast { id: string; level: "normal" | "critical"; text: string; audience: Audience; by: string; at: number; acks: Record<string, number>; reminded?: number }
export type FeedEvent =
  | { id: string; at: number; kind: "checkin" | "checkout"; userId: string; zoneId: string; via?: Presence["via"] }
  | { id: string; at: number; kind: "move"; userId: string; fromZoneId: string | null; zoneId: string }
  | { id: string; at: number; kind: "request"; requestId: string; by: string }
  | { id: string; at: number; kind: "decision"; requestId: string; by: string; approved: boolean }
  | { id: string; at: number; kind: "broadcast"; broadcastId: string }
  | { id: string; at: number; kind: "remind"; broadcastId: string; by: string; count: number }
  | { id: string; at: number; kind: "task"; taskId: string; by: string }
  | { id: string; at: number; kind: "zone"; zoneId: string; status: ZoneStatus; by: string };
export interface ChatMsg { id: string; zoneId: string; by: string; at: number; text?: string; requestId?: string }

export interface OpState {
  version: 2;
  name: string;
  venue: string;
  day: number;
  days: number;
  shift: "morning" | "evening";
  zones: Zone[];
  presence: Record<string, Presence>;
  tasks: Task[];
  requests: OpRequest[];
  broadcasts: Broadcast[];
  feed: FeedEvent[];
  chat: ChatMsg[];
  /** Who has the Operation muted (critical broadcasts still break through). */
  muted: Record<string, boolean>;
  /** Headcount on site through the day, for the trend. */
  headcount: { h: string; value: number }[];
  /** Push-to-talk channels and their transcripts. */
  radio: RadioState;
}

export const CREWS: Crew[] = [
  { id: "command", name: "Command", color: "#1C1917" },
  { id: "av", name: "AV & Broadcast", color: "#2563EB" },
  { id: "security", name: "Security", color: "#0D9488" },
  { id: "hospitality", name: "Hospitality", color: "#7C3AED" },
  { id: "runners", name: "Runners", color: "#C2410C" },
];
export const crewOf = (id: CrewId) => CREWS.find((c) => c.id === id)!;

export const PEOPLE: Person[] = [
  { id: "me", name: "Alae", tone: "graphite", crew: "command", title: "Admin · Command" },
  { id: "reema", name: "Rima", tone: "clay", crew: "command", title: "Operation lead" },
  { id: "noura", name: "Noura Al-Qahtani", tone: "denim", crew: "av", title: "A1 lead" },
  { id: "omar", name: "Omar Haddad", tone: "ochre", crew: "av" },
  { id: "salman", name: "Salman", tone: "plum", crew: "runners" },
  { id: "abdullah", name: "Abdullah Al-Malki", tone: "sage", crew: "runners" },
  { id: "ziyad", name: "Ziyad Al-Omari", tone: "clay", crew: "runners" },
  { id: "fahad", name: "Fahad Al-Otaibi", tone: "graphite", crew: "security" },
  { id: "sara", name: "Sara Al-Mutairi", tone: "plum", crew: "hospitality" },
  { id: "reem", name: "Reem Al-Ghamdi", tone: "ochre", crew: "hospitality", title: "A2 lead" },
  { id: "huda", name: "Huda Al-Anazi", tone: "sage", crew: "hospitality" },
  { id: "majed", name: "Majed Al-Zahrani", tone: "denim", crew: "security" },
  { id: "charles", name: "Charles", tone: "denim", crew: "av", title: "B1 lead" },
  { id: "lina", name: "Lina Farouk", tone: "clay", crew: "av" },
  { id: "yousef", name: "Yousef Al-Harbi", tone: "graphite", crew: "av" },
  { id: "hessa", name: "Hessa Al-Fayez", tone: "ochre", crew: "runners" },
  { id: "faisal", name: "Faisal Al-Shammari", tone: "sage", crew: "av", title: "B2 lead" },
  { id: "mona", name: "Mona Al-Harthi", tone: "plum", crew: "runners" },
  { id: "jamshad", name: "Jamshad", tone: "sage", crew: "security", title: "C1 lead" },
  { id: "khalid", name: "Khalid Al-Shehri", tone: "denim", crew: "security" },
  { id: "turki", name: "Turki Al-Dosari", tone: "clay", crew: "security" },
  { id: "dana", name: "Dana Al-Subaie", tone: "ochre", crew: "hospitality", title: "C2 lead" },
  { id: "bandar", name: "Bandar Al-Juhani", tone: "graphite", crew: "runners" },
  { id: "waleed", name: "Waleed Al-Saud", tone: "plum", crew: "av", title: "D1 lead" },
  { id: "amal", name: "Amal Al-Dosari", tone: "sage", crew: "hospitality" },
  { id: "nasser", name: "Nasser Al-Rashid", tone: "denim", crew: "hospitality", title: "D2 lead" },
  { id: "lulwa", name: "Lulwa Al-Saleh", tone: "clay", crew: "hospitality" },
  { id: "saud", name: "Saud Al-Ghamdi", tone: "ochre", crew: "security" },
  { id: "tariq", name: "Tariq Al-Amri", tone: "graphite", crew: "runners" },
];
const byId = new Map(PEOPLE.map((p) => [p.id, p]));
export const person = (id: string) => byId.get(id) ?? { id, name: id, tone: "graphite" as AvatarTone, crew: "runners" as CrewId };
export const firstName = (id: string) => person(id).name.split(" ")[0];
export const glyph = (name: string) => {
  const w = name.split(/\s+/).filter((x) => /^\p{L}/u.test(x));
  return w.length > 1 ? (w[0][0] + w[w.length - 1][0]).toUpperCase() : (w[0]?.[0] ?? "").toUpperCase();
};

export const ZONES: Zone[] = [
  { id: "a1", code: "A1", name: "Main Arena", area: "Hall A", target: 5, leadId: "noura", crews: ["av", "runners", "security"], pin: { x: 0.17, y: 0.3 }, status: "busy" },
  { id: "a2", code: "A2", name: "Player Lounge", area: "Hall A", target: 3, leadId: "reem", crews: ["hospitality", "security"], pin: { x: 0.26, y: 0.6 }, status: "ok" },
  { id: "b1", code: "B1", name: "Broadcast Studio", area: "Hall B", target: 4, leadId: "charles", crews: ["av", "runners"], pin: { x: 0.45, y: 0.26 }, status: "ok" },
  { id: "b2", code: "B2", name: "Stage B", area: "Hall B", target: 5, leadId: "faisal", crews: ["av", "runners"], pin: { x: 0.57, y: 0.56 }, status: "busy" },
  { id: "c1", code: "C1", name: "Gate 3 · Entrance", area: "Outdoor", target: 4, leadId: "jamshad", crews: ["security"], pin: { x: 0.86, y: 0.78 }, status: "issue" },
  { id: "c2", code: "C2", name: "Merch Store", area: "Outdoor", target: 2, leadId: "dana", crews: ["hospitality", "runners"], pin: { x: 0.86, y: 0.3 }, status: "ok" },
  { id: "d1", code: "D1", name: "Media Room", area: "Level 2", target: 3, leadId: "waleed", crews: ["av", "hospitality"], pin: { x: 0.18, y: 0.86 }, status: "ok" },
  { id: "d2", code: "D2", name: "VIP Lounge", area: "Level 2", target: 3, leadId: "nasser", crews: ["hospitality", "security"], pin: { x: 0.5, y: 0.86 }, status: "ok" },
];

const ROSTER: Record<string, string[]> = {
  a1: ["noura", "omar", "salman", "abdullah", "ziyad", "fahad", "sara"],
  a2: ["reem", "huda", "majed"],
  b1: ["charles", "lina", "yousef", "hessa"],
  b2: ["faisal", "mona"],
  c1: ["jamshad", "khalid", "turki"],
  c2: ["dana", "bandar"],
  d1: ["waleed", "amal"],
  d2: ["nasser", "lulwa", "saud"],
};

export const SHIFTS = { morning: "Morning · 08–16", evening: "Evening · 16–24" } as const;

let n = 0;
export const id = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const MIN = 60_000;

export function seed(now: number): Omit<OpState, "radio"> {
  const presence: Record<string, Presence> = {};
  Object.entries(ROSTER).forEach(([zoneId, ids]) => ids.forEach((u, i) => {
    presence[u] = { zoneId, since: now - (40 + i * 17) * MIN, via: i % 3 === 0 ? "qr" : "tap" };
  }));
  presence.tariq = { zoneId: null, since: now - 30 * MIN, via: "tap" };

  const t = (title: string, zoneId: string, priority: Priority, step: Step, dueMin: number, assignee?: string): Task =>
    ({ id: `t-${title.slice(0, 12).replace(/\W/g, "")}-${zoneId}`, title, zoneId, priority, step, due: now + dueMin * MIN, assignee, doneAt: step === "done" ? now - 15 * MIN : undefined });
  const tasks: Task[] = [
    t("Sound check, casters' desk", "a1", "high", "doing", 25, "omar"),
    t("Clear aisle 4 before doors", "a1", "medium", "todo", 40, "abdullah"),
    t("Restock water at the press pit", "a1", "low", "done", -30, "ziyad"),
    t("Brief ushers on row numbering", "a1", "medium", "todo", 60, "sara"),
    t("Team Falcons warm-up room ready", "a2", "high", "doing", 20, "huda"),
    t("Snack trays for 6 teams", "a2", "low", "todo", 90, "reem"),
    t("Replay server failover test", "b1", "high", "todo", 35, "lina"),
    t("Label return feeds", "b1", "low", "done", -45, "yousef"),
    t("Check stage lights", "b2", "high", "todo", 15, "faisal"),
    t("Tape cable runs downstage", "b2", "medium", "todo", 30, "mona"),
    t("Barrier line for the stage queue", "b2", "high", "todo", 20),
    t("Wristband check, lane 2", "c1", "high", "doing", 10, "khalid"),
    t("Cones around the wet floor", "c1", "high", "todo", 5, "turki"),
    t("Bag-check tables set", "c1", "medium", "done", -60, "jamshad"),
    t("Card machines charged", "c2", "medium", "done", -20, "dana"),
    t("Restock size M jerseys", "c2", "low", "todo", 120, "bandar"),
    t("Press badges at the door", "d1", "medium", "doing", 15, "amal"),
    t("Post-match interview chairs", "d1", "low", "todo", 75, "waleed"),
    t("Guest list sync with Gate 1", "d2", "high", "todo", 25, "nasser"),
    t("Dates and qahwa service at 17:00", "d2", "medium", "todo", 50, "lulwa"),
  ];

  const requests: OpRequest[] = [
    { id: "r-b2", kind: "staff", zoneId: "b2", count: 3, note: "Doors open in 20 and the queue for Stage B is already long. Need hands for barriers and seating.", urgency: "urgent", status: "pending", by: "faisal", at: now - 6 * MIN, accepts: {} },
    { id: "r-d1", kind: "supplies", zoneId: "d1", note: "2 extension leads and a spare HDMI for the press desk.", urgency: "normal", status: "pending", by: "waleed", at: now - 3 * MIN, accepts: {} },
    { id: "r-c1", kind: "issue", zoneId: "c1", note: "Spill near Gate 3, people slipping. Need a cleaner and cones.", photo: true, urgency: "urgent", status: "pending", by: "khalid", at: now - 2 * MIN, accepts: {} },
    { id: "r-a2", kind: "supplies", zoneId: "a2", note: "Ice for the players' cooler.", urgency: "normal", status: "done", by: "reem", at: now - 52 * MIN, decidedBy: "reema", decidedAt: now - 47 * MIN, accepts: {} },
    { id: "r-d2", kind: "move", zoneId: "d2", fromZoneId: "c2", count: 1, people: ["bandar"], note: "One more pair of hands for VIP arrivals.", urgency: "normal", status: "declined", by: "nasser", at: now - 34 * MIN, decidedBy: "me", decidedAt: now - 25 * MIN, accepts: {} },
  ];

  const everyone = PEOPLE.map((p) => p.id);
  const acksAll = Object.fromEntries(everyone.map((u, i) => [u, now - 120 * MIN + i * 9000]));
  const crew = everyone.filter((u) => u !== "me" && u !== "reema");
  const readSome = Object.fromEntries(crew.filter((_, i) => i % 3 !== 1).map((u, i) => [u, now - 18 * MIN + i * 20000]));
  readSome.reema = now - 20 * MIN;
  const broadcasts: Broadcast[] = [
    { id: "b-gates", level: "critical", text: "Gates open at 16:00. All crews to positions.", audience: { all: true }, by: "reema", at: now - 122 * MIN, acks: acksAll },
    { id: "b-water", level: "normal", text: "Water stations restocked in Hall A and B. Take breaks in turns, one per zone at a time.", audience: { all: true }, by: "reema", at: now - 20 * MIN, acks: readSome },
  ];

  const feed: FeedEvent[] = [
    { id: "f1", at: now - 122 * MIN, kind: "broadcast", broadcastId: "b-gates" },
    { id: "f2", at: now - 52 * MIN, kind: "request", requestId: "r-a2", by: "reem" },
    { id: "f3", at: now - 47 * MIN, kind: "decision", requestId: "r-a2", by: "reema", approved: true },
    { id: "f4", at: now - 45 * MIN, kind: "task", taskId: "t-Labelreturn-b1", by: "yousef" },
    { id: "f5", at: now - 34 * MIN, kind: "request", requestId: "r-d2", by: "nasser" },
    { id: "f6", at: now - 25 * MIN, kind: "decision", requestId: "r-d2", by: "me", approved: false },
    { id: "f7", at: now - 20 * MIN, kind: "broadcast", broadcastId: "b-water" },
    { id: "f8", at: now - 15 * MIN, kind: "task", taskId: "t-Restockwate-a1", by: "ziyad" },
    { id: "f9", at: now - 12 * MIN, kind: "checkin", userId: "ziyad", zoneId: "a1", via: "qr" },
    { id: "f10", at: now - 9 * MIN, kind: "zone", zoneId: "b2", status: "busy", by: "faisal" },
    { id: "f11", at: now - 6 * MIN, kind: "request", requestId: "r-b2", by: "faisal" },
    { id: "f12", at: now - 3 * MIN, kind: "request", requestId: "r-d1", by: "waleed" },
    { id: "f13", at: now - 2 * MIN, kind: "zone", zoneId: "c1", status: "issue", by: "khalid" },
    { id: "f14", at: now - 2 * MIN, kind: "request", requestId: "r-c1", by: "khalid" },
  ];

  const m = (zoneId: string, by: string, ago: number, text?: string, requestId?: string): ChatMsg =>
    ({ id: `m-${zoneId}-${ago}-${by}`, zoneId, by, at: now - ago * MIN, text, requestId });
  const chat: ChatMsg[] = [
    m("general", "reema", 95, "Welcome to Day 2 everyone. Run sheet is pinned in Mind."),
    m("general", "charles", 70, "Broadcast truck is online, feeds look clean."),
    m("general", "jamshad", 41, "Reminder: wristbands are checked at every hall door today."),
    m("general", "reema", 16, "Great work on the morning shift. Evening crews, Radio is on, keep your earbuds in."),
    m("general", "sara", 5, "Lost and found is at the info desk by Gate 1."),
    m("a1", "noura", 48, "Casters are in. Mic check at 15:40."),
    m("a1", "omar", 44, "Desk 2 has a buzz on channel 3, swapping the cable."),
    m("a1", "ziyad", 12, "Checked in. Taking the press pit."),
    m("a1", "noura", 8, "We're 7 here and only need 5 now, happy to lend people."),
    m("b2", "faisal", 14, "Stage B lighting rig is up. Still only two of us."),
    m("b2", "mona", 10, "Queue is past the merch stand already."),
    m("b2", "faisal", 6, undefined, "r-b2"),
    m("c1", "jamshad", 30, "Bag check running on lanes 1–3."),
    m("c1", "khalid", 2, undefined, "r-c1"),
    m("d1", "waleed", 3, undefined, "r-d1"),
    m("a2", "reem", 52, undefined, "r-a2"),
    m("b1", "charles", 40, "Replay server B is the backup today."),
    m("d2", "nasser", 22, "First VIP cars at 16:30."),
    m("c2", "dana", 18, "Jerseys selling fast, M is nearly out."),
  ];

  const headcount = [
    { h: "08", value: 6 }, { h: "10", value: 14 }, { h: "12", value: 19 }, { h: "14", value: 22 },
    { h: "16", value: 26 }, { h: "Now", value: 26 },
  ];

  return {
    version: 2,
    name: "EWC 2026 · Riyadh",
    venue: "Boulevard Riyadh City",
    day: 2,
    days: 3,
    shift: "evening",
    zones: ZONES.map((z) => ({ ...z })),
    presence,
    tasks,
    requests,
    broadcasts,
    feed,
    chat,
    muted: { salman: true },
    headcount,
  };
}

/* ---- derived ---- */

export const here = (s: OpState, zoneId: string) => Object.entries(s.presence).filter(([, p]) => p.zoneId === zoneId).map(([u]) => u);
export const onSite = (s: OpState) => Object.values(s.presence).filter((p) => p.zoneId).length;
export const zoneOf = (s: OpState, zoneId?: string | null) => s.zones.find((z) => z.id === zoneId);
export const zoneLabel = (s: OpState, zoneId?: string | null) => { const z = zoneOf(s, zoneId); return z ? `${z.code} · ${z.name}` : "—"; };
export const pendingRequests = (s: OpState) => s.requests.filter((r) => r.status === "pending");
export const openRequestsIn = (s: OpState, zoneId: string) => s.requests.filter((r) => r.zoneId === zoneId && (r.status === "pending" || r.status === "approved"));
export const openTasksIn = (s: OpState, zoneId: string) => s.tasks.filter((t) => t.zoneId === zoneId && t.step !== "done");

export type Staffing = "ok" | "short" | "critical" | "over";
export function staffing(s: OpState, z: Zone): { n: number; target: number; level: Staffing } {
  const n = here(s, z.id).length;
  const level: Staffing = n >= z.target + 2 ? "over" : n >= z.target ? "ok" : n / z.target >= 0.7 ? "short" : "critical";
  return { n, target: z.target, level };
}

/** Understaffed first, then issues, then pending requests: what needs Command now. */
export function attentionScore(s: OpState, z: Zone) {
  const st = staffing(s, z);
  const gap = Math.max(0, st.target - st.n) / st.target;
  return gap * 10 + (z.status === "issue" ? 5 : 0) + openRequestsIn(s, z.id).filter((r) => r.status === "pending").length * 2;
}

export const canCommand = (u: string) => person(u).crew === "command";
export const leadOf = (s: OpState, u: string) => s.zones.find((z) => z.leadId === u);
/** Command decides anything; a zone lead decides inside their own zone (supplies, issues), never moves between zones. */
export const canDecide = (s: OpState, u: string, r: OpRequest) =>
  canCommand(u) || (zoneOf(s, r.zoneId)?.leadId === u && (r.kind === "supplies" || r.kind === "issue"));

export function audienceOf(s: OpState, a: Audience): string[] {
  if (a.all) return PEOPLE.map((p) => p.id);
  return PEOPLE.filter((p) =>
    (a.crews ?? []).includes(p.crew) || (a.zones ?? []).includes(s.presence[p.id]?.zoneId ?? "") || p.crew === "command",
  ).map((p) => p.id);
}

/**
 * People to send to a short zone: checked in, from the zones that can spare
 * them most (most over target first), the right crew, then the same area.
 */
export function suggestions(s: OpState, zoneId: string) {
  const target = zoneOf(s, zoneId)!;
  return PEOPLE.filter((p) => p.crew !== "command" && s.presence[p.id]?.zoneId && s.presence[p.id].zoneId !== zoneId && s.zones.every((z) => z.leadId !== p.id))
    .map((p) => {
      const from = zoneOf(s, s.presence[p.id].zoneId)!;
      const st = staffing(s, from);
      const spare = st.n - st.target;
      const crewFit = target.crews.includes(p.crew);
      const near = from.area === target.area;
      const score = spare * 10 + (crewFit ? 6 : 0) + (near ? 3 : 0);
      const why = [spare > 0 ? `${from.code} is ${st.n}/${st.target}` : null, crewFit ? "Right crew" : null, near ? "Same hall" : null].filter(Boolean).join(" · ");
      return { p, from, spare, score, why: why || `${from.code} · ${st.n}/${st.target}` };
    })
    .sort((a, b) => b.score - a.score);
}

export const KIND_LABEL: Record<RequestKind, string> = { staff: "Need people", move: "Move", supplies: "Supplies", issue: "Issue" };
export const STATUS_LABEL: Record<ZoneStatus, string> = { ok: "OK", busy: "Busy", issue: "Issue", closed: "Closed" };
export const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };
export const STEP_LABEL: Record<Step, string> = { todo: "To do", doing: "Doing", done: "Done" };

export function ago(ms: number) {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
}
export function clock(at: number) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export const agoText = (ms: number) => (ms < 60_000 ? "just now" : `${ago(ms)} ago`);
