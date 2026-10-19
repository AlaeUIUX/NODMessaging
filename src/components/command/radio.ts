import { CREWS, PEOPLE, person, type CrewId, type OpState } from "./data";

/* ---------------------------------------------------------------------------
   Radio: the phone as a walkie-talkie. Pick a channel, hold the big button,
   talk. Everyone tuned in hears it in their earbuds, and every transmission
   is transcribed with its speaker, so a missed call can still be read.
   Command can key up to a channel, to zones (whoever is there), to crews
   (roles), or to everyone at once.
--------------------------------------------------------------------------- */

export type ChannelId = string; // "all" | "command" | "crew:av" | "zone:b2"

export interface Target { channel?: ChannelId; zones?: string[]; crews?: CrewId[]; all?: true }
export interface Transmission {
  id: string;
  by: string;
  at: number;
  /** Where it was keyed: who hears it. */
  target: Target;
  text: string;
  /** Still on air: the words arrive as they're spoken. */
  live?: boolean;
  endedAt?: number;
  /** "voice": dictated from the mic. "auto": the speaker was recognised by voice. */
  source?: "voice" | "sim";
}
export interface RadioState {
  tx: Transmission[];
  /** The one channel each person is tuned to (a walkie has one knob). */
  joined: Record<string, ChannelId>;
  /** Last time each person looked at the radio, for "missed". */
  seen: Record<string, number>;
}

export interface Channel { id: ChannelId; name: string; short: string; kind: "all" | "command" | "crew" | "zone"; color: string; sub: string }

export function channels(s: OpState): Channel[] {
  return [
    { id: "all", name: "All-call", short: "ALL", kind: "all", color: "var(--bad-mark)", sub: "Everyone on site" },
    { id: "command", name: "Command", short: "CMD", kind: "command", color: "#1C1917", sub: "Command crew" },
    ...CREWS.filter((c) => c.id !== "command").map((c) => ({ id: `crew:${c.id}`, name: c.name, short: c.name.slice(0, 3).toUpperCase(), kind: "crew" as const, color: c.color, sub: "Crew channel" })),
    ...s.zones.map((z) => ({ id: `zone:${z.id}`, name: z.name, short: z.code, kind: "zone" as const, color: "var(--ink-2)", sub: `${z.code} · ${z.area}` })),
  ];
}
export const channelOf = (s: OpState, id: ChannelId) => channels(s).find((c) => c.id === id) ?? channels(s)[0];
export const channelLabel = (s: OpState, id: ChannelId) => { const c = channelOf(s, id); return c.kind === "zone" ? `${c.short} · ${c.name}` : c.name; };

/** Everyone tuned to a channel. */
export const listeners = (s: OpState, id: ChannelId) =>
  id === "all" ? PEOPLE.map((p) => p.id) : PEOPLE.filter((p) => s.radio.joined[p.id] === id).map((p) => p.id);

/** Does this transmission reach this person? Their channel, their zone, their crew, or everyone. Command hears zone leads' channel too. */
export function reaches(s: OpState, t: Transmission, userId: string) {
  if (t.by === userId) return true;
  const g = t.target;
  if (g.all) return true;
  if (g.channel && s.radio.joined[userId] === g.channel) return true;
  if (g.zones?.includes(s.presence[userId]?.zoneId ?? "")) return true;
  if (g.crews?.includes(person(userId).crew)) return true;
  return false;
}

export function targetLabel(s: OpState, g: Target) {
  if (g.all) return "All-call";
  const parts: string[] = [];
  if (g.channel) parts.push(channelOf(s, g.channel).kind === "zone" ? `#${channelOf(s, g.channel).short}` : channelOf(s, g.channel).name);
  if (g.zones?.length) parts.push(`Zones ${g.zones.map((z) => z.toUpperCase()).join(", ")}`);
  if (g.crews?.length) parts.push(g.crews.map((c) => CREWS.find((x) => x.id === c)?.name).join(", "));
  return parts.join(" + ") || "—";
}

/** How many people a target reaches right now. */
export const reachCount = (s: OpState, g: Target, by: string) =>
  PEOPLE.filter((p) => p.id !== by && reaches(s, { id: "", by, at: 0, target: g, text: "" }, p.id)).length;

/* ---- seed and simulation ---- */

const MIN = 60_000;

