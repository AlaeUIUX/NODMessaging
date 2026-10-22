"use client";

import { useEffect, useRef, useState } from "react";
import { IconAlert, IconBack, IconCheck, IconChevronDown, IconMic, IconWalkie } from "@/components/chat/Icons";
import StatusBar from "@/components/chat/StatusBar";
import { getPermission, Segmented, Sheet, smooth, useChatUi, useDialog, useNow } from "@/components/chat/ui";
import styles from "@/components/chat/chat.module.css";
import { dictationSupported, useDictation } from "@/lib/chat/dictation";
import { isAdmin } from "@/lib/chat/groups";
import {
  canBroadcast, clock, crewOf, isCommand, joinedChannel, leadsZone, listeners, missedCalls, radioChannel, radioChannels,
  radioLabel, reachCount, reaches, sampleLine, targetLabel, zoneById,
  type ChannelId, type OpLive, type RadioChannel, type Target, type Transmission,
} from "@/lib/chat/operation";
import { opDispatch, opLive } from "@/lib/chat/opstore";
import { userById } from "@/lib/chat/store";
import type { GroupInfo } from "@/lib/chat/types";
import { Av, CrewDot, Stack, toneColor } from "./kit";
import { useOperation } from "./useOperation";
import r from "./radio.module.css";

/**
 * Radio: the phone as a walkie-talkie. One channel at a time (one knob),
 * All-call and Command's calls to zones or roles always come through. Hold
 * the big button (or tap, hands busy) and talk: the words are dictated live
 * and everyone who hears the call reads them as they're spoken, with who
 * said it, from where. Half-duplex: while someone you hear is talking, the
 * button waits; Command can break in.
 */

/** A call still "on air" after this long lost its sender (a tab closed mid-call): treat it as over. */
const DROPPED = 2 * 60_000;
const onAir = (t: Transmission, now: number) => !!t.live && now - t.at < DROPPED;
const firstName = (id: string) => userById(id).name;

/* ---------------------------------------------------------------------------
   Small parts
--------------------------------------------------------------------------- */

/** A channel's square tile: a crew's colour, red for All-call, ink for a zone. */
function ChannelTile({ ch, size = "sm" }: { ch: RadioChannel; size?: "sm" | "lg" }) {
  const tint = ch.kind === "all" ? "var(--bad-mark)" : ch.kind === "zone" ? undefined : toneColor(ch.tone ?? "graphite");
  return (
    <span
      className={size === "lg" ? r.chCodeLg : r.chCode}
      style={tint ? { ["--ch" as string]: tint, ["--ch-ink" as string]: "#fff" } : undefined}
      aria-hidden="true"
    >
      {ch.short}
    </span>
  );
}

function Wave({ n = 22 }: { n?: number }) {
  return (
    <span className={r.wave} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}
    </span>
  );
}

/** Who is talking, beyond a name: where they are, what they do there, and their crew. */
function speaker(info: GroupInfo, live: OpLive, userId: string) {
  const op = info.operation;
  const zone = op ? zoneById(op, live.presence[userId]?.zoneId) : undefined;
  const where = zone ? `${zone.code} · ${zone.name}` : null;
  if (isCommand(info, userId)) {
    return { code: "CMD", where: where ?? "Command", role: where ? "Command" : isAdmin(info, userId) ? "Admin" : null, crew: undefined };
  }
  const lead = op ? leadsZone(op, userId) : undefined;
  return { code: zone?.code ?? "—", where: where ?? "Not checked in", role: lead ? `${lead.code} lead` : "Crew", crew: crewOf(info, userId) };
}

/** Where a call came through, when that isn't simply your own channel. */
function viaOf(info: GroupInfo, t: Transmission, mine: ChannelId) {
  const g = t.target;
  if (g.all) return "All-call";
  if (g.channel && g.channel !== mine) return radioLabel(info, g.channel);
  if (g.zones?.length) return targetLabel(info, { zones: g.zones });
  if (g.roles?.length) return targetLabel(info, { roles: g.roles });
  return null;
}

/* ---------------------------------------------------------------------------
   The transcript: a speaker identity card per call, newest at the bottom
--------------------------------------------------------------------------- */

