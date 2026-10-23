import {
  ADMIN, can, channelName, groupInfo, isAdmin, newChannelId, newRoleId, rolesOf, ROLE_TONES, upsertChannel, upsertRole,
} from "./groups";
import type { AvatarTone, Chat, GroupInfo, OperationInfo, OperationLink, OperationZone } from "./types";

/**
 * Operations: a group switched into running a live event. Its setup (zones,
 * crews, Command, crew links) lives on the group (GroupInfo.operation) and
 * syncs like any group edit. Crews are roles, zones are channels, Command is a
 * role with the Operation permissions, so channels, roles, permissions and
 * invites all keep working.
 *
 * What happens live (who is where, requests, broadcasts, the radio) changes
 * by the second, so it is kept apart in lib/chat/opstore.ts and changed only
 * through the actions reduced here. Everything in this file is pure.
 */

/* ---------------------------------------------------------------------------
   Live state
--------------------------------------------------------------------------- */

export type ZoneStatus = "ok" | "busy" | "issue" | "closed";
export interface Presence { zoneId: string | null; since: number; via: "tap" | "qr" | "assigned" | "link" }

export type RequestKind = "staff" | "move" | "supplies" | "issue";
export interface OpRequest {
  id: string;
  kind: RequestKind;
  /** Where it's needed. */
  zoneId: string;
  /** Moves: where the people come from. */
  fromZoneId?: string;
  /** Staff: how many people. */
  count?: number;
  /** Moves (and staff once approved): who goes. */
  people?: string[];
  note: string;
  photo?: boolean;
  urgency: "normal" | "urgent";
  status: "pending" | "approved" | "declined" | "done";
  by: string;
  at: number;
  /** Still queued on the phone (bad venue signal): "Sending…" until it lands. */
  sending?: boolean;
  decidedBy?: string;
  decidedAt?: number;
  /** Each moved person's answer. */
  accepts: Record<string, "pending" | "accepted" | "declined">;
  /** The chat its card was posted in (a zone channel). */
  chatId?: string;
}

/** Who a broadcast or a radio call reaches: everyone, roles (crews) or zones (whoever is there). */
export interface Audience { all?: true; roles?: string[]; zones?: string[] }
export interface OpBroadcast {
  id: string;
  level: "normal" | "critical";
  text: string;
  audience: Audience;
  by: string;
  at: number;
  /** userId -> when they tapped Got it. */
  acks: Record<string, number>;
  reminded?: number;
}

export type FeedEvent =
  | { id: string; at: number; kind: "checkin" | "checkout"; userId: string; zoneId: string; via?: Presence["via"] }
  | { id: string; at: number; kind: "move"; userId: string; fromZoneId: string | null; zoneId: string }
  | { id: string; at: number; kind: "request"; requestId: string; by: string }
  | { id: string; at: number; kind: "decision"; requestId: string; by: string; approved: boolean }
  | { id: string; at: number; kind: "broadcast"; broadcastId: string }
  | { id: string; at: number; kind: "remind"; broadcastId: string; by: string; count: number }
  | { id: string; at: number; kind: "task"; title: string; zoneId?: string | null; by: string }
  | { id: string; at: number; kind: "zone"; zoneId: string; status: ZoneStatus; by: string }
  /** `day` is the day it was done on: "finished Day 2", "went back from Day 2". */
  | { id: string; at: number; kind: "day"; step: DayStep; day: number; to: number; by: string };

export type DayStep = "finish" | "pause" | "resume" | "back";
/**
 * Where the Operation is in its days, once someone has run one by hand. Until
 * then the day follows the calendar. Paused: nothing is simulated and the day
 * says so everywhere. Done: the last day was finished.
 */
export interface DayState { n: number; state: "on" | "paused" | "done"; at: number; by: string }

/** "all" | "command" | "crew:<roleId>" | "zone:<zoneId>" */
export type ChannelId = string;
/** Where a radio call is keyed: a channel, zones, roles, or everyone. */
export interface Target { channel?: ChannelId; zones?: string[]; roles?: string[]; all?: true }
export interface Transmission {
  id: string;
  by: string;
  at: number;
  target: Target;
  text: string;
  /** On air: the words arrive as they're spoken. */
  live?: boolean;
  endedAt?: number;
  /** "voice": dictated from the mic. "sample": the mic couldn't be heard. "sim": a simulated person. */
  source?: "voice" | "sample" | "sim";
}
export interface RadioState {
  tx: Transmission[];
  /** One channel per person, like the one knob on a walkie. */
  joined: Record<string, ChannelId>;
  /** When each person last looked at the radio, for "missed". */
  seen: Record<string, number>;
}

export interface OpLive {
  presence: Record<string, Presence>;
  zoneStatus: Record<string, ZoneStatus>;
  requests: OpRequest[];
  broadcasts: OpBroadcast[];
  feed: FeedEvent[];
  radio: RadioState;
  /** OperationShift.id on now. */
  shift: string;
  /** People on site through the day, for the Day report. */
  headcount: { h: string; value: number }[];
  /** Set once Command finishes, pauses or rewinds a day; absent, the calendar decides. */
  day?: DayState;
}

