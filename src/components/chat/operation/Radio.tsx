"use client";

import { useEffect, useRef, useState } from "react";
import { IconAlert, IconBack, IconCheck, IconChevronDown, IconMic, IconWalkie } from "@/components/chat/Icons";
import StatusBar from "@/components/chat/StatusBar";
import { getPermission, Segmented, Sheet, smooth, useChatUi, useDialog, useNow } from "@/components/chat/ui";
import styles from "@/components/chat/chat.module.css";
import { canDictate, useDictation } from "@/lib/chat/dictation";
import { micAccess, micGranted } from "@/lib/chat/mic";
import { listen as listenOnDevice, prepare as prepareDictation, sttStatus, useSttStatus } from "@/lib/chat/stt";
import { isAdmin } from "@/lib/chat/groups";
import {
  canBroadcast, clock, crewOf, isCommand, joinedChannel, leadsZone, listeners, missedCalls, NO_CHANNEL, radioChannel, radioChannels,
  radioLabel, reachCount, reaches, sampleLine, targetLabel, zoneById,
  type ChannelId, type OpLive, type RadioChannel, type Target, type Transmission,
} from "@/lib/chat/operation";
import { opDispatch, opLive } from "@/lib/chat/opstore";
import { userById } from "@/lib/chat/store";
import type { GroupInfo } from "@/lib/chat/types";
import { Av, CrewDot } from "./kit";
import { LiveWave } from "./OnAir";
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

/** Why dictation stopped, in words a person can act on. */
const MIC_TROUBLE: Record<string, string> = {
  "not-allowed": "The browser blocked the microphone. Allow it from the address bar, then try again",
  "service-not-allowed": "This browser won’t let the page use speech recognition. Try Chrome or Edge",
  "audio-capture": "No microphone found on this device",
  network: "Dictation needs an internet connection (the browser’s speech service is online)",
  "language-not-supported": "Dictation doesn’t support this language here",
};

/** A call still "on air" after this long lost its sender (a tab closed mid-call): treat it as over. */
const DROPPED = 2 * 60_000;
const onAir = (t: Transmission, now: number) => !!t.live && now - t.at < DROPPED;
const firstName = (id: string) => userById(id).name;

/* ---------------------------------------------------------------------------
   Small parts
--------------------------------------------------------------------------- */

