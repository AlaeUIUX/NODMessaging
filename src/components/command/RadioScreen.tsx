"use client";

import { useEffect, useRef, useState } from "react";
import { Segmented, Sheet } from "@/components/chat/ui";
import { IconBack, IconCheck, IconChevronDown, IconMic, IconWalkie } from "@/components/chat/Icons";
import { canCommand, clock, CREWS, crewOf, firstName, person, type CrewId, type OpState } from "./data";
import * as op from "./store";
import { Av, Stack, useUi } from "./parts";
import {
  channelLabel, channelOf, channels, listeners, reachCount, reaches, sampleLine, targetLabel,
  type Channel, type ChannelId, type Target, type Transmission,
} from "./radio";
import c from "./command.module.css";

/* ---------------------------------------------------------------------------
   Dictation: the browser's speech engine when there is one; when there
   isn't (or the mic is blocked), a sample line types itself out so the
   demo still shows what a transcript looks like.
--------------------------------------------------------------------------- */

interface Recognition {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
}
const engine = () => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

function useDictation() {
  const rec = useRef<Recognition | null>(null);
  const text = useRef("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const failed = useRef(false);

  const simulate = (line: string, onText: (t: string) => void) => {
    const words = line.split(" ");
    words.forEach((_, i) => timers.current.push(setTimeout(() => { text.current = words.slice(0, i + 1).join(" "); onText(text.current); }, 260 + i * 230)));
  };

  const start = (sample: string, onText: (t: string) => void) => {
    text.current = "";
    failed.current = false;
    const Engine = engine();
    if (!Engine) { simulate(sample, onText); return; }
    try {
      const r = new Engine();
      r.continuous = true;
      r.interimResults = true;
      r.lang = "en-US";
      let finals = "";
      r.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const piece = e.results[i][0].transcript;
          if (e.results[i].isFinal) finals += piece; else interim += piece;
        }
        text.current = (finals + interim).trim();
        onText(text.current);
      };
      // No mic, no permission, no network: fall back to the sample.
      r.onerror = () => { if (!text.current) { failed.current = true; simulate(sample, onText); } };
      r.onend = null;
      r.start();
      rec.current = r;
    } catch {
      simulate(sample, onText);
    }
  };

  /** Stops listening; resolves with what was said (or the sample, if nothing was heard). */
  const stop = (sample: string) =>
    new Promise<{ text: string; voice: boolean }>((resolve) => {
      const r = rec.current;
      rec.current = null;
      const finish = () => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        const heard = text.current.trim();
        resolve(heard && !failed.current && r ? { text: heard, voice: true } : { text: heard || sample, voice: false });
      };
      if (r) { r.onend = finish; try { r.stop(); } catch { finish(); } setTimeout(finish, 900); }
      else finish();
    });

  useEffect(() => () => { timers.current.forEach(clearTimeout); try { rec.current?.stop(); } catch { /* gone */ } }, []);
  return { start, stop };
}

/* ---------------------------------------------------------------------------
   The push-to-talk button: hold (or tap, hands busy) to talk.
--------------------------------------------------------------------------- */