export const emptyLive = (shift = "evening"): OpLive => ({
  presence: {}, zoneStatus: {}, requests: [], broadcasts: [], feed: [], radio: { tx: [], joined: {}, seen: {} }, shift, headcount: [],
});

/* ---------------------------------------------------------------------------
   Live actions. The caller stamps ids and times (in an event handler), so the
   reducer stays pure and every tab that applies an action gets the same
   result. Actions are idempotent: applying one twice changes nothing.
--------------------------------------------------------------------------- */

export type OpAction =
  | { t: "init"; live: OpLive }
  | { t: "checkIn"; userId: string; zoneId: string | null; via: Presence["via"]; at: number; feedId: string }
  | { t: "request.add"; request: OpRequest; feedId: string }
  | { t: "request.landed"; id: string }
  | { t: "request.decide"; id: string; approve: boolean; by: string; people?: string[]; at: number; feedId: string }
  | { t: "request.answer"; id: string; userId: string; accept: boolean; at: number; feedId: string }
  | { t: "request.done"; id: string; by: string; at: number }
  | { t: "zone.status"; zoneId: string; status: ZoneStatus; by: string; at: number; feedId: string }
  /** A zone was deleted: its open requests close, whoever was there is checked out. */
  | { t: "zone.removed"; zoneId: string; by: string; at: number }
  | { t: "broadcast.add"; broadcast: OpBroadcast; feedId: string }
  | { t: "broadcast.ack"; id: string; userId: string; at: number }
  | { t: "broadcast.remind"; id: string; by: string; at: number; count: number; feedId: string }
  | { t: "radio.tune"; userId: string; channel: ChannelId }
  | { t: "radio.seen"; userId: string; at: number }
  | { t: "radio.key"; tx: Transmission }
  | { t: "radio.words"; id: string; text: string }
  | { t: "radio.release"; id: string; text: string; at: number; source?: Transmission["source"] }
  | { t: "shift"; shift: string }
  | { t: "day"; step: DayStep; day: DayState; feedId: string }
  | { t: "feed"; event: FeedEvent };

const FEED_CAP = 300;
const TX_CAP = 200;
const pushFeed = (live: OpLive, e: FeedEvent): FeedEvent[] => (live.feed.some((x) => x.id === e.id) ? live.feed : [...live.feed, e].slice(-FEED_CAP));
const mapReq = (live: OpLive, id: string, fn: (r: OpRequest) => OpRequest) => ({ ...live, requests: live.requests.map((r) => (r.id === id ? fn(r) : r)) });

/**
 * Someone tuned to their zone's channel follows them to the next zone.
 * Nobody tuned yet stays untuned: joinedChannel() already puts crew on the
 * zone they're in, and keeps Command on Command.
 */
function follow(live: OpLive, userId: string, from: string | null, to: string | null): RadioState {
  const j = live.radio.joined[userId];
  // Tuned to the zone they left (or to a zone while checked in nowhere, after Leave): follow them.
  const onZone = !!j && j.startsWith("zone:") && (from ? j === `zone:${from}` : true);
  if (!to || !onZone || j === `zone:${to}`) return live.radio;
  return { ...live.radio, joined: { ...live.radio.joined, [userId]: `zone:${to}` } };
}

/** A call still marked live this long after it began was dropped (its tab closed mid-call): treat it as over. */
export const DROPPED_MS = 2 * 60_000;
export const isOnAir = (t: Pick<Transmission, "live" | "at">, now: number) => !!t.live && now - t.at < DROPPED_MS;

