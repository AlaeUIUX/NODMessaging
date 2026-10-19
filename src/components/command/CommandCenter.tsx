"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { IconMoon, IconOpen, IconRedo, IconSun } from "@/components/chat/Icons";
import { canCommand, PEOPLE, person } from "./data";
import * as op from "./store";
import { useOp } from "./store";
import { UiProvider } from "./parts";
import { Phone, useHost, type PhoneRoute } from "./Phone";
import { Console } from "./Console";
import { OpsWidgets } from "./Insights";
import { ZonePage, ChatView } from "./Screens";
import chat from "@/components/chat/chat.module.css";
import c from "./command.module.css";

/* ---------------------------------------------------------------------------
   /command-center: a walkthrough of Command for Rima, in the order to show
   it. Every screen is live and shares one Operation, so a move approved on
   the display shows up on Salman's phone a second later.
--------------------------------------------------------------------------- */

type PhoneSpec = { me: string; start: PhoneRoute[]; sheet?: "newop"; note?: string };
interface StepDef {
  id: string;
  title: string;
  kicker: string;
  points: string[];
  tryIt?: string[];
  display?: boolean;
  /** The display opens on its Radio panel. */
  radio?: boolean;
  dashboard?: boolean;
  phones?: PhoneSpec[];
}

const CHAT: PhoneRoute[] = [{ s: "inbox" }, { s: "group" }];
const OP: PhoneRoute[] = [...CHAT, { s: "op" }];