export function seedRadio(s: Omit<OpState, "radio">, now: number): RadioState {
  const joined: Record<string, ChannelId> = { me: "command", reema: "command" };
  PEOPLE.forEach((p) => {
    if (joined[p.id]) return;
    const z = s.presence[p.id]?.zoneId;
    joined[p.id] = z ? `zone:${z}` : `crew:${p.crew}`;
  });
  const tx = (by: string, ago: number, target: Target, text: string, dur = 4): Transmission =>
    ({ id: `x-${by}-${ago}`, by, at: now - ago * MIN, endedAt: now - ago * MIN + dur * 1000, target, text, source: "sim" });
  return {
    joined,
    seen: { me: now - 4 * MIN, salman: now - 9 * MIN },
    tx: [
      tx("reema", 22, { all: true }, "All crews, radio check. Semi-final one starts at 18:00, doors at 16:00 as planned."),
      tx("noura", 18, { channel: "zone:a1" }, "A1, casters are live. Keep aisle four clear for the camera dolly."),
      tx("abdullah", 15, { channel: "zone:a1" }, "Copy. Aisle four is clear."),
      tx("faisal", 12, { channel: "zone:b2" }, "Stage B, we're only two. Queue is past the merch stand."),
      tx("jamshad", 9, { channel: "crew:security" }, "Security, bag check on Gate 3 is backing up. Lane two stays open."),
      tx("reema", 7, { channel: "command" }, "Leads, hold all moves after 17:45 unless it's urgent."),
      tx("noura", 6, { channel: "zone:a1" }, "We're seven in A1, we can lend people if Command asks."),
      tx("khalid", 3, { channel: "zone:c1" }, "Spill near Gate 3, people are slipping. Need cones."),
      tx("ziyad", 2, { channel: "crew:runners" }, "Runners, water run to Hall B in five. Who's free?"),
    ],
  };
}

/** What the venue sounds like: someone keys up every few seconds somewhere. */
export const SCRIPT: { by: string; target: Target; text: string }[] = [
  { by: "faisal", target: { channel: "zone:b2" }, text: "B2, barrier line is up. Need one more on the left door." },
  { by: "mona", target: { channel: "zone:b2" }, text: "Queue's moving, about two hundred people now." },
  { by: "noura", target: { channel: "zone:a1" }, text: "A1, mic check in two minutes, everyone off the stage." },
  { by: "omar", target: { channel: "zone:a1" }, text: "Desk two is fixed, it was the cable on channel three." },
  { by: "jamshad", target: { channel: "zone:c1" }, text: "Gate 3, lane two is open again. Keep them moving." },
  { by: "khalid", target: { channel: "zone:c1" }, text: "Cones are out by the spill, cleaner is on the way." },
  { by: "fahad", target: { channel: "crew:security" }, text: "Security, two of you to Gate 1, bag check backlog." },
  { by: "charles", target: { channel: "crew:av" }, text: "AV, replay server B is live. A is on standby." },
  { by: "lina", target: { channel: "zone:b1" }, text: "B1, we're on air in thirty seconds. Quiet in the studio." },
  { by: "ziyad", target: { channel: "crew:runners" }, text: "Runners, I need a hand with ice for the player lounge." },
  { by: "reema", target: { channel: "command" }, text: "Command, how are we on Stage B? I want it full before 17:30." },
  { by: "nasser", target: { channel: "zone:d2" }, text: "D2, first VIP cars are at the drop-off. Dates and qahwa ready." },
  { by: "dana", target: { channel: "zone:c2" }, text: "Merch is out of size M jerseys, restock from Hall A storage." },
  { by: "waleed", target: { channel: "zone:d1" }, text: "Media room, press conference moves to 19:15." },
  { by: "sara", target: { channel: "zone:a1" }, text: "A1, ushers to rows K to P, the gates are opening." },
  { by: "fahad", target: { channel: "zone:a1" }, text: "Security in A1, I need one more at the camera pit barrier." },
  { by: "ziyad", target: { channel: "zone:a1" }, text: "Press pit is restocked, water and towels." },
  { by: "noura", target: { channel: "zone:a1" }, text: "Two minutes to walk-on. Lights going down, phones away." },
  { by: "reema", target: { channel: "command" }, text: "Alae, send me the Stage B numbers when they land." },
  { by: "jamshad", target: { channel: "command" }, text: "Command, Gate 3 is clear now, back to normal flow." },
  { by: "faisal", target: { channel: "command" }, text: "Command, B2 is filling up fast. Those three people would help." },
];

/** The answer a channel gives when you key up there, so a solo demo talks back. */
export function replyFor(s: OpState, channel: ChannelId | undefined, by: string): { by: string; text: string } | null {
  if (!channel || channel === "all") return null;
  const lead = channel.startsWith("zone:") ? s.zones.find((z) => `zone:${z.id}` === channel)?.leadId : channel === "command" ? (by === "reema" ? "me" : "reema") : listeners(s, channel).find((u) => u !== by);
  if (!lead || lead === by) return null;
  const lines = ["Copy that.", "Copy, on it.", "Received, moving now.", "Copy. Will report back in five."];
  return { by: lead, text: lines[Math.floor(Math.random() * lines.length)] };
}

/** When the mic can't be heard (no permission, no speech engine), what a demo transmission says. */
export function sampleLine(channel: Channel) {
  if (channel.kind === "all") return "All crews, doors open in ten minutes. Everyone to positions.";
  if (channel.kind === "command") return "Leads, quick status please. Anything short, tell me now.";
  if (channel.kind === "crew") return `${channel.name}, check in with your zone lead and confirm positions.`;
  return `${channel.short}, how many are you right now? I can send two from A1.`;
}