export function reduceOp(live: OpLive | undefined, a: OpAction): OpLive | undefined {
  if (a.t === "init") return live ?? a.live;
  if (!live) return live;
  switch (a.t) {
    case "checkIn": {
      const prev = live.presence[a.userId]?.zoneId ?? null;
      if (prev === a.zoneId) return live;
      const e: FeedEvent | null = a.zoneId
        ? prev ? { id: a.feedId, at: a.at, kind: "move", userId: a.userId, fromZoneId: prev, zoneId: a.zoneId }
          : { id: a.feedId, at: a.at, kind: "checkin", userId: a.userId, zoneId: a.zoneId, via: a.via }
        : prev ? { id: a.feedId, at: a.at, kind: "checkout", userId: a.userId, zoneId: prev } : null;
      return {
        ...live,
        presence: { ...live.presence, [a.userId]: { zoneId: a.zoneId, since: a.at, via: a.via } },
        radio: follow(live, a.userId, prev, a.zoneId),
        feed: e ? pushFeed(live, e) : live.feed,
      };
    }
    case "request.add":
      if (live.requests.some((r) => r.id === a.request.id)) return live;
      return {
        ...live,
        requests: [...live.requests, a.request],
        feed: pushFeed(live, { id: a.feedId, at: a.request.at, kind: "request", requestId: a.request.id, by: a.request.by }),
        // An issue puts a calm zone under pressure.
        zoneStatus: a.request.kind === "issue" && (live.zoneStatus[a.request.zoneId] ?? "ok") === "ok"
          ? { ...live.zoneStatus, [a.request.zoneId]: "busy" } : live.zoneStatus,
      };
    case "request.landed":
      return mapReq(live, a.id, (r) => (r.sending ? { ...r, sending: false } : r));
    case "request.decide": {
      const r = live.requests.find((x) => x.id === a.id);
      if (!r || r.status !== "pending") return live;
      const moves = a.approve && (r.kind === "staff" || r.kind === "move");
      const who = moves ? (a.people ?? r.people ?? []) : [];
      return {
        ...mapReq(live, a.id, (x) => ({
          ...x,
          status: a.approve ? "approved" : "declined",
          decidedBy: a.by,
          decidedAt: a.at,
          people: who.length ? who : x.people,
          accepts: Object.fromEntries(who.map((u) => [u, "pending" as const])),
        })),
        feed: pushFeed(live, { id: a.feedId, at: a.at, kind: "decision", requestId: a.id, by: a.by, approved: a.approve }),
      };
    }
    case "request.answer": {
      const r = live.requests.find((x) => x.id === a.id);
      if (!r || r.accepts[a.userId] !== "pending") return live;
      const accepts = { ...r.accepts, [a.userId]: a.accept ? ("accepted" as const) : ("declined" as const) };
      const allIn = Object.values(accepts).every((x) => x !== "pending");
      let next: OpLive = mapReq(live, a.id, (x) => ({ ...x, accepts, status: allIn ? "done" : x.status }));
      if (a.accept) {
        const prev = live.presence[a.userId]?.zoneId ?? null;
        next = {
          ...next,
          presence: { ...next.presence, [a.userId]: { zoneId: r.zoneId, since: a.at, via: "assigned" } },
          radio: follow(next, a.userId, prev, r.zoneId),
          feed: pushFeed(next, { id: a.feedId, at: a.at, kind: "move", userId: a.userId, fromZoneId: prev, zoneId: r.zoneId }),
        };
      }
      return next;
    }
    case "request.done": {
      const r = live.requests.find((x) => x.id === a.id);
      if (!r || r.status === "done" || r.status === "declined") return live;
      return mapReq(live, a.id, (x) => ({ ...x, status: "done", decidedBy: x.decidedBy ?? a.by, decidedAt: x.decidedAt ?? a.at }));
    }
    case "zone.status":
      if ((live.zoneStatus[a.zoneId] ?? "ok") === a.status) return live;
      return {
        ...live,
        zoneStatus: { ...live.zoneStatus, [a.zoneId]: a.status },
        feed: pushFeed(live, { id: a.feedId, at: a.at, kind: "zone", zoneId: a.zoneId, status: a.status, by: a.by }),
      };
    case "zone.removed": {
      const open = live.requests.some((r) => r.zoneId === a.zoneId && (r.status === "pending" || r.status === "approved"));
      const there = Object.values(live.presence).some((p) => p.zoneId === a.zoneId);
      if (!open && !there && !(a.zoneId in live.zoneStatus)) return live;
      const zoneStatus = { ...live.zoneStatus };
      delete zoneStatus[a.zoneId];
      return {
        ...live,
        zoneStatus,
        requests: live.requests.map((r) => (r.zoneId !== a.zoneId || (r.status !== "pending" && r.status !== "approved") ? r : {
          ...r,
          status: "declined",
          decidedBy: r.decidedBy ?? a.by,
          decidedAt: r.decidedAt ?? a.at,
          accepts: Object.fromEntries(Object.entries(r.accepts).map(([u, v]) => [u, v === "pending" ? "declined" : v])),
        })),
        presence: Object.fromEntries(Object.entries(live.presence).map(([u, p]) => [u, p.zoneId === a.zoneId ? { zoneId: null, since: a.at, via: p.via } : p])),
      };
    }
    case "broadcast.add":
      if (live.broadcasts.some((b) => b.id === a.broadcast.id)) return live;
      return {
        ...live,
        broadcasts: [...live.broadcasts, a.broadcast],
        feed: pushFeed(live, { id: a.feedId, at: a.broadcast.at, kind: "broadcast", broadcastId: a.broadcast.id }),
      };
    case "broadcast.ack": {
      const b = live.broadcasts.find((x) => x.id === a.id);
      if (!b || b.acks[a.userId]) return live;
      return { ...live, broadcasts: live.broadcasts.map((x) => (x.id === a.id ? { ...x, acks: { ...x.acks, [a.userId]: a.at } } : x)) };
    }
    case "broadcast.remind":
      if (live.feed.some((e) => e.id === a.feedId)) return live;
      return {
        ...live,
        broadcasts: live.broadcasts.map((x) => (x.id === a.id ? { ...x, reminded: a.at } : x)),
        feed: pushFeed(live, { id: a.feedId, at: a.at, kind: "remind", broadcastId: a.id, by: a.by, count: a.count }),
      };
    case "radio.tune":
      if (live.radio.joined[a.userId] === a.channel) return live;
      return { ...live, radio: { ...live.radio, joined: { ...live.radio.joined, [a.userId]: a.channel } } };
    case "radio.seen":
      if ((live.radio.seen[a.userId] ?? 0) >= a.at) return live;
      return { ...live, radio: { ...live.radio, seen: { ...live.radio.seen, [a.userId]: a.at } } };
    case "radio.key":
      if (live.radio.tx.some((t) => t.id === a.tx.id)) return live;
      return { ...live, radio: { ...live.radio, tx: [...live.radio.tx, a.tx].slice(-TX_CAP) } };
    case "radio.words": {
      const t = live.radio.tx.find((x) => x.id === a.id);
      if (!t || !t.live || t.text === a.text) return live;
      return { ...live, radio: { ...live.radio, tx: live.radio.tx.map((x) => (x.id === a.id ? { ...x, text: a.text } : x)) } };
    }
    case "radio.release": {
      const t = live.radio.tx.find((x) => x.id === a.id);
      if (!t || !t.live) return live;
      const text = a.text.trim();
      // Keyed and let go without a word: nothing went out.
      const tx = text
        ? live.radio.tx.map((x) => (x.id === a.id ? { ...x, text, live: false, endedAt: a.at, source: a.source ?? x.source } : x))
        : live.radio.tx.filter((x) => x.id !== a.id);
      return { ...live, radio: { ...live.radio, tx } };
    }
    case "shift":
      return live.shift === a.shift ? live : { ...live, shift: a.shift };
    case "day": {
      if (live.feed.some((e) => e.id === a.feedId)) return live;
      const was = live.day?.n ?? a.day.n;
      return { ...live, day: a.day, feed: pushFeed(live, { id: a.feedId, at: a.day.at, kind: "day", step: a.step, day: was, to: a.day.n, by: a.day.by }) };
    }
    case "feed":
      return live.feed.some((e) => e.id === a.event.id) ? live : { ...live, feed: pushFeed(live, a.event) };
  }
}