const STEPS: StepDef[] = [
  {
    id: "inbox", title: "Inbox", kicker: "Where it starts",
    points: ["The Operation is a group in the inbox, like any other chat.", "A live strip under its name: day, shift, people on site, open requests.", "Opening it lands in the chat. The title in the middle opens the Operation: zones, radio, broadcasts, channels.", "The walkie-talkie top right is the Radio, with a badge for anything missed."],
    tryIt: ["Tap EWC 2026 · Riyadh: it opens straight into the chat, like any group.", "Channels run along the top: #general, 📣 broadcasts, one per zone.", "Tap the name in the middle for everything else."],
    phones: [{ me: "me", start: [{ s: "inbox" }], note: "Alae · Command" }],
  },
  {
    id: "create", title: "Create an Operation", kicker: "Set-up in one minute",
    points: ["New group now asks: Group or Operation.", "An Operation takes a name, venue and dates, then a zone template (Esports venue, Conference, Blank).", "The template creates zones, crews (roles) and one channel per zone in one go.", "An existing group can be turned into an Operation from its settings (try Riyadh Season crew)."],
    tryIt: ["Pick Operation → Next → Esports venue → Create."],
    phones: [{ me: "me", start: [{ s: "inbox" }], sheet: "newop", note: "Alae · Command" }],
  },
  {
    id: "op", title: "The Operation", kicker: "Tap the title in the chat",
    points: ["Zones replaces Media for an Operation: every physical place with its staffing ring (on site / target).", "Colour only where it matters: red is short or an issue, amber is under pressure.", "List, Grid or the venue Map. Hold a zone for Assign, Set status, Open chat.", "#broadcasts is pinned at the top with its read count, then every channel."],
    tryIt: ["Switch to Map.", "Hold (or right-click) B2 for its menu.", "Open Command display, top right."],
    phones: [{ me: "me", start: OP, note: "Alae · Command" }],
  },
  {
    id: "zone", title: "A zone", kicker: "B2 · Stage B",
    points: ["Everything about one place: who is here (by crew), its tasks, its requests and its chat.", "I'm here / Scan to check in. One current zone per person.", "Need people, Need supplies, Report issue: one tap from the zone."],
    tryIt: ["+ Task → “Check stage lights” is already here; step it ↓ to Done.", "Tap Need people to see the request sheet."],
    phones: [{ me: "me", start: [...OP, { s: "zone", zoneId: "b2" }], note: "Alae · Command" }],
  },
  {
    id: "display", title: "Command display", kicker: "Tablet or laptop",
    points: ["Three columns: zones (sorted by what needs attention), the requests queue, and the feed with the broadcast composer.", "Urgent first; anything pending over 5 minutes is highlighted.", "Floor map: pins sized by headcount and coloured by status.", "On a phone it becomes stacked tabs (open it from the Operation on Alae’s phone)."],
    tryIt: ["Switch Grid → Floor map, tap a pin.", "Report, top right, for the Day report."],
    display: true,
  },
  {
    id: "request", title: "Understaffed → a move", kicker: "Flow 1",
    points: ["B2 is 2/5 and Faisal asked for 3 people, urgent.", "Approve → Choose people: suggestions come from A1, which is overstaffed (7/5), right crew first.", "Each person gets a move request on their phone and taps Accept. Their check-in follows.", "The others accept on their own a few seconds later (simulated); Salman is live on the right, so he answers himself."],
    tryIt: ["Approve · Choose people on the B2 request.", "Make sure Salman is ticked → Send.", "On Salman’s phone: Accept.", "Watch B2 turn 5/5 green and the feed log the moves."],
    display: true,
    phones: [{ me: "salman", start: CHAT, note: "Salman · Runner, A1" }],
  },
  {
    id: "broadcast", title: "Critical broadcast", kicker: "Flow 2",
    points: ["Normal broadcasts respect mute; Critical ones break through mute and Do Not Disturb, full screen, with “Got it”.", "Salman has the Operation muted, and still gets it.", "The display shows the read rate climbing; Remind re-pings whoever hasn’t read."],
    tryIt: ["Write “Doors open in 10 minutes. All crews to positions.”", "Level: Critical → Send.", "Tap Got it on Salman’s phone, then Remind on the display."],
    display: true,
    phones: [{ me: "salman", start: CHAT, note: "Salman · Runner · muted" }],
  },
  {
    id: "radio", title: "Radio", kicker: "Push to talk",
    points: ["The phone becomes a walkie-talkie: tune to a channel, earbuds in, hold the big button and talk.", "Channels are the zones (A1, B2…), the crews (Security, AV…) and Command. One knob, like a real radio; All-call always comes through.", "Every transmission is dictated live and labelled with who spoke (Voice ID), so anyone who missed it can read it.", "Half-duplex like a walkie: while someone talks the button waits. Command can break in.", "Command and leads can talk past their channel: to zones (whoever is there), to roles (wherever they are), or everyone."],
    tryIt: ["Alae: hold the button and speak (allow the mic). No mic? A sample line is dictated instead.", "Talk to → Roles → Security, and watch who it reaches.", "Salman: change channel to Runners; the venue keeps talking on its own."],
    phones: [
      { me: "me", start: [...CHAT, { s: "radio" }], note: "Alae · Command" },
      { me: "salman", start: [...CHAT, { s: "radio" }], note: "Salman · Runner, A1" },
    ],
  },
  {
    id: "radio-display", title: "Radio on the display", kicker: "Every channel at once",
    points: ["The display listens to every channel: who is talking where, live, and one transcript for all of it.", "Pick a channel to follow it, or key up to zones, roles or All-call from the same button.", "The chat shows an on-air strip while anyone is talking."],
    tryIt: ["Pick B2 in the channel strip and talk to it.", "Talk to → Everyone for an All-call; Salman hears it whatever channel he’s on."],
    display: true,
    radio: true,
    phones: [{ me: "salman", start: [...CHAT, { s: "radio" }], note: "Salman · Runner" }],
  },
  {
    id: "crew", title: "Crew phone", kicker: "Phone first",
    points: ["A crew member sees where they are, their tasks here first, then the rest.", "Not checked in? Scan the zone’s QR code (simulated) or pick it.", "Report goes to their zone lead and Command, with a photo."],
    tryIt: ["Tariq: Scan → pick B2, and see the B2 tasks.", "Salman: Report → Issue, add a photo."],
    phones: [
      { me: "salman", start: OP, note: "Salman · Runner" },
      { me: "tariq", start: [{ s: "inbox" }], note: "Tariq · not checked in" },
    ],
  },
  {
    id: "issue", title: "Issue at Gate 3", kicker: "Flows 3 and 4",
    points: ["Khalid reported a spill near Gate 3 with a photo; it sits in #gate-3 and in Command’s queue.", "A zone lead decides inside their own zone (supplies, issues), not moves between zones.", "Jamshad approves, sends cones, and marks it done: C1 goes back to OK."],
    tryIt: ["Jamshad: Approve the issue, then Mark done.", "Turki: Report another issue from C1 and watch it reach Jamshad."],
    phones: [
      { me: "jamshad", start: [...OP, { s: "zone", zoneId: "c1" }], note: "Jamshad · C1 lead" },
      { me: "turki", start: OP, note: "Turki · Security, C1" },
    ],
  },
  {
    id: "dashboard", title: "Dashboard and Day report", kicker: "After the event",
    points: ["An Ops starter for the Dashboard: zones staffing, requests, broadcast reach, on site.", "Each widget opens the display or the Day report.", "The Day report: totals, the four charts and the five slowest requests, per day and shift."],
    tryIt: ["Tap On site for the Day report."],
    dashboard: true,
  },
];