/** A channel's square tile, as in the Operation's drawer: ink for a zone and Command, quiet for a crew, red for All-call. */
function ChannelTile({ ch, size = "sm" }: { ch: RadioChannel; size?: "sm" | "lg" }) {
  return (
    <span
      className={`${size === "lg" ? r.chCodeLg : r.chCode} ${ch.kind === "crew" ? r.chCrew : ""} ${ch.kind === "all" ? r.chAll : ""}`}
      aria-hidden="true"
    >
      {ch.short}
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
                {airing && <LiveWave className={r.txWave} bars={32} mic={t.by === me && t.source === "voice"} words={t.text} />}
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
              <div className={r.label}>{name}<em>{g.length}</em></div>
              {g.map((ch) => {
                const talking = live.radio.tx.find((t) => onAir(t, now) && t.target.channel === ch.id);
                const on = joined === ch.id;
                const here = !!hereZone && ch.id === `zone:${hereZone}`;
                const tuned = listeners(info, live, members, ch.id);
                return (
                  <button key={ch.id} className={`${r.chRow} ${on ? r.chOn : ""}`} aria-pressed={on} onClick={() => close(() => onPick(ch.id))}>
                    <ChannelTile ch={ch} />
                    <span className={r.pickMain}>
                      <b>{ch.name}</b>
                      <small>{here ? "You’re here" : ch.kind === "zone" ? ch.sub.split(" · ").slice(1).join(" · ") || ch.sub : ch.sub}</small>
                    </span>
                    <span className={r.chEnd}>
                      {talking
                        ? <span className={r.chLive}>● {talking.by === me ? "You" : firstName(talking.by)}</span>
                        : <span className={r.chCount}><b>{tuned.length}</b> tuned</span>}
                      {on && <IconCheck size={16} />}
                    </span>
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
  // What the mic is doing while on air: open, or actually picking up a voice.
  const [ear, setEar] = useState<"listening" | "hearing" | null>(null);
  const [voiceCall, setVoiceCall] = useState(false);
  // The thumb is on the button (hold mode): a press that had to wait for the mic only goes on air if it still is.
  const held = useRef(false);
  // Ended by a mic or service error: that message stands, not "didn’t catch that".
  const troubled = useRef(false);
  // The call on air, for handlers (state lags a render behind a fast press and release).
  const txRef = useRef<string | null>(null);
  const said = useRef<{ text: string; source: Transmission["source"] }>({ text: "", source: "voice" });
  const ending = useRef(false);
  const asking = useRef(false);
  // The on-device listen while it runs (null: the browser's engine has the call, or none).
  const device = useRef<{ stop: () => Promise<string> } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const stt = useSttStatus();

  // Leaving the radio mid-call ends the call with what was said so far: the screen closing, the tab going
  // away, or (in hold mode) the thumb losing the button while something takes focus or the app goes behind.
  useEffect(() => {
    const drop = () => {
      const id = txRef.current;
      if (!id) return;
      txRef.current = null;
      // Let the mic go too; the words so far are what went out.
      void device.current?.stop();
      device.current = null;
      opDispatch(groupId, { t: "radio.release", id, text: said.current.text, at: Date.now(), source: said.current.source });
    };
    const ifHidden = () => { if (document.visibilityState === "hidden") drop(); };
    window.addEventListener("pagehide", drop);
    window.addEventListener("blur", drop);
    document.addEventListener("visibilitychange", ifHidden);
    return () => {
      window.removeEventListener("pagehide", drop);
      window.removeEventListener("blur", drop);
      document.removeEventListener("visibilitychange", ifHidden);
      drop();
    };
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
    const listen = voice && canDictate();
    const source: Transmission["source"] = listen ? "voice" : "sample";
    const id = act.keyUp(target, source);
    txRef.current = id;
    said.current = { text: "", source };
    setTxId(id);
    setEar(null);
    setVoiceCall(listen);
    const words = (text: string) => { if (txRef.current !== id) return; said.current.text = text; act.words(id, text); };
    const browserEngine = () => dict.start(sample, words, {
      listen,
      // The device model was tried first, here; this is the browser's engine only.
      onDevice: false,
      onState: setEar,
      // The mic or the speech service failed: say why, and end the call with whatever was heard.
      onError: (code) => { troubled.current = true; ui.toast(MIC_TROUBLE[code] ?? "Dictation stopped"); void end(); },
      onEnd: () => { void end(); },
    });
    if (!listen || sttStatus().state === "failed") { browserEngine(); return; }
    // On the device: the words are worked out from the mic's own sound, as it comes in.
    setEar("listening");
    void listenOnDevice(words, () => { if (txRef.current === id) setEar("hearing"); }).then((h) => {
      if (txRef.current !== id) { void h?.stop(); return; }
      if (h) device.current = h;
      else browserEngine();
    });
  };

  /** The browser's own mic permission, settled before going on air (its prompt can't wait mid-call). */
  const browserMic = async () => {
    asking.current = true;
    const access = await micAccess();
    asking.current = false;
    if (access !== "granted") ui.toast(access === "missing" ? "No microphone found on this device" : "The browser blocked the microphone. Allow it from the address bar, then try again");
    return access === "granted";
  };

  const press = async () => {
    if (txRef.current || blocked || asking.current) return;
    const perm = getPermission("microphone");
    if (perm === "prompt") {
      // The first time, the phone asks, then the browser; the press itself doesn't go on air.
      asking.current = true;
      const granted = await ui.ask("microphone");
      asking.current = false;
      const real = granted && canDictate() && await browserMic();
      if (mode === "tap") begin(real);
      else if (real) ui.toast("Microphone on · hold to talk");
      return;
    }
    // Said no to the phone's prompt, or a browser that can't dictate: a sample line goes out, so the demo still works.
    if (perm !== "granted" || !canDictate()) {
      if (perm === "granted") ui.toast("This browser can’t dictate. Try Chrome or Edge; sending a sample line");
      begin(false);
      return;
    }
    if (!(await micGranted())) {
      // Not yet allowed in the browser: ask now, and go on air with the next press.
      if (await browserMic() && mode === "tap") begin(true);
      else if (mode === "hold") ui.toast("Microphone on · hold to talk");
      return;
    }
    if (mode === "hold" && !held.current) return;
    begin(true);
  };

  const end = async () => {
    held.current = false;
    const id = txRef.current;
    if (!id || ending.current) return;
    ending.current = true;
    let text: string;
    let voice: boolean;
    const h = device.current;
    device.current = null;
    if (h) {
      // The last words: the model hears the whole call once more (still downloading: as soon as it's here).
      setFinishing(true);
      text = await h.stop();
      voice = true;
      setFinishing(false);
    } else {
      ({ text, voice } = await dict.stop(sample));
    }
    // Nothing heard: the call goes away, and nothing anyone didn't say goes out.
    if (voice && !text && !troubled.current) ui.toast("Didn’t catch that. Nothing was sent");
    troubled.current = false;
    act.release(id, text, voice ? "voice" : "sample");
    txRef.current = null;
    setTxId(null);
    setEar(null);
  };

  const label = talking
    ? mode === "hold" ? "Release to send" : "Tap to send"
    : blocked ? `${firstName(busy!.by)} is talking…`
      : busy ? (mode === "hold" ? "Hold to break in" : "Tap to break in")
        : mode === "hold" ? "Hold to talk" : "Tap to talk";
  const readying = stt.state === "loading" ? `Getting dictation ready · ${Math.round(stt.progress * 100)}%` : null;
  const sub = finishing
    ? readying ?? "Writing it down…"
    : talking
    ? voiceCall
      ? readying ? `${readying} · keep talking` : ear === "hearing" ? `Hearing you · ${reach} hear you` : ear === "listening" ? "Listening… start talking" : "Opening the mic…"
      : `On air · ${reach} hear you`
    : `${targetLabel(info, target)} · ${reach} ${reach === 1 ? "person" : "people"}`;

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
          held.current = true;
          void press();
        }}
        onPointerUp={() => { if (mode === "hold") void end(); }}
        onPointerCancel={() => { if (mode === "hold") void end(); }}
        onLostPointerCapture={() => { if (mode === "hold") void end(); }}
        onBlur={() => { if (mode === "hold") void end(); }}
        onClick={() => { if (mode === "tap") void (txRef.current ? end() : press()); }}
        onKeyDown={(e) => {
          if (mode !== "hold" || (e.key !== " " && e.key !== "Enter")) return;
          e.preventDefault();
          if (!e.repeat) { held.current = true; void press(); }
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
    prepareDictation();
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
  // No crew, no zone, not Command: nowhere to listen until they pick somewhere.
  const untuned = joined === NO_CHANNEL;
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

      <button className={r.chCard} onClick={() => ui.openSheet(<ChannelSheet groupId={groupId} onPick={pick} />)} aria-label={untuned ? "Pick a channel" : `Channel: ${radioLabel(info, joined)}. Change channel`}>
        {untuned ? (
          <>
            <span className={r.chCodeLg}><IconWalkie size={20} /></span>
            <span className={r.pickMain}>
              <b className={r.chName}>Pick a channel<IconChevronDown size={14} /></b>
              <small>You’re not on a crew or in a zone yet. Choose where to listen and talk.</small>
            </span>
          </>
        ) : (
          <>
            <ChannelTile ch={ch} size="lg" />
            <span className={r.pickMain}>
              <b className={r.chName}>{ch.name}<IconChevronDown size={14} /></b>
              <small>
                {liveCall
                  ? <span className={r.chLive}>● {liveCall.by === me ? "You’re" : `${firstName(liveCall.by)} is`} on air</span>
                  : `${tuned.length} tuned in · ${ch.sub}`}
              </small>
            </span>
          </>
        )}
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
        {untuned && !target ? (
          <button className={r.targetBtn} onClick={() => ui.openSheet(<ChannelSheet groupId={groupId} onPick={pick} />)}>
            Pick a channel to talk
          </button>
        ) : (
          <TalkButton groupId={groupId} target={talkTo} />
        )}
        <DictationNote />
      </div>
    </div>
  );
}

/** Under the talk button: how calls are written down, and whether that's ready yet. */
function DictationNote() {
  const stt = useSttStatus();
  const text = stt.state === "loading"
    ? `Getting dictation ready on this device · ${Math.round(stt.progress * 100)}% (once)`
    : stt.state === "ready"
      ? "Dictated on this device as you talk · nothing leaves the phone"
      : "Transcribed live, with who said it · double-tap an earbud to talk";
  return <small className={r.deckHint}>{text}</small>;
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