/* ---------------------------------------------------------------------------
   Templates: zones and crews for a kind of venue
--------------------------------------------------------------------------- */

export interface CrewTemplate { key: string; name: string; tone: AvatarTone }
export interface ZoneTemplate { code: string; name: string; area: string; target: number; crews: string[]; pin?: { x: number; y: number } }
export interface OperationTemplate { id: OperationInfo["template"]; name: string; sub: string; crews: CrewTemplate[]; zones: ZoneTemplate[]; map?: "ewc" }

export const TEMPLATES: OperationTemplate[] = [
  {
    id: "esports", name: "Esports venue", sub: "Arena, stages, studio, gates, merch and media", map: "ewc",
    crews: [
      { key: "av", name: "AV & Broadcast", tone: "denim" },
      { key: "security", name: "Security", tone: "sage" },
      { key: "hospitality", name: "Hospitality", tone: "plum" },
      { key: "runners", name: "Runners", tone: "ochre" },
    ],
    zones: [
      { code: "A1", name: "Main Arena", area: "Hall A", target: 5, crews: ["av", "runners", "security"], pin: { x: 0.17, y: 0.3 } },
      { code: "A2", name: "Player Lounge", area: "Hall A", target: 3, crews: ["hospitality", "security"], pin: { x: 0.26, y: 0.6 } },
      { code: "B1", name: "Broadcast Studio", area: "Hall B", target: 4, crews: ["av", "runners"], pin: { x: 0.45, y: 0.26 } },
      { code: "B2", name: "Stage B", area: "Hall B", target: 5, crews: ["av", "runners"], pin: { x: 0.57, y: 0.56 } },
      { code: "C1", name: "Gate 3 · Entrance", area: "Outdoor", target: 4, crews: ["security"], pin: { x: 0.86, y: 0.78 } },
      { code: "C2", name: "Merch Store", area: "Outdoor", target: 2, crews: ["hospitality", "runners"], pin: { x: 0.86, y: 0.3 } },
      { code: "D1", name: "Media Room", area: "Level 2", target: 3, crews: ["av", "hospitality"], pin: { x: 0.18, y: 0.86 } },
      { code: "D2", name: "VIP Lounge", area: "Level 2", target: 3, crews: ["hospitality", "security"], pin: { x: 0.5, y: 0.86 } },
    ],
  },
  {
    id: "conference", name: "Conference", sub: "Main hall, breakouts, registration and expo",
    crews: [
      { key: "av", name: "AV", tone: "denim" },
      { key: "registration", name: "Registration", tone: "sage" },
      { key: "hospitality", name: "Hospitality", tone: "plum" },
    ],
    zones: [
      { code: "A1", name: "Main Hall", area: "Ground floor", target: 4, crews: ["av", "hospitality"] },
      { code: "A2", name: "Breakout 1", area: "Ground floor", target: 2, crews: ["av"] },
      { code: "A3", name: "Breakout 2", area: "Ground floor", target: 2, crews: ["av"] },
      { code: "B1", name: "Registration", area: "Entrance", target: 3, crews: ["registration"] },
      { code: "B2", name: "Expo Floor", area: "Level 1", target: 3, crews: ["hospitality", "registration"] },
      { code: "C1", name: "Speaker Room", area: "Level 1", target: 1, crews: ["hospitality"] },
    ],
  },
  { id: "blank", name: "Blank", sub: "Just Command and #broadcasts; add zones yourself", crews: [], zones: [] },
];
export const templateOf = (id: OperationInfo["template"]) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[2];

export const DEFAULT_SHIFTS = [
  { id: "morning", name: "Morning", from: "08:00", to: "16:00" },
  { id: "evening", name: "Evening", from: "16:00", to: "24:00" },
];

/* ---------------------------------------------------------------------------
   Turning a group into an Operation, and editing it. Each takes the group
   chat and returns the next one (apply with useChat().updateGroup).
--------------------------------------------------------------------------- */