export function TalkButton({ s, target, size = "lg" }: { s: OpState; target: Target; size?: "lg" | "sm" }) {
  const ui = useUi();
  const me = ui.me;
  const dict = useDictation();
  const [txId, setTxId] = useState<string | null>(null);
  const [mode, setMode] = useState<"hold" | "tap">("hold");
  const ending = useRef(false);
  const command = canCommand(me);
  const busy = s.radio.tx.find((t) => t.live && t.by !== me && reaches(s, t, me));
  const blocked = !!busy && !command;
  const chan: Channel = channelOf(s, target.channel ?? (target.crews?.length ? `crew:${target.crews[0]}` : target.zones?.length ? `zone:${target.zones[0]}` : target.all ? "all" : "command"));
  const sample = sampleLine(target.all ? channelOf(s, "all") : chan);
  const reach = reachCount(s, target, me);

  const begin = () => {
    if (txId || blocked) return;
    ending.current = false;
    const id = op.keyUp(me, target);
    setTxId(id);
    dict.start(sample, (t) => op.onAir(id, t));
  };
  const end = async () => {
    if (!txId || ending.current) return;
    ending.current = true;
    const id = txId;
    const { text } = await dict.stop(sample);
    op.keyDown(id, text);
    setTxId(null);
  };

  const talking = !!txId;
  const label = talking ? "Release to send" : blocked ? `${firstName(busy!.by)} is talking…` : busy ? "Hold to break in" : mode === "hold" ? "Hold to talk" : "Tap to talk";
  return (
    <div className={`${c.ptt} ${size === "sm" ? c.pttSm : ""}`}>
      <button
        className={`${c.pttBtn} ${talking ? c.pttLive : ""} ${busy && !talking ? c.pttRx : ""}`}
        disabled={blocked}
        aria-pressed={talking}
        aria-label={label}
        onPointerDown={(e) => { if (mode !== "hold") return; e.currentTarget.setPointerCapture(e.pointerId); begin(); }}
        onPointerUp={() => mode === "hold" && end()}
        onPointerCancel={() => mode === "hold" && end()}
        onClick={() => { if (mode === "tap") { if (talking) end(); else begin(); } }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className={c.pttRing} /><span className={c.pttRing} /><span className={c.pttRing} />
        <span className={c.pttCore}>
          {busy && !talking ? <Av id={busy.by} size={size === "sm" ? 34 : 56} /> : <IconMic size={size === "sm" ? 24 : 36} />}
        </span>
      </button>
      <div className={c.pttMeta}>
        <b>{label}</b>
        <small>{talking ? `On air · ${reach} hear you` : `${targetLabel(s, target)} · ${reach} ${reach === 1 ? "person" : "people"}`}</small>
        {size === "lg" && (
          <span className={c.pttMode}><Segmented value={mode} onChange={setMode} options={[{ id: "hold", label: "Hold" }, { id: "tap", label: "Tap" }]} /></span>
        )}
      </div>
    </div>
  );
}

/* ---- the transcript ---- */

function Wave({ n = 14 }: { n?: number }) {
  return <span className={c.wave} aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</span>;
}

export function Transcript({ s, items, me, divider, showChannel }: { s: OpState; items: Transmission[]; me: string; divider?: number; showChannel?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  const last = items[items.length - 1];
  // Follow the newest words, inside the transcript's own scroller only (never the page).
  useEffect(() => {
    let box = end.current?.parentElement ?? null;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (box && box !== document.documentElement && box !== document.body) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [items.length, last?.text]);
  const myChannel = s.radio.joined[me];
  const firstMissed = divider ? items.find((t) => t.at > divider && t.by !== me)?.id : undefined;
  return (
    <div className={c.tlist}>
      {items.map((t) => {
        const p = person(t.by);
        const via = t.target.all ? "All-call" : t.target.channel && t.target.channel !== myChannel ? channelLabel(s, t.target.channel) : t.target.zones?.length ? `Zone ${t.target.zones.map((z) => z.toUpperCase()).join(", ")}` : t.target.crews?.length ? t.target.crews.map((x) => crewOf(x).name).join(", ") : null;
        const mark = t.id === firstMissed;
        const id = speakerId(s, t.by);
        return (
          <div key={t.id}>
            {mark && <div className={c.tDivider}><span>Missed while you were away</span></div>}
            <article className={`${c.tx} ${t.live ? c.txLive : ""} ${t.by === me ? c.txMine : ""} ${t.target.all ? c.txAll : ""}`}>
              <header className={c.txHead}>
                <span className={c.txAv}>
                  <Av id={t.by} size={38} />
                  <span className={c.txAvCode} title={id.where}>{id.code}</span>
                </span>
                <span className={c.txWho}>
                  <span className={c.txName}>
                    <b>{t.by === me ? `You · ${p.name}` : p.name}</b>
                    <time>{t.live ? <span className={c.txOnAir}>● On air</span> : clock(t.at)}</time>
                  </span>
                  <span className={c.txRole}>
                    <span className={c.txWhere}>{id.where}</span>
                    <span>{id.role}</span>
                    <span className={c.txCrew}><i className={c.crewDot} style={{ background: crewOf(p.crew).color }} />{crewOf(p.crew).name}</span>
                  </span>
                </span>
              </header>
              <p className={c.txText}>
                {t.text || (t.live ? <span className={c.txListening}>Listening…</span> : "")}
                {t.live && <span className={c.caret} />}
              </p>
              {t.live && <Wave n={22} />}
              <footer className={c.txFoot}>
                <span className={`${c.txVia} ${t.target.all ? c.txViaAll : ""}`}>{showChannel || via ? (showChannel ? targetLabel(s, t.target) : via) : `${channelLabel(s, myChannel)}`}</span>
                {t.by !== me && <span className={c.voiceId} title="Speaker recognised by voice">Voice ID · {firstName(t.by)}</span>}
                {t.source === "voice" && t.by === me && <span className={c.voiceId}>Dictated</span>}
              </footer>
            </article>
          </div>
        );
      })}
      {!items.length && <p className={c.empty}>Quiet on this channel. Hold the button to talk.</p>}
      <div ref={end} />
    </div>
  );
}

/** Who is talking, beyond a first name: where they are and what they do there. */
function speakerId(s: OpState, userId: string) {
  const p = person(userId);
  const zone = s.zones.find((z) => z.id === s.presence[userId]?.zoneId);
  const leads = s.zones.find((z) => z.leadId === userId);
  if (p.crew === "command") return { code: "CMD", where: "Command", role: p.title ?? "Command" };
  return {
    code: zone?.code ?? "—",
    where: zone ? `${zone.code} · ${zone.name}` : "Not checked in",
    role: leads ? `${leads.code} lead` : "Crew",
  };
}

export const missedFor = (s: OpState, me: string) =>
  s.radio.tx.filter((t) => !t.live && t.by !== me && t.at > (s.radio.seen[me] ?? 0) && reaches(s, t, me)).length;

/* ---- picking where to talk ---- */

export function ChannelSheet({ s, onPick }: { s: OpState; onPick: (id: ChannelId) => void }) {
  const ui = useUi();
  const me = ui.me;
  const list = channels(s).filter((ch) => ch.kind !== "all" && (ch.kind !== "command" || canCommand(me) || s.zones.some((z) => z.leadId === me)));
  const groups: [string, Channel[]][] = [["Command", list.filter((x) => x.kind === "command")], ["Crews", list.filter((x) => x.kind === "crew")], ["Zones", list.filter((x) => x.kind === "zone")]];
  return (
    <Sheet title="Channels" onClose={() => ui.sheet(null)}>
      {(close) => (
        <>
          <p className={c.sheetHint}>One channel at a time, like a walkie. All-call and Command overrides always come through.</p>
          {groups.filter(([, g]) => g.length).map(([name, g]) => (
            <div key={name} className={c.chGroup}>
              <div className={c.label}>{name}</div>
              {g.map((ch) => {
                const live = s.radio.tx.find((t) => t.live && t.target.channel === ch.id);
                const on = s.radio.joined[me] === ch.id;
                const here = s.presence[me]?.zoneId && ch.id === `zone:${s.presence[me].zoneId}`;
                return (
                  <button key={ch.id} className={`${c.chRow} ${on ? c.chOn : ""}`} onClick={() => close(() => onPick(ch.id))}>
                    <span className={c.chCode} style={{ ["--ch" as string]: ch.color }}>{ch.short}</span>
                    <span className={c.pickMain}>
                      <b>{ch.name}{here ? " · you’re here" : ""}</b>
                      <small>{live ? <span className={c.chLive}>● {firstName(live.by)} talking</span> : `${listeners(s, ch.id).length} tuned in · ${ch.sub}`}</small>
                    </span>
                    {on ? <IconCheck size={16} /> : <Stack ids={listeners(s, ch.id)} size={20} max={3} />}
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

/** Command and leads can talk past their channel: to zones, to crews, or to everyone. */
export function TargetSheet({ s, value, onPick }: { s: OpState; value: Target; onPick: (t: Target) => void }) {
  const ui = useUi();
  const command = canCommand(ui.me);
  const [kind, setKind] = useState<"channel" | "zones" | "crews" | "all">(value.all ? "all" : value.zones ? "zones" : value.crews ? "crews" : "channel");
  const [zones, setZones] = useState<string[]>(value.zones ?? []);
  const [crews, setCrews] = useState<CrewId[]>(value.crews ?? []);
  const tog = <T,>(l: T[], v: T) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const joined = s.radio.joined[ui.me];
  const next: Target = kind === "all" ? { all: true } : kind === "zones" ? { zones } : kind === "crews" ? { crews } : { channel: value.channel ?? joined };
  const ok = kind === "all" || kind === "channel" || (kind === "zones" ? zones.length : crews.length);
  const opts = [{ id: "channel" as const, label: "Channel" }, { id: "zones" as const, label: "Zones" }, { id: "crews" as const, label: "Roles" }, ...(command ? [{ id: "all" as const, label: "Everyone" }] : [])];
  return (
    <Sheet title="Talk to" onClose={() => ui.sheet(null)} action={{ label: "Done", disabled: !ok, onClick: () => onPick(next) }}>
      <Segmented value={kind} onChange={setKind} options={opts} />
      {kind === "channel" && <p className={c.sheetHint}>Everyone tuned to {channelLabel(s, value.channel ?? joined)} hears you.</p>}
      {kind === "zones" && <>
        <p className={c.sheetHint}>Whoever is checked in there hears you, whatever channel they’re on.</p>
        <div className={c.codes}>{s.zones.map((z) => <button key={z.id} className={zones.includes(z.id) ? c.codeOn : undefined} onClick={() => setZones(tog(zones, z.id))}>{z.code} · {z.name}</button>)}</div>
      </>}
      {kind === "crews" && <>
        <p className={c.sheetHint}>Everyone in the role hears you, wherever they are.</p>
        <div className={c.codes}>{CREWS.filter((x) => x.id !== "command").map((x) => <button key={x.id} className={crews.includes(x.id) ? c.codeOn : undefined} onClick={() => setCrews(tog(crews, x.id))}>{x.name}</button>)}</div>
      </>}
      {kind === "all" && <p className={c.criticalNote}>All-call: breaks into every channel on site.</p>}
      <div className={c.field}><span>Reaches</span><b className={c.fieldVal}>{reachCount(s, next, ui.me)} people now</b></div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   The Radio screen on a phone
--------------------------------------------------------------------------- */

export function RadioScreen({ s, onBack }: { s: OpState; onBack: () => void }) {
  const ui = useUi();
  const me = ui.me;
  const joined = s.radio.joined[me] ?? "command";
  const ch = channelOf(s, joined);
  const [since] = useState(() => s.radio.seen[me] ?? 0);
  const [target, setTarget] = useState<Target | null>(null);
  const mayTarget = canCommand(me) || s.zones.some((z) => z.leadId === me);
  const items = s.radio.tx.filter((t) => t.target.channel === joined || (t.target.channel !== joined && reaches(s, t, me))).slice(-60);
  const tuned = listeners(s, joined);
  const live = s.radio.tx.find((t) => t.live && reaches(s, t, me));
  const missed = s.radio.tx.filter((t) => t.at > since && t.by !== me && reaches(s, t, me) && !t.live).length;

  // Looking at the radio counts as having heard it.
  useEffect(() => { op.radioSeen(me); }, [me, s.radio.tx.length]);

  const pick = (id: ChannelId) => { op.tune(me, id); setTarget(null); ui.toast(`Tuned to ${channelLabel(s, id)}`); };
  const talkTo: Target = target ?? { channel: joined };
  return (
    <div className={`${c.page} ${c.radio}`}>
      <header className={c.navBar}>
        <button className={c.backBtn} onClick={onBack}><IconBack size={20} />Back</button>
        <span className={c.navTitle}><b className={c.radioTitle}><IconWalkie size={17} />Radio</b><small><i className={c.liveDot} />Live · Earbuds connected</small></span>
        <span />
      </header>
      <button className={c.chCard} onClick={() => ui.sheet(<ChannelSheet s={s} onPick={pick} />)}>
        <span className={c.chCodeLg} style={{ ["--ch" as string]: ch.color }}>{ch.short}</span>
        <span className={c.pickMain}>
          <b>{ch.name}<IconChevronDown size={14} /></b>
          <small>{live ? <span className={c.chLive}>● {live.by === me ? "You’re" : `${firstName(live.by)} is`} on air</span> : `${tuned.length} tuned in · ${ch.sub}`}</small>
        </span>
        <Stack ids={tuned} size={24} max={4} />
      </button>
      {missed > 0 && <div className={c.missed}>{missed} missed while you were away · read below</div>}
      <div className={`${c.scroll} ${c.tscroll}`}>
        <Transcript s={s} items={items} me={me} divider={since} />
      </div>
      <div className={c.deck}>
        {mayTarget && (
          <button className={c.targetBtn} onClick={() => ui.sheet(<TargetSheet s={s} value={talkTo} onPick={setTarget} />)}>
            Talk to <b>{targetLabel(s, talkTo)}</b><IconChevronDown size={13} />
          </button>
        )}
        <TalkButton s={s} target={talkTo} />
        <small className={c.deckHint}>Transcribed live, with who said it · double-tap an earbud to talk</small>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The display's Radio panel: every channel at a glance, one transcript, one
   button that can reach any channel, zone, role or everyone.
--------------------------------------------------------------------------- */

export function RadioMonitor({ s }: { s: OpState }) {
  const ui = useUi();
  const [view, setView] = useState<ChannelId | "every">("every");
  const [target, setTarget] = useState<Target>({ all: true });
  const items = (view === "every" ? s.radio.tx : s.radio.tx.filter((t) => t.target.channel === view || t.target.all)).slice(-40);
  const list = channels(s).filter((x) => x.kind !== "all");
  return (
    <div className={c.monitor}>
      <div className={c.monChannels}>
        <button className={view === "every" ? c.monOn : undefined} onClick={() => setView("every")}><b>All channels</b><small>{s.radio.tx.filter((t) => ui.now - t.at < 10 * 60_000).length} in 10 min</small></button>
        {list.map((ch) => {
          const live = s.radio.tx.find((t) => t.live && (t.target.channel === ch.id));
          return (
            <button key={ch.id} className={`${view === ch.id ? c.monOn : ""} ${live ? c.monLive : ""}`} onClick={() => { setView(ch.id); setTarget({ channel: ch.id }); }}>
              <span className={c.chCode} style={{ ["--ch" as string]: ch.color }}>{ch.short}</span>
              <small>{live ? `● ${firstName(live.by)}` : `${listeners(s, ch.id).length} tuned`}</small>
            </button>
          );
        })}
      </div>
      <div className={c.monTranscript}><Transcript s={s} items={items} me={ui.me} showChannel /></div>
      <div className={c.monDeck}>
        <button className={c.targetBtn} onClick={() => ui.sheet(<TargetSheet s={s} value={target} onPick={setTarget} />)}>Talk to <b>{targetLabel(s, target)}</b><IconChevronDown size={13} /></button>
        <TalkButton s={s} target={target} size="sm" />
      </div>
    </div>
  );
}