const CHOICES = ["me", "reema", "salman", "faisal", "jamshad", "turki", "tariq", "noura"];

export default function CommandCenter({ as }: { as?: string }) {
  const s = useOp();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [step, setStep] = useState(0);
  const [people, setPeople] = useState<Record<string, string>>({});
  const def = STEPS[step];

  // The venue talks on the radio while the showcase is open (only the main window drives it).
  useEffect(() => (as ? undefined : op.startChatter()), [as]);

  const shell = (body: ReactNode) => (
    <div className={`${chat.theme} ${c.root}`} data-theme={theme}>{body}</div>
  );
  if (!s) return shell(<div className={c.loading}>Loading the Operation…</div>);

  // A second window as one person: just their phone.
  if (as) {
    const who = PEOPLE.some((p) => p.id === as) ? as : "salman";
    return shell(
      <div className={c.solo}>
        <p className={c.soloNote}>Signed in as <b>{person(who).name}</b> · same Operation as the other window</p>
        <Phone s={s} me={who} start={canCommand(who) ? [{ s: "inbox" }] : OP} />
      </div>,
    );
  }

  const go = (i: number) => { setStep(i); setPeople({}); };
  const phoneKey = (p: PhoneSpec, i: number) => `${def.id}-${i}-${people[`${def.id}-${i}`] ?? p.me}`;

  return shell(
    <div className={c.shell}>
      <header className={c.top}>
        <Link href="/" className={c.wordmark}>nod</Link>
        <span className={c.topTitle}><b>Command</b><small>Prototype · running a live event from NOD</small></span>
        <span className={c.topEnd}>
          <a className={c.topBtn} href="/command-center?as=salman" target="_blank" rel="noopener">Open Salman’s window<IconOpen size={14} /></a>
          <button className={c.topBtn} onClick={() => { op.resetDemo(); go(step); }}><IconRedo size={14} />Reset demo</button>
          <button className={c.topIcon} onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Dark mode">{theme === "light" ? <IconMoon size={18} /> : <IconSun size={18} />}</button>
        </span>
      </header>
      <div className={c.body}>
        <nav className={c.rail} aria-label="Walkthrough">
          <ol>
            {STEPS.map((x, i) => (
              <li key={x.id}>
                <button className={i === step ? c.railOn : undefined} onClick={() => go(i)}>
                  <span className={c.railNum}>{i + 1}</span>
                  <span><b>{x.title}</b><small>{x.kicker}</small></span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <main className={`${c.main} ${def.display || def.dashboard ? c.mainWide : ""}`}>
          <section className={c.brief}>
            <span className={c.briefKicker}>{step + 1} / {STEPS.length} · {def.kicker}</span>
            <h1>{def.title}</h1>
            <ul>{def.points.map((p) => <li key={p}>{p}</li>)}</ul>
            {def.tryIt && <div className={c.tryIt}><b>Try it</b><ol>{def.tryIt.map((p) => <li key={p}>{p}</li>)}</ol></div>}
            <div className={c.briefNav}>
              <button className={c.btnGhostSm} disabled={step === 0} onClick={() => go(step - 1)}>Back</button>
              <button className={c.btnPrimarySm} disabled={step === STEPS.length - 1} onClick={() => go(step + 1)}>Next: {STEPS[step + 1]?.title ?? "Done"}</button>
            </div>
          </section>
          <div className={c.stage}>
            {def.display && <Display key={`d-${def.id}`} me="me" radio={def.radio} />}
            {def.dashboard && <Dashboard key="dash" onDisplay={() => go(STEPS.findIndex((x) => x.id === "display"))} />}
            {def.phones?.map((p, i) => {
              const who = people[`${def.id}-${i}`] ?? p.me;
              return (
                <div key={phoneKey(p, i)} className={c.phoneWrap}>
                  <label className={c.persona}>
                    <span>Viewing as</span>
                    <select value={who} onChange={(e) => setPeople((x) => ({ ...x, [`${def.id}-${i}`]: e.target.value }))}>
                      {CHOICES.map((u) => <option key={u} value={u}>{person(u).name}{canCommand(u) ? " · Command" : ` · ${person(u).title ?? "Crew"}`}</option>)}
                    </select>
                  </label>
                  <Phone
                    s={s}
                    me={who}
                    start={who === p.me ? p.start : canCommand(who) ? [{ s: "inbox" }] : OP}
                    startSheet={who === p.me ? p.sheet : undefined}
                  />
                  {who === p.me && p.note && <small className={c.phoneNote}>{p.note}</small>}
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>,
  );
}

/* ---- the wide display, with its own sheets and a side panel for zones ---- */

function Display({ me, radio }: { me: string; radio?: boolean }) {
  const s = useOp()!;
  const [side, setSide] = useState<{ kind: "zone" | "chat"; zoneId: string } | null>(null);
  const { ui, overlays } = useHost(me, {
    openZone: (zoneId) => setSide({ kind: "zone", zoneId }),
    openChat: (zoneId) => setSide({ kind: "chat", zoneId }),
  });
  return (
    <UiProvider value={ui}>
      <div className={c.display}>
        <div className={c.displayScreen}>
          <Console s={s} startRight={radio ? "radio" : "feed"} />
          {side && (
            <>
              <div className={c.sideScrim} onClick={() => setSide(null)} />
              <aside className={c.side}>
                {side.kind === "zone"
                  ? <ZonePage key={side.zoneId} s={s} zoneId={side.zoneId} onBack={() => setSide(null)} backLabel="Close" />
                  : <ChatView s={s} zoneId={side.zoneId} onBack={() => setSide({ kind: "zone", zoneId: side.zoneId })} />}
              </aside>
            </>
          )}
          <div className={c.sheetHost}>{overlays}</div>
        </div>
        <small className={c.phoneNote}>Command display · Alae (Admin, Command role)</small>
      </div>
    </UiProvider>
  );
}

function Dashboard({ onDisplay }: { onDisplay: () => void }) {
  const s = useOp()!;
  const { ui, overlays } = useHost("me", { openZone: () => onDisplay(), openChat: () => onDisplay(), openConsole: onDisplay });
  return (
    <UiProvider value={ui}>
      <div className={c.display}>
        <div className={`${c.displayScreen} ${c.dashScreen}`}>
          <header className={c.dashHead}><b>Dashboard</b><small>Ops starter · {s.name}</small></header>
          <OpsWidgets s={s} />
          <div className={c.sheetHost}>{overlays}</div>
        </div>
      </div>
    </UiProvider>
  );
}