const rand = () => Math.random().toString(36).slice(2, 7);
const withOp = (group: Chat, fn: (op: OperationInfo, info: GroupInfo) => OperationInfo): Chat => {
  const info = groupInfo(group);
  return info.operation ? { ...group, group: { ...info, operation: fn(info.operation, info) } } : group;
};
export const zoneChannelName = (z: Pick<OperationZone, "code" | "name">) => channelName(`${z.code} ${z.name}`);

export interface OperationSetup {
  venue: string;
  startsAt: number;
  days: number;
  template: OperationInfo["template"];
}

/**
 * Adds a Command role (the Operation permissions), one role per crew, a
 * read-only #broadcasts for Command and one channel per zone. Members,
 * channels and history all stay. `by` gets Command.
 */
export function toOperation(group: Chat, setup: OperationSetup, by: string): Chat {
  const tpl = templateOf(setup.template);
  let g = group;
  const commandRole = newRoleId();
  g = upsertRole(g, { id: commandRole, name: "Command", tone: "clay", permissions: ["approveRequests", "broadcast", "manageZones", "invite"] });
  const crewIds: Record<string, string> = {};
  tpl.crews.forEach((c, i) => {
    const id = newRoleId();
    crewIds[c.key] = id;
    g = upsertRole(g, { id, name: c.name, tone: c.tone ?? ROLE_TONES[i % ROLE_TONES.length], permissions: [] });
  });
  const broadcastsChannel = newChannelId(group.id, "broadcasts");
  g = upsertChannel(g, { id: broadcastsChannel, name: "broadcasts", topic: "Must-read announcements from Command", roles: [], postRoles: [ADMIN, commandRole] });
  // #broadcasts sits right under #general.
  {
    const info = groupInfo(g);
    const rest = info.channels.slice(1).filter((c) => c.id !== broadcastsChannel);
    g = { ...g, group: { ...info, channels: [info.channels[0], info.channels.find((c) => c.id === broadcastsChannel)!, ...rest] } };
  }
  const zones: OperationZone[] = tpl.zones.map((z) => ({
    id: `z-${rand()}`, code: z.code, name: z.name, area: z.area, target: z.target,
    crews: z.crews.map((k) => crewIds[k]).filter(Boolean), channelId: newChannelId(group.id, `${z.code} ${z.name}`), pin: z.pin,
  }));
  for (const z of zones) g = upsertChannel(g, { id: z.channelId, name: zoneChannelName(z), topic: `${z.code} · ${z.area}`, roles: [], postRoles: [] });
  const info = groupInfo(g);
  const operation: OperationInfo = {
    venue: setup.venue.trim(),
    startsAt: setup.startsAt,
    days: Math.max(1, setup.days),
    shifts: DEFAULT_SHIFTS,
    template: tpl.id,
    zones,
    crews: tpl.crews.map((c) => crewIds[c.key]),
    commandRole,
    broadcastsChannel,
    links: [],
    ...(tpl.map ? { map: tpl.map } : {}),
  };
  return {
    ...g,
    group: { ...info, operation, memberRoles: { ...info.memberRoles, [by]: [...new Set([...(info.memberRoles[by] ?? []), commandRole])] } },
  };
}

/** Adds or edits a zone, and its channel with it (keeping who may see and post there). */
export function upsertZone(group: Chat, zone: OperationZone): Chat {
  const before = groupInfo(group);
  const prevZone = before.operation?.zones.find((z) => z.id === zone.id);
  const prevChannel = before.channels.find((c) => c.id === zone.channelId);
  const g = withOp(group, (op) => ({
    ...op,
    zones: prevZone ? op.zones.map((z) => (z.id === zone.id ? zone : z)) : [...op.zones, zone],
  }));
  const autoTopic = (z?: OperationZone) => (z ? `${z.code} · ${z.area}` : undefined);
  // A topic someone wrote stays; the one made from the code and area follows them.
  const topic = !prevChannel?.topic || prevChannel.topic === autoTopic(prevZone) ? autoTopic(zone) : prevChannel.topic;
  return upsertChannel(g, { roles: [], postRoles: [], ...prevChannel, id: zone.channelId, name: zoneChannelName(zone), topic });
}

/** A new zone with its own channel id; save it with upsertZone. */
export function newZone(group: Chat, fields: Omit<OperationZone, "id" | "channelId">): OperationZone {
  return { ...fields, id: `z-${rand()}`, channelId: newChannelId(group.id, `${fields.code} ${fields.name}`) };
}

/** The zone goes, and its channel closes (its history is kept). */
export function deleteZone(group: Chat, zoneId: string): Chat {
  const zone = groupInfo(group).operation?.zones.find((z) => z.id === zoneId);
  if (!zone) return group;
  const g = withOp(group, (op) => ({ ...op, zones: op.zones.filter((z) => z.id !== zoneId), links: op.links.map((l) => (l.zoneId === zoneId ? { ...l, zoneId: undefined } : l)) }));
  const info = groupInfo(g);
  return { ...g, group: { ...info, channels: info.channels.filter((c) => c.id !== zone.channelId) } };
}

export function updateOperation(group: Chat, patch: Partial<Pick<OperationInfo, "venue" | "startsAt" | "days" | "shifts">>): Chat {
  return withOp(group, (op) => ({ ...op, ...patch }));
}