function Transcript({ info, live, items, me, since, until, now }: {
  info: GroupInfo; live: OpLive; items: Transmission[]; me: string;
  /** Last look before this visit, and when this visit started: calls in between were missed. */
  since: number; until: number; now: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Follow the newest words, inside this scroller only (never the page), unless the person scrolled up to read.
  const stick = useRef(true);
  const programmatic = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  const last = items[items.length - 1];
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (last?.by === me && last.live) stick.current = true;
    if (!stick.current) return;
    if (programmatic.current) clearTimeout(programmatic.current);
    programmatic.current = setTimeout(() => { programmatic.current = null; }, 450);
    el.scrollTo({ top: el.scrollHeight, behavior: first.current ? "auto" : smooth() });
    first.current = false;
  }, [items.length, last?.id, last?.text, last?.live, last?.by, me]);
  useEffect(() => () => { if (programmatic.current) clearTimeout(programmatic.current); }, []);

  const mine = joinedChannel(info, live, me);
  const firstMissed = items.find((t) => t.at > since && t.at <= until && t.by !== me)?.id;
  return (
    <div
      ref={box}
      className={r.tscroll}
      onScroll={(e) => {
        if (programmatic.current) return;
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {/* New calls are announced; their words streaming in are not, one by one. */}
      <div className={r.tlist} role="log" aria-live="polite" aria-relevant="additions" aria-label="Radio transcript">
        {items.map((t) => {
          const u = userById(t.by);
          const id = speaker(info, live, t.by);
          const via = viaOf(info, t, mine);
          const airing = onAir(t, now);
          return (
            <div key={t.id} className={r.txWrap}>
              {t.id === firstMissed && <div className={r.tDivider}><span>Missed while you were away</span></div>}
              <article className={`${r.tx} ${airing ? r.txLive : ""} ${t.by === me ? r.txMine : ""} ${t.target.all ? r.txAll : ""}`}>
                <header className={r.txHead}>
                  <span className={r.txAv}>
                    <Av id={t.by} size={38} />
                    <span className={r.txAvCode} title={id.where}>{id.code}</span>
                  </span>
                  <span className={r.txWho}>
                    <span className={r.txName}>
                      <b>{t.by === me ? `You · ${u.fullName}` : u.fullName}</b>
                      <time>{airing ? <span className={r.txOnAir}>● On air</span> : clock(t.at)}</time>
                    </span>
                    <span className={r.txRole}>
                      <span className={r.txWhere}>{id.where}</span>
                      {id.role && <span>{id.role}</span>}
                      {id.crew && <span className={r.txCrew}><CrewDot tone={id.crew.tone} />{id.crew.name}</span>}
                    </span>
                  </span>
                </header>
                <p className={r.txText}>
                  {t.text || (airing ? <span className={r.txListening}>Listening…</span> : "")}
                  {airing && <span className={r.caret} />}
                </p>
                {airing && <Wave />}
                {(via || t.by !== me || t.source === "voice") && (
                  <footer className={r.txFoot}>
                    {via && <span className={`${r.txVia} ${t.target.all ? r.txViaAll : ""}`}>{via}</span>}
                    {t.by !== me && <span className={r.voiceId} title="Speaker recognised by voice">Voice ID · {u.name}</span>}
                    {t.by === me && t.source === "voice" && !airing && <span className={r.voiceId}>Dictated</span>}
                  </footer>
                )}
              </article>
            </div>
          );
        })}
        {!items.length && <p className={r.empty}>Quiet on this channel. Hold the button to talk.</p>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Picking a channel (one at a time), and who a call goes to
--------------------------------------------------------------------------- */

function ChannelSheet({ groupId, onPick }: { groupId: string; onPick: (id: ChannelId) => void }) {
  const { info, op, live, me, members } = useOperation(groupId);
  const ui = useChatUi();
  const now = useNow(5_000);
  if (!info || !op || !live) return null;
  // Command's channel is for Command and the zone leads.
  const mayCommand = isCommand(info, me) || !!leadsZone(op, me);
  const list = radioChannels(info).filter((ch) => ch.kind !== "all" && (ch.kind !== "command" || mayCommand));
  const groups: [string, RadioChannel[]][] = [
    ["Command", list.filter((x) => x.kind === "command")],
    ["Crews", list.filter((x) => x.kind === "crew")],
    ["Zones", list.filter((x) => x.kind === "zone")],
  ];
  const joined = joinedChannel(info, live, me);
  const hereZone = live.presence[me]?.zoneId;
  return (
    <Sheet title="Channels" onClose={ui.closeSheet}>
      {(close) => (
        <>
          <p className={r.sheetHint}>One channel at a time, like a walkie. All-call and calls from Command always come through.</p>
          {groups.filter(([, g]) => g.length).map(([name, g]) => (
            <div key={name} className={r.chGroup}>
              <div className={r.label}>{name}</div>
              {g.map((ch) => {
                const talking = live.radio.tx.find((t) => onAir(t, now) && t.target.channel === ch.id);
                const on = joined === ch.id;
                const here = !!hereZone && ch.id === `zone:${hereZone}`;
                const tuned = listeners(info, live, members, ch.id);
                return (
                  <button key={ch.id} className={`${r.chRow} ${on ? r.chOn : ""}`} aria-pressed={on} onClick={() => close(() => onPick(ch.id))}>
                    <ChannelTile ch={ch} />
                    <span className={r.pickMain}>
                      <b>{ch.name}{here && <span className={r.here}> · you’re here</span>}</b>
                      <small>
                        {talking
                          ? <span className={r.chLive}>● {talking.by === me ? "You’re" : `${firstName(talking.by)} is`} talking</span>
                          : `${tuned.length} tuned in · ${ch.sub}`}
                      </small>
                    </span>
                    {on ? <span className={r.chCheck}><IconCheck size={16} /></span> : <Stack ids={tuned} size={20} max={3} />}
                  </button>
                );
              })}
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

type TargetKind = "channel" | "zones" | "roles" | "all";

/** Command and zone leads can talk past their channel: to zones, to roles, or (Command) to everyone. */
function TargetSheet({ groupId, value, onPick }: { groupId: string; value: Target; onPick: (t: Target) => void }) {
  const { info, op, live, me, members } = useOperation(groupId);
  const ui = useChatUi();
  const [kind, setKind] = useState<TargetKind>(value.all ? "all" : value.zones?.length ? "zones" : value.roles?.length ? "roles" : "channel");
  const [zones, setZones] = useState<string[]>(value.zones ?? []);
  const [roles, setRoles] = useState<string[]>(value.roles ?? []);
  if (!info || !op || !live) return null;
  const everyone = canBroadcast(info, me);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const channel = value.channel ?? joinedChannel(info, live, me);
  const next: Target = kind === "all" && everyone ? { all: true } : kind === "zones" ? { zones } : kind === "roles" ? { roles } : { channel };
  const ok = kind === "channel" || (kind === "all" && everyone) || (kind === "zones" ? zones.length > 0 : kind === "roles" ? roles.length > 0 : false);
  const crews = op.crews.map((id) => info.roles.find((x) => x.id === id)).filter((x): x is GroupInfo["roles"][number] => !!x);
  const options: { id: TargetKind; label: string }[] = [
    { id: "channel", label: "Channel" },
    { id: "zones", label: "Zones" },
    { id: "roles", label: "Roles" },
    ...(everyone ? [{ id: "all" as const, label: "Everyone" }] : []),
  ];
  const reach = reachCount(info, live, members, next, me);
  return (
    <Sheet title="Talk to" onClose={ui.closeSheet} action={{ label: "Done", disabled: !ok, onClick: () => onPick(next) }}>
      <Segmented value={kind} onChange={setKind} options={options} />
      {kind === "channel" && <p className={r.sheetHint}>Everyone tuned to {radioLabel(info, channel)} hears you.</p>}
      {kind === "zones" && (
        <>
          <p className={r.sheetHint}>Whoever is checked in there hears you, whatever channel they’re on.</p>
          <div className={r.codes}>
            {op.zones.map((z) => (
              <button key={z.id} className={zones.includes(z.id) ? r.codeOn : undefined} aria-pressed={zones.includes(z.id)} onClick={() => setZones(toggle(zones, z.id))}>
                <b>{z.code}</b> {z.name}
              </button>
            ))}
          </div>
        </>
      )}
      {kind === "roles" && (
        <>
          <p className={r.sheetHint}>Everyone in the role hears you, wherever they are.</p>
          <div className={r.codes}>
            {crews.map((x) => (
              <button key={x.id} className={roles.includes(x.id) ? r.codeOn : undefined} aria-pressed={roles.includes(x.id)} onClick={() => setRoles(toggle(roles, x.id))}>
                <CrewDot tone={x.tone} />{x.name}
              </button>
            ))}
          </div>
        </>
      )}
      {kind === "all" && <p className={r.criticalNote}><IconAlert size={14} />All-call breaks into every channel on site.</p>}
      <div className={r.field}>
        <span>Reaches</span>
        <b className={r.fieldVal}>{reach} {reach === 1 ? "person" : "people"} now</b>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   The push-to-talk button: hold (or tap, hands busy) to talk
--------------------------------------------------------------------------- */

function TalkButton({ groupId, target }: { groupId: string; target: Target }) {
  const { info, live, me, members, act } = useOperation(groupId);
  const ui = useChatUi();
  const now = useNow(5_000);
  const dict = useDictation();
  const [txId, setTxId] = useState<string | null>(null);
  const [mode, setMode] = useState<"hold" | "tap">("hold");
  // The call on air, for handlers (state lags a render behind a fast press and release).
  const txRef = useRef<string | null>(null);
  const said = useRef<{ text: string; source: Transmission["source"] }>({ text: "", source: "voice" });
  const ending = useRef(false);
  const asking = useRef(false);

  // Leaving the radio mid-call ends the call with what was said so far.
  useEffect(() => () => {
    const id = txRef.current;
    if (id) opDispatch(groupId, { t: "radio.release", id, text: said.current.text, at: Date.now(), source: said.current.source });
  }, [groupId]);

  if (!info || !live) return null;

  const command = isCommand(info, me);
  const talking = !!txId;
  const busy = live.radio.tx.find((t) => onAir(t, now) && t.by !== me && reaches(info, live, t, me));
  // Half-duplex: crew wait for the air to clear; Command can break in.
  const blocked = !!busy && !command && !talking;
  const sample = sampleLine(info, target);
  const reach = reachCount(info, live, members, target, me);

  const begin = (voice: boolean) => {
    if (txRef.current) return;
    ending.current = false;
    const listen = voice && dictationSupported();
    const source: Transmission["source"] = listen ? "voice" : "sample";
    const id = act.keyUp(target, source);
    txRef.current = id;
    said.current = { text: "", source };
    setTxId(id);
    dict.start(sample, (text) => { said.current.text = text; act.words(id, text); }, { listen });
  };

  const press = async () => {
    if (txRef.current || blocked || asking.current) return;
    const perm = getPermission("microphone");
    if (perm === "prompt") {
      // The first time, the phone asks; the press itself doesn't go on air.
      asking.current = true;
      const granted = await ui.ask("microphone");
      asking.current = false;
      if (mode === "tap") begin(granted);
      else if (granted) ui.toast("Microphone on · hold to talk");
      return;
    }
    // Denied, or no speech engine: a sample line goes out, so the radio still works.
    begin(perm === "granted");
  };

  const end = async () => {
    const id = txRef.current;
    if (!id || ending.current) return;
    ending.current = true;
    const { text, voice } = await dict.stop(sample);
    act.release(id, text, voice ? "voice" : "sample");
    txRef.current = null;
    setTxId(null);
  };

  const label = talking
    ? mode === "hold" ? "Release to send" : "Tap to send"
    : blocked ? `${firstName(busy!.by)} is talking…`
      : busy ? (mode === "hold" ? "Hold to break in" : "Tap to break in")
        : mode === "hold" ? "Hold to talk" : "Tap to talk";
  const sub = talking ? `On air · ${reach} hear you` : `${targetLabel(info, target)} · ${reach} ${reach === 1 ? "person" : "people"}`;

  return (
    <div className={r.ptt}>
      <button
        className={`${r.pttBtn} ${talking ? r.pttLive : ""} ${busy && !talking ? r.pttRx : ""}`}
        disabled={blocked}
        aria-pressed={talking}
        aria-label={label}
        onPointerDown={(e) => {
          if (mode !== "hold" || e.button > 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          void press();
        }}
        onPointerUp={() => { if (mode === "hold") void end(); }}
        onPointerCancel={() => { if (mode === "hold") void end(); }}
        onClick={() => { if (mode === "tap") void (txRef.current ? end() : press()); }}
        onKeyDown={(e) => {
          if (mode !== "hold" || (e.key !== " " && e.key !== "Enter")) return;
          e.preventDefault();
          if (!e.repeat) void press();
        }}
        onKeyUp={(e) => {
          if (mode !== "hold" || (e.key !== " " && e.key !== "Enter")) return;
          e.preventDefault();
          void end();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className={r.pttRing} /><span className={r.pttRing} /><span className={r.pttRing} />
        <span className={r.pttCore}>
          {busy && !talking ? <Av id={busy.by} size={56} /> : <IconMic size={36} />}
        </span>
      </button>
      <div className={r.pttMeta}>
        <b>{label}</b>
        <small>{sub}</small>
        <span className={r.pttMode}>
          <Segmented
            value={mode}
            onChange={(m) => { if (txRef.current) void end(); setMode(m); }}
            options={[{ id: "hold", label: "Hold" }, { id: "tap", label: "Tap" }]}
          />
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The Radio screen
--------------------------------------------------------------------------- */

export function RadioScreen({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { info, op, live, me, members, act } = useOperation(groupId);
  const ui = useChatUi();
  const now = useNow(5_000);
  const rootRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  // When this visit started, and when the person last looked before it: what's in between was missed.
  const [opened] = useState(() => ({ at: Date.now(), since: opLive(groupId)?.radio.seen[me] ?? 0 }));
  const [target, setTarget] = useState<Target | null>(null);

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onClose, 220);
  };
  useDialog(rootRef, close);
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, []);

  // Looking at the radio counts as having heard it: on open, and as each new call comes in.
  const lastId = live?.radio.tx[live.radio.tx.length - 1]?.id;
  const ready = !!op && !!live;
  useEffect(() => {
    if (ready) act.radioSeen();
    // `act` is rebuilt every render; this runs only when a new call arrives (or someone else signs in).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, me, ready]);

  if (!info || !op || !live) return null;

  const joined = joinedChannel(info, live, me);
  const ch = radioChannel(info, joined);
  const tuned = listeners(info, live, members, joined);
  const items = live.radio.tx
    .filter((t) => (t.target.channel === joined || reaches(info, live, t, me)) && (t.text || onAir(t, now)))
    .slice(-60);
  const liveCall = live.radio.tx.find((t) => onAir(t, now) && reaches(info, live, t, me));
  const missed = live.radio.tx.filter((t) => !t.live && t.by !== me && t.at > opened.since && t.at <= opened.at && reaches(info, live, t, me)).length;
  const mayTarget = canBroadcast(info, me) || !!leadsZone(op, me);
  const talkTo: Target = target ?? { channel: joined };

  const pick = (id: ChannelId) => {
    act.tune(id);
    setTarget(null);
    ui.toast(`Tuned to ${radioLabel(info, id)}`);
  };

  return (
    <div ref={rootRef} className={`${r.screen} ${leaving ? r.leaving : ""}`} role="dialog" aria-modal="true" aria-label="Radio" tabIndex={-1}>
      <StatusBar />
      <header className={r.bar}>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={close} aria-label="Back">
          <IconBack />
        </button>
        <span className={r.title}>
          <b><IconWalkie size={17} />Radio</b>
          <small><i className={r.liveDot} />Live · Earbuds connected</small>
        </span>
        <span aria-hidden="true" />
      </header>

      <button className={r.chCard} onClick={() => ui.openSheet(<ChannelSheet groupId={groupId} onPick={pick} />)} aria-label={`Channel: ${radioLabel(info, joined)}. Change channel`}>
        <ChannelTile ch={ch} size="lg" />
        <span className={r.pickMain}>
          <b className={r.chName}>{ch.name}<IconChevronDown size={14} /></b>
          <small>
            {liveCall
              ? <span className={r.chLive}>● {liveCall.by === me ? "You’re" : `${firstName(liveCall.by)} is`} on air</span>
              : `${tuned.length} tuned in · ${ch.sub}`}
          </small>
        </span>
        <Stack ids={tuned} size={24} max={4} />
      </button>

      {missed > 0 && <div className={r.missed}>{missed} missed while you were away · read below</div>}

      <Transcript info={info} live={live} items={items} me={me} since={opened.since} until={opened.at} now={now} />

      <div className={r.deck}>
        {mayTarget && (
          <button
            className={r.targetBtn}
            onClick={() => ui.openSheet(<TargetSheet groupId={groupId} value={talkTo} onPick={setTarget} />)}
          >
            Talk to <b>{targetLabel(info, talkTo)}</b><IconChevronDown size={13} />
          </button>
        )}
        <TalkButton groupId={groupId} target={talkTo} />
        <small className={r.deckHint}>Transcribed live, with who said it · double-tap an earbud to talk</small>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The round Radio button for a chat's header
--------------------------------------------------------------------------- */

export function RadioButton({ groupId, onOpen }: { groupId: string; onOpen: () => void }) {
  const { info, live, me } = useOperation(groupId);
  const now = useNow(5_000);
  if (!info?.operation || !live) return null;
  const missed = missedCalls(info, live, me);
  const airing = live.radio.tx.find((t) => onAir(t, now) && t.by !== me && reaches(info, live, t, me));
  const label = airing ? `Radio: ${firstName(airing.by)} is on air` : missed ? `Radio: ${missed} missed` : "Radio";
  return (
    <button className={`${r.radioBtn} ${styles.glass} ${airing ? r.radioBtnLive : ""}`} onClick={onOpen} aria-label={label} title="Radio">
      <IconWalkie size={20} />
      {missed > 0 && <i className={r.badge} aria-hidden="true">{missed > 99 ? "99+" : missed}</i>}
    </button>
  );
}