/** A crew role of the Operation (a role that is also listed as a crew). */
export function addCrew(group: Chat, name: string, tone: AvatarTone): Chat {
  const id = newRoleId();
  const g = upsertRole(group, { id, name: name.trim() || "Crew", tone, permissions: [] });
  return withOp(g, (op) => ({ ...op, crews: [...op.crews, id] }));
}

export function newLinkCode() {
  return `op-${rand()}${rand()}`.slice(0, 11);
}
export function addLink(group: Chat, link: OperationLink): Chat {
  return withOp(group, (op) => ({ ...op, links: [...op.links.filter((l) => l.code !== link.code), link] }));
}
export function removeLink(group: Chat, code: string): Chat {
  return withOp(group, (op) => ({ ...op, links: op.links.filter((l) => l.code !== code) }));
}

/** The group and the crew link behind an invite code, if it is one. */
export function findLink(chats: Chat[], code: string): { group: Chat; link: OperationLink } | null {
  for (const c of chats) {
    if (c.kind !== "group" || c.groupId || c.removedAt) continue;
    const link = c.group?.operation?.links.find((l) => l.code === code);
    if (link) return { group: c, link };
  }
  return null;
}

/** A link that opens the app and joins: works on this device (the app reads ?join=). */
export function joinUrl(code: string) {
  if (typeof window === "undefined") return `/?join=${code}`;
  return `${window.location.origin}/?join=${encodeURIComponent(code)}`;
}

/* ---------------------------------------------------------------------------
   Reading an Operation
--------------------------------------------------------------------------- */

export const operationOf = (chat: Chat | undefined | null): OperationInfo | undefined => (chat ? groupInfo(chat).operation : undefined);
export const isOperation = (chat: Chat | undefined | null) => !!chat?.group?.operation;

export const zoneById = (op: OperationInfo, id?: string | null) => op.zones.find((z) => z.id === id);
export const zoneByChannel = (op: OperationInfo, channelId?: string | null) => op.zones.find((z) => z.channelId === channelId);
export const zoneLabel = (op: OperationInfo, id?: string | null) => { const z = zoneById(op, id); return z ? `${z.code} · ${z.name}` : "—"; };

/** Command: anyone who may approve or broadcast (admins included). */
export const isCommand = (info: GroupInfo, userId: string) => can(info, userId, "approveRequests") || can(info, userId, "broadcast");
export const canBroadcast = (info: GroupInfo, userId: string) => can(info, userId, "broadcast");
export const canManageZones = (info: GroupInfo, userId: string) => can(info, userId, "manageZones");
export const leadsZone = (op: OperationInfo, userId: string) => op.zones.find((z) => z.leadId === userId);
/**
 * Command decides anything; a zone lead decides inside their own zone
 * (supplies, issues) what someone else asked for, never their own requests
 * and never moves between zones.
 */
export function canDecide(info: GroupInfo, userId: string, r: Pick<OpRequest, "kind" | "zoneId"> & { by?: string }) {
  if (can(info, userId, "approveRequests")) return true;
  const z = info.operation && zoneById(info.operation, r.zoneId);
  return !!z && z.leadId === userId && r.by !== userId && (r.kind === "supplies" || r.kind === "issue");
}
/** Still "Sending…": queued on the phone, unless the phone that sent it went away (it's landed by now). */
export const isSending = (r: Pick<OpRequest, "sending" | "at">, now: number) => !!r.sending && now - r.at < 5000;
/** The crew someone works in: the first crew role they hold. */
export function crewOf(info: GroupInfo, userId: string) {
  const op = info.operation;
  if (!op) return undefined;
  const mine = rolesOf(info, userId);
  const id = op.crews.find((c) => mine.includes(c));
  return id ? info.roles.find((r) => r.id === id) : undefined;
}
/** "B2 lead", "Command", "Security", or "Crew". */
export function titleOf(info: GroupInfo, userId: string) {
  const op = info.operation;
  if (!op) return "";
  const lead = leadsZone(op, userId);
  if (lead) return `${lead.code} lead`;
  if (rolesOf(info, userId).includes(op.commandRole)) return "Command";
  if (isAdmin(info, userId)) return "Admin";
  return crewOf(info, userId)?.name ?? "Crew";
}

export const here = (live: OpLive, zoneId: string) => Object.entries(live.presence).filter(([, p]) => p.zoneId === zoneId).map(([u]) => u);
export const onSite = (live: OpLive) => Object.values(live.presence).filter((p) => p.zoneId).length;
/** Live state as the group's members see it: someone who left or was removed is no longer on site. */
export function forMembers(live: OpLive, members: string[]): OpLive {
  const gone = Object.keys(live.presence).some((u) => !members.includes(u));
  return gone ? { ...live, presence: Object.fromEntries(Object.entries(live.presence).filter(([u]) => members.includes(u))) } : live;
}
export const zoneStatus = (live: OpLive, zoneId: string): ZoneStatus => live.zoneStatus[zoneId] ?? "ok";
export const pendingRequests = (live: OpLive) => live.requests.filter((r) => r.status === "pending");
export const openRequestsIn = (live: OpLive, zoneId: string) => live.requests.filter((r) => r.zoneId === zoneId && (r.status === "pending" || r.status === "approved"));

export type Staffing = "ok" | "short" | "critical" | "over";
export function staffing(live: OpLive, z: OperationZone): { n: number; target: number; level: Staffing } {
  const n = here(live, z.id).length;
  const target = Math.max(1, z.target);
  const level: Staffing = n >= target + 2 ? "over" : n >= target ? "ok" : n / target >= 0.7 ? "short" : "critical";
  return { n, target, level };
}
/** Understaffed first, then issues, then pending requests. */
export function attentionScore(live: OpLive, z: OperationZone) {
  const st = staffing(live, z);
  return (Math.max(0, st.target - st.n) / st.target) * 10 + (zoneStatus(live, z.id) === "issue" ? 5 : 0) + openRequestsIn(live, z.id).filter((r) => r.status === "pending").length * 2;
}

/**
 * People to send to a short zone: checked in somewhere else, not Command and
 * not a zone lead; from the zones that can spare them most, the right crew,
 * then the same area.
 */
export function suggestions(info: GroupInfo, live: OpLive, members: string[], zoneId: string) {
  const op = info.operation;
  const target = op && zoneById(op, zoneId);
  if (!op || !target) return [];
  return members
    .filter((u) => live.presence[u]?.zoneId && live.presence[u].zoneId !== zoneId && !isCommand(info, u) && !leadsZone(op, u))
    .map((u) => {
      const from = zoneById(op, live.presence[u].zoneId)!;
      const st = from ? staffing(live, from) : { n: 0, target: 1 };
      const spare = st.n - st.target;
      const crew = crewOf(info, u);
      const crewFit = !!crew && target.crews.includes(crew.id);
      const near = !!from && from.area === target.area;
      const why = [spare > 0 && from ? `${from.code} is ${st.n}/${st.target}` : null, crewFit ? "Right crew" : null, near ? "Same area" : null].filter(Boolean).join(" · ");
      return { userId: u, from, spare, score: spare * 10 + (crewFit ? 6 : 0) + (near ? 3 : 0), why: why || (from ? `${from.code} · ${st.n}/${st.target}` : "") };
    })
    .filter((x) => x.from)
    .sort((a, b) => b.score - a.score);
}

/** Who a broadcast reaches right now: everyone, the roles, and whoever is in the zones. Command always. */
export function audienceOf(info: GroupInfo, live: OpLive, members: string[], a: Audience) {
  if (a.all) return members;
  return members.filter((u) => {
    const mine = rolesOf(info, u);
    return (a.roles ?? []).some((r) => mine.includes(r)) || (a.zones ?? []).includes(live.presence[u]?.zoneId ?? "") || isCommand(info, u);
  });
}
export function readRate(info: GroupInfo, live: OpLive, members: string[], b: OpBroadcast) {
  const aud = audienceOf(info, live, members, b.audience);
  const read = aud.filter((u) => b.acks[u]).length;
  return { read, aud: aud.length, unread: aud.filter((u) => !b.acks[u]) };
}
export function audienceText(info: GroupInfo, a: Audience) {
  if (a.all) return "Everyone";
  const op = info.operation;
  const parts = [
    ...(a.roles ?? []).map((r) => info.roles.find((x) => x.id === r)?.name).filter(Boolean) as string[],
    ...(a.zones ?? []).map((z) => (op ? zoneById(op, z)?.code : undefined) ?? "").filter(Boolean),
  ];
  return parts.join(", ") || "Command";
}

/* ---------------------------------------------------------------------------
   Radio: one channel per zone and per crew, Command, and All-call
--------------------------------------------------------------------------- */

export interface RadioChannel { id: ChannelId; name: string; short: string; kind: "all" | "command" | "crew" | "zone"; tone?: AvatarTone; sub: string }

export function radioChannels(info: GroupInfo): RadioChannel[] {
  const op = info.operation;
  if (!op) return [];
  const crews = op.crews.map((id) => info.roles.find((r) => r.id === id)).filter(Boolean) as GroupInfo["roles"];
  return [
    { id: "all", name: "All-call", short: "ALL", kind: "all", sub: "Everyone on site" },
    { id: "command", name: "Command", short: "CMD", kind: "command", tone: "graphite", sub: "Command crew and leads" },
    ...crews.map((r) => ({ id: `crew:${r.id}`, name: r.name, short: r.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase(), kind: "crew" as const, tone: r.tone, sub: "Crew channel" })),
    ...op.zones.map((z) => ({ id: `zone:${z.id}`, name: z.name, short: z.code, kind: "zone" as const, sub: `${z.code} · ${z.area}` })),
  ];
}
export function radioChannel(info: GroupInfo, id: ChannelId): RadioChannel {
  const list = radioChannels(info);
  return list.find((c) => c.id === id) ?? list[1] ?? { id: "command", name: "Command", short: "CMD", kind: "command", sub: "" };
}
export const radioLabel = (info: GroupInfo, id: ChannelId) => { const c = radioChannel(info, id); return c.kind === "zone" ? `${c.short} · ${c.name}` : c.name; };

/** The channel someone is on: what they tuned to, else their zone, their crew, or Command. */
/** Not tuned anywhere yet: no crew, no zone, not Command. The Radio asks them to pick a channel. */
export const NO_CHANNEL: ChannelId = "";

export function joinedChannel(info: GroupInfo, live: OpLive, userId: string): ChannelId {
  const j = live.radio.joined[userId];
  // "all" is a target (All-call), never a channel someone sits on.
  if (j && j !== "all" && radioChannels(info).some((c) => c.id === j)) return j;
  if (isCommand(info, userId)) return "command";
  const z = live.presence[userId]?.zoneId;
  if (z && info.operation && zoneById(info.operation, z)) return `zone:${z}`;
  const crew = crewOf(info, userId);
  return crew ? `crew:${crew.id}` : NO_CHANNEL;
}

export const listeners = (info: GroupInfo, live: OpLive, members: string[], id: ChannelId) =>
  id === "all" ? members : id === NO_CHANNEL ? [] : members.filter((u) => joinedChannel(info, live, u) === id);

/** Does a call reach someone? Their channel, their zone, their roles, or everyone. */
export function reaches(info: GroupInfo, live: OpLive, t: Pick<Transmission, "by" | "target">, userId: string) {
  if (t.by === userId) return true;
  const g = t.target;
  if (g.all) return true;
  if (g.channel && joinedChannel(info, live, userId) === g.channel) return true;
  if (g.zones?.includes(live.presence[userId]?.zoneId ?? "")) return true;
  if (g.roles?.length && rolesOf(info, userId).some((r) => g.roles!.includes(r))) return true;
  return false;
}
export const reachCount = (info: GroupInfo, live: OpLive, members: string[], g: Target, by: string) =>
  members.filter((u) => u !== by && reaches(info, live, { by, target: g }, u)).length;

export function targetLabel(info: GroupInfo, g: Target) {
  if (g.all) return "All-call";
  const parts: string[] = [];
  if (g.channel) { const c = radioChannel(info, g.channel); parts.push(c.kind === "zone" ? `#${c.short}` : c.name); }
  if (g.zones?.length && info.operation) parts.push(`Zones ${g.zones.map((z) => zoneById(info.operation!, z)?.code ?? "?").join(", ")}`);
  if (g.roles?.length) parts.push(g.roles.map((r) => info.roles.find((x) => x.id === r)?.name).filter(Boolean).join(", "));
  return parts.join(" + ") || "—";
}

/** Calls that reached someone since they last looked at the radio. */
export const missedCalls = (info: GroupInfo, live: OpLive, userId: string) =>
  live.radio.tx.filter((t) => !t.live && t.by !== userId && t.at > (live.radio.seen[userId] ?? 0) && reaches(info, live, t, userId)).length;

/** When the mic can't be heard (no permission, no speech engine), what a demo call says. */
export function sampleLine(info: GroupInfo, g: Target) {
  if (g.all) return "All crews, doors open in ten minutes. Everyone to positions.";
  if (g.roles?.length) return `${targetLabel(info, g)}, check in with your zone lead and confirm positions.`;
  if (g.zones?.length) return `${targetLabel(info, g)}, how many are you right now? I can send two more.`;
  const c = g.channel ? radioChannel(info, g.channel) : undefined;
  if (!c || c.kind === "command") return "Leads, quick status please. Anything short, tell me now.";
  if (c.kind === "crew") return `${c.name}, check in with your zone lead and confirm positions.`;
  return `${c.short}, how many are you right now? I can send two from A1.`;
}

/* ---------------------------------------------------------------------------
   Time
--------------------------------------------------------------------------- */

export function ago(ms: number) {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ` ${m % 60}m` : ""}`;
}
export const agoText = (ms: number) => (ms < 60_000 ? "just now" : `${ago(ms)} ago`);
export function clock(at: number) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/** Day n of the Operation, from its start (1-based, clamped). */
export function dayOf(op: OperationInfo, now: number) {
  return Math.min(op.days, Math.max(1, Math.floor((now - op.startsAt) / 86_400_000) + 1));
}

/** The day as it stands: what Command last set, or the calendar's. */
export function currentDay(op: OperationInfo, live: OpLive, now: number): DayState {
  return live.day ?? { n: dayOf(op, now), state: "on", at: op.startsAt, by: "" };
}
/** "Day 2/3", "Day 2/3 · Paused" or "Finished". */
export const dayLabel = (d: DayState, days: number) =>
  d.state === "done" ? "Finished" : `Day ${d.n}/${days}${d.state === "paused" ? " · Paused" : ""}`;
/** What a step does to the day. Finishing the last day finishes the Operation; going back from there reopens it. */
export function stepDay(op: OperationInfo, cur: DayState, step: DayStep, by: string, at: number): DayState {
  switch (step) {
    case "finish": return cur.n < op.days ? { n: cur.n + 1, state: "on", at, by } : { n: cur.n, state: "done", at, by };
    case "pause": return { n: cur.n, state: "paused", at, by };
    case "resume": return { n: cur.n, state: "on", at, by };
    case "back": return { n: cur.state === "done" ? cur.n : Math.max(1, cur.n - 1), state: "on", at, by };
  }
}
/** Finishing, pausing and rewinding a day is for Command and whoever runs the zones. */
export const canRunDay = (info: GroupInfo, userId: string) => isCommand(info, userId) || can(info, userId, "manageZones");

export const opId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
