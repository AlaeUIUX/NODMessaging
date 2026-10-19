"use client";

import { useState } from "react";
import Avatar from "@/components/chat/Avatar";
import { Segmented, Sheet, Toggle } from "@/components/chat/ui";
import {
  IconAlert, IconBack, IconBoard, IconCalendar, IconMegaphone, IconWalkie, IconChevron, IconCloud, IconCompose, IconDevice, IconLocation, IconPlus, IconQr, IconSearch, IconSettings,
} from "@/components/chat/Icons";
import {
  ago, canCommand, clock, firstName, here, onSite, openTasksIn, pendingRequests, person, SHIFTS, staffing, zoneOf,
  type OpState,
} from "./data";
import * as op from "./store";
import {
  Av, BroadcastBanner, BroadcastItem, Code, FloorMap, RequestCard, RequestSheet, ScanSheet, StatusChip, TaskRow, TaskSheet, useUi, WhereCard, WhoHere, ZoneTile,
  AssignSheet, readRate,
} from "./parts";
import { BroadcastComposer, FeedList } from "./Console";
import { missedFor } from "./RadioScreen";
import c from "./command.module.css";

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------------------------------------------------------------------------
   Inbox: the Operation sits with the other chats, with its live strip.
--------------------------------------------------------------------------- */

export function Inbox({ s, onOpen }: { s: OpState; onOpen: () => void }) {
  const ui = useUi();
  const me = ui.me;
  const where = zoneOf(s, s.presence[me]?.zoneId);
  const pending = pendingRequests(s).length;
  const unread = s.broadcasts.filter((b) => !b.acks[me]).length;
  const others = [
    { name: "Rima", glyph: "R", tone: "clay" as const, text: "Can you send me the run sheet for tomorrow?", time: "15:58", hide: me === "reema" },
    { name: "Design team", glyph: "DT", tone: "denim" as const, text: "Charles: pushed the new icons", time: "15:41", group: true },
    { name: "Riyadh Season crew", glyph: "RS", tone: "ochre" as const, text: "Huda: see you all at 7", time: "14:12", group: true },
    { name: "Charles", glyph: "C", tone: "denim" as const, text: "👍", time: "Yesterday" },
  ].filter((x) => !x.hide);
  return (
    <div className={c.page}>
      <header className={c.largeHead}>
        <div className={c.headRow}>
          <span className={c.headBtn}><IconSearch size={20} /></span>
          <button className={c.headBtn} onClick={() => ui.sheet(<NewOperationSheet onDone={onOpen} />)} aria-label="New"><IconCompose size={20} /></button>
        </div>
        <h1>Chats</h1>
      </header>
      <div className={c.inboxList}>
        <button className={`${c.inboxRow} ${c.inboxOp}`} onClick={onOpen}>
          <span className={c.opBadge}>EWC</span>
          <span className={c.inboxMain}>
            <span className={c.inboxTop}><b>{s.name}</b><small>now</small></span>
            <span className={c.liveStrip}><i className={c.liveDot} />Day {s.day} · {s.shift === "evening" ? "Evening" : "Morning"} · {onSite(s)} on site{pending ? ` · ${pending} requests` : ""}</span>
            {!canCommand(me) && (
              <span className={c.inboxWhere}><IconLocation size={13} />{where ? `You’re in ${where.code} · ${where.name}` : "Not checked in"}</span>
            )}
          </span>
          {unread > 0 && <span className={c.unread}>{unread}</span>}
        </button>
        {others.map((o) => (
          <button key={o.name} className={c.inboxRow} onClick={() => (o.name === "Riyadh Season crew" ? ui.sheet(<GroupSettingsSheet name={o.name} onDone={onOpen} />) : ui.toast("Just the Command demo here"))}>
            <Avatar glyph={o.glyph} tone={o.tone} size={52} />
            <span className={c.inboxMain}>
              <span className={c.inboxTop}><b>{o.name}</b><small>{o.time}</small></span>
              <span className={c.inboxText}>{o.text}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---- creating an Operation ---- */

const TEMPLATES = {
  esports: { name: "Esports venue", zones: ["A1 Main Arena", "A2 Player Lounge", "B1 Broadcast Studio", "B2 Stage B", "C1 Gate 3 · Entrance", "C2 Merch Store", "D1 Media Room", "D2 VIP Lounge"], crews: ["Command", "AV & Broadcast", "Security", "Hospitality", "Runners"] },
  conference: { name: "Conference", zones: ["A1 Main Hall", "A2 Breakout 1", "A3 Breakout 2", "B1 Registration", "B2 Expo Floor", "C1 Speaker Room"], crews: ["Command", "AV", "Registration", "Hospitality"] },
  blank: { name: "Blank", zones: [], crews: ["Command"] },
} as const;

export function NewOperationSheet({ onDone, startAsOp }: { onDone: () => void; startAsOp?: boolean }) {
  const ui = useUi();
  const [kind, setKind] = useState<"group" | "operation">(startAsOp ? "operation" : "group");
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("EWC 2026 · Riyadh");
  const [venue, setVenue] = useState("Boulevard Riyadh City");
  const [tpl, setTpl] = useState<keyof typeof TEMPLATES>("esports");
  const t = TEMPLATES[tpl];
  if (step === 2) {
    return (
      <Sheet title="Zone template" onClose={() => ui.sheet(null)} onBack={() => ui.sheet(<NewOperationSheet onDone={onDone} startAsOp />)}
        action={{ label: "Create", onClick: () => { ui.toast(`${name} is live · ${t.zones.length} zones`); onDone(); } }}>
        <p className={c.sheetHint}>Creates zones, crews and a channel per zone in one go. Everything can be edited later.</p>
        <div className={c.tplList}>
          {(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((k) => (
            <button key={k} className={`${c.tpl} ${tpl === k ? c.tplOn : ""}`} onClick={() => setTpl(k)}>
              <b>{TEMPLATES[k].name}</b>
              <small>{TEMPLATES[k].zones.length ? `${TEMPLATES[k].zones.length} zones · ${TEMPLATES[k].crews.length} crews` : "Start empty"}</small>
            </button>
          ))}
        </div>
        {t.zones.length > 0 && <>
          <div className={c.label}>Zones and channels</div>
          <div className={c.tplZones}>
            {t.zones.map((z) => { const [code, ...rest] = z.split(" "); return <span key={z}><b>{code}</b>{rest.join(" ")}<small>#{rest.join("-").toLowerCase().replace(/[^a-z0-9-]/g, "")}</small></span>; })}
          </div>
        </>}
        <div className={c.label}>Crews (roles)</div>
        <div className={c.tplCrews}>{t.crews.map((x) => <span key={x}>{x}</span>)}</div>
        <p className={c.sheetHint}>Also adds <b>#broadcasts</b>, pinned at the top. Only Command can post there.</p>
      </Sheet>
    );
  }
  return (
    <Sheet
      title={kind === "operation" ? "New Operation" : "New group"}
      onClose={() => ui.sheet(null)}
      action={{ label: kind === "operation" ? "Next" : "Create", keepOpen: kind === "operation", disabled: !name.trim(), onClick: () => (kind === "operation" ? setStep(2) : ui.toast("Group created")) }}
    >
      <div className={c.label}>Kind</div>
      <Segmented value={kind} onChange={setKind} options={[{ id: "group", label: "Group" }, { id: "operation", label: "Operation" }]} />
      <p className={c.sheetHint}>{kind === "operation" ? "An Operation is a group for running a live event: zones, crews, requests, broadcasts and a Command display." : "Channels for every team, polls, boards and payments."}</p>
      <input className={c.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" data-autofocus />
      {kind === "operation" && <>
        <input className={c.input} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Venue" />
        <div className={c.field}><span><IconCalendar size={16} /> Dates</span><b className={c.fieldVal}>14 – 16 Oct · 3 days</b></div>
        <div className={c.field}><span>Shifts</span><b className={c.fieldVal}>Morning 08–16 · Evening 16–24</b></div>
      </>}
    </Sheet>
  );
}

function GroupSettingsSheet({ name, onDone }: { name: string; onDone: () => void }) {
  const ui = useUi();
  return (
    <Sheet title={name} onClose={() => ui.sheet(null)}>
      {(close) => (
        <div className={c.menu}>
          <button disabled><span className={c.menuIcon}>#</span>Channels<span className={c.menuEnd}>4</span></button>
          <button disabled><span className={c.menuIcon}>◎</span>Roles and permissions</button>
          <button onClick={() => close(() => ui.sheet(<NewOperationSheet onDone={onDone} startAsOp />))}>
            <span className={c.menuIcon}><IconLocation size={18} /></span>
            <span className={c.menuText}>Turn into an Operation<small>Adds zones, crews, requests and broadcasts. Members and channels stay.</small></span>
          </button>
        </div>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   The Operation's group page
--------------------------------------------------------------------------- */

export function OpPage({ s, onBack, onBroadcasts, onBoard, onRadio, onChannel, initialTab = "zones" }: {
  s: OpState; onBack: () => void; onBroadcasts: () => void; onBoard: () => void; onRadio: () => void; onChannel: (id: string) => void; initialTab?: "zones" | "live" | "mind";
}) {
  const ui = useUi();
  const me = ui.me;
  const command = canCommand(me);
  const [tab, setTab] = useState<"zones" | "live" | "mind">(initialTab);
  const [view, setView] = useState<"list" | "grid" | "map">("list");
  const [pin, setPin] = useState<string | null>(null);
  const pending = pendingRequests(s).length;
  const lastB = s.broadcasts[s.broadcasts.length - 1];
  const unreadNormal = command ? [] : s.broadcasts.filter((b) => b.level === "normal" && !b.acks[me]);
  const myZone = s.presence[me]?.zoneId;
  const mine = s.tasks.filter((t) => t.assignee === me && t.step !== "done");
  const muted = !!s.muted[me];
  const pinned = zoneOf(s, pin);
  return (
    <div className={c.page}>
      <header className={c.navBar}>
        <button className={c.backBtn} onClick={onBack}><IconBack size={20} />Chat</button>
        <span />
        <span className={c.navEnd}>
          {command && ui.openConsole && <button className={c.displayBtn} onClick={ui.openConsole}><IconDevice size={16} />Command display</button>}
          <button className={c.headBtn} onClick={() => ui.sheet(<OpSettings s={s} />)} aria-label="Settings"><IconSettings size={19} /></button>
        </span>
      </header>
      <div className={c.scroll}>
        <div className={c.opHero}>
          <span className={c.opBadgeLg}>EWC</span>
          <h2>{s.name}</h2>
          <p>{s.venue} · Operation{muted ? " · Muted" : ""}</p>
          <div className={c.liveStripLg}>
            <span><i className={c.liveDot} />Day {s.day} of {s.days}</span>
            <span>{s.shift === "evening" ? "Evening" : "Morning"} shift</span>
            <span><b>{onSite(s)}</b> on site</span>
            <span className={pending ? c.stripWarn : undefined}><b>{pending}</b> requests</span>
          </div>
          <div className={c.opActions}>
            <button onClick={onRadio}><IconWalkie size={20} />Radio{missedFor(s, me) > 0 && <i className={c.dotBadge}>{missedFor(s, me)}</i>}</button>
            <button onClick={onBroadcasts}><IconMegaphone size={20} />Broadcasts</button>
            <button onClick={onBoard}><IconBoard size={20} />Ops board</button>
          </div>
        </div>

        {!command && (
          <div className={c.section}>
            <WhereCard s={s} />
            <button className={c.reportLink} onClick={() => ui.sheet(<RequestSheet zoneId={myZone ?? s.zones[0].id} kind="issue" />)}>
              <IconAlert size={15} />Report an issue{myZone ? ` in ${zoneOf(s, myZone)?.code}` : ""}
            </button>
          </div>
        )}
        {unreadNormal.map((b) => <div key={b.id} className={c.section}><BroadcastBanner b={b} /></div>)}

        {lastB && (
          <button className={c.pinnedChannel} onClick={onBroadcasts}>
            <span className={c.hashLg}>📣</span>
            <span className={c.inboxMain}>
              <span className={c.inboxTop}><b>#broadcasts</b><small>{ago(ui.now - lastB.at)}</small></span>
              <span className={c.inboxText}>{lastB.text}</span>
            </span>
            <small className={c.readMini}>{readRate(s, lastB).read}/{readRate(s, lastB).aud}</small>
          </button>
        )}

        <div className={c.section}>
          <h3 className={c.h3}>Channels · {s.zones.length + 2}</h3>
          <div className={c.chanList}>
            {[{ id: "general", code: "#", name: "general", sub: "Everyone" }, ...s.zones.map((z) => ({ id: z.id, code: z.code, name: slug(z.name), sub: `${here(s, z.id).length} here · ${z.area}` }))].map((x) => {
              const last = [...s.chat].reverse().find((m) => m.zoneId === x.id);
              return (
                <button key={x.id} className={c.chanRow} onClick={() => onChannel(x.id)}>
                  <span className={c.chanCode}>{x.code}</span>
                  <span className={c.inboxMain}><b>#{x.name}</b><small className={c.clip}>{last ? `${firstName(last.by)}: ${last.text ?? "posted a request"}` : x.sub}</small></span>
                  <IconChevron size={14} />
                </button>
              );
            })}
          </div>
        </div>

        {!command && myZone && (
          <div className={c.section}>
            <h3 className={c.h3}>My tasks here</h3>
            {mine.filter((t) => t.zoneId === myZone).length ? mine.filter((t) => t.zoneId === myZone).map((t) => <TaskRow key={t.id} t={t} s={s} />) : (
              openTasksIn(s, myZone).slice(0, 3).map((t) => <TaskRow key={t.id} t={t} s={s} />)
            )}
            {mine.some((t) => t.zoneId !== myZone) && <>
              <h3 className={c.h3}>My other tasks</h3>
              {mine.filter((t) => t.zoneId !== myZone).map((t) => <TaskRow key={t.id} t={t} s={s} showZone />)}
            </>}
          </div>
        )}

        <div className={c.tabs} role="tablist">
          {(["zones", "live", "mind"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? c.tabOn : undefined} onClick={() => setTab(t)}>
              {t === "zones" ? "Zones" : t === "live" ? "Live" : "Mind"}
            </button>
          ))}
        </div>

        {tab === "zones" && (
          <div className={c.section}>
            <div className={c.toolbar}>
              <Segmented value={view} onChange={setView} options={[{ id: "list", label: "List" }, { id: "grid", label: "Grid" }, { id: "map", label: "Map" }]} />
            </div>
            {view === "list" && <div className={c.zoneList}>{s.zones.map((z) => <ZoneTile key={z.id} s={s} z={z} />)}</div>}
            {view === "grid" && <div className={c.zoneGrid}>{s.zones.map((z) => <ZoneTile key={z.id} s={s} z={z} variant="tile" />)}</div>}
            {view === "map" && <>
              <FloorMap s={s} onPick={setPin} picked={pin} />
              {pinned ? <ZoneTile s={s} z={pinned} /> : <p className={c.empty}>Tap a pin to see the zone.</p>}
            </>}
            <p className={c.hint}>Hold a zone for Assign, Set status and Open chat.</p>
          </div>
        )}
        {tab === "live" && <div className={c.section}><FeedList s={s} limit={30} /></div>}
        {tab === "mind" && (
          <div className={c.section}>
            {[["📋", "Run sheet · Day 2", "Doors 16:00 · Semi-finals 18:00 · Close 23:30"], ["📻", "Radio channels", "Ch 1 Command · Ch 2 Security · Ch 3 AV · Ch 4 Runners"], ["🚑", "Emergency contacts", "Medical point by Gate 1 · Civil Defence 998"], ["🗺️", "Floor plan", "Boulevard Riyadh City · v4"]].map(([e, t, d]) => (
              <div key={t} className={c.mindRow}><span>{e}</span><span className={c.inboxMain}><b>{t}</b><small>{d}</small></span></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OpSettings({ s }: { s: OpState }) {
  const ui = useUi();
  const muted = !!s.muted[ui.me];
  return (
    <Sheet title="Operation" onClose={() => ui.sheet(null)}>
      <div className={c.field}><span>Mute this Operation<small>Critical broadcasts still break through</small></span><Toggle on={muted} onChange={(v) => op.setMuted(ui.me, v)} label="Mute" /></div>
      <div className={c.field}><span>Shift</span><Segmented value={s.shift} onChange={(v) => op.setShift(v)} options={[{ id: "morning", label: "Morning" }, { id: "evening", label: "Evening" }]} /></div>
      <div className={c.field}><span>Days</span><b className={c.fieldVal}>Day {s.day} of {s.days} · {SHIFTS[s.shift]}</b></div>
      <div className={c.field}><span>Floor plan</span><b className={c.fieldVal}>Boulevard Riyadh City · v4</b></div>
      <div className={c.menu}>
        <button disabled><span className={c.menuIcon}>◎</span>Crews and roles<span className={c.menuEnd}>5</span></button>
        <button disabled><span className={c.menuIcon}>🗓</span>Rota editor<span className={c.soon}>Soon</span></button>
        <button disabled><span className={c.menuIcon}>⇩</span>Export reports<span className={c.soon}>Soon</span></button>
      </div>
      <button className={c.linkBtnBlock} onClick={() => { op.resetDemo(); ui.toast("Demo reset"); ui.sheet(null); }}>Reset demo data</button>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   Zone page (full screen, like the board)
--------------------------------------------------------------------------- */

export function ZonePage({ s, zoneId, onBack, backLabel = "Back" }: { s: OpState; zoneId: string; onBack: () => void; backLabel?: string }) {
  const ui = useUi();
  const z = zoneOf(s, zoneId)!;
  const me = ui.me;
  const st = staffing(s, z);
  const mine = s.presence[me];
  const isHere = mine?.zoneId === z.id;
  const command = canCommand(me);
  const isLead = z.leadId === me;
  const tasks = [...s.tasks.filter((t) => t.zoneId === z.id)].sort((a, b) => Number(a.step === "done") - Number(b.step === "done") || a.due - b.due);
  const reqs = s.requests.filter((r) => r.zoneId === z.id && r.status !== "declined" && (r.status !== "done" || ui.now - (r.decidedAt ?? r.at) < 20 * 60_000)).reverse();
  const lastMsg = [...s.chat].reverse().find((m) => m.zoneId === z.id);
  return (
    <div className={c.page}>
      <header className={c.navBar}>
        <button className={c.backBtn} onClick={onBack}><IconBack size={20} />{backLabel}</button>
        <span />
        <span className={c.navEnd}><StatusChip status={z.status} /></span>
      </header>
      <div className={c.scroll}>
        <div className={c.zoneHero}>
          <span className={c.codeLg}>{z.code}</span>
          <div>
            <h2>{z.name}</h2>
            <p>{z.area}{z.leadId ? ` · Lead ${person(z.leadId).name}` : ""}</p>
          </div>
        </div>
        <div className={c.zoneStats}>
          <div><b className={c[`lvl_${st.level}`]}>{st.n}/{st.target}</b><small>on site</small></div>
          <div><b>{openTasksIn(s, z.id).length}</b><small>open tasks</small></div>
          <div><b>{reqs.filter((r) => r.status === "pending").length}</b><small>requests</small></div>
        </div>
        <div className={c.section}>
          {isHere ? (
            <div className={c.hereRow}>
              <span><IconLocation size={16} />You’re here since {clock(mine.since)}</span>
              <button className={c.btnGhostSm} onClick={() => { op.checkOut(me); ui.toast(`Left ${z.code}`); }}>Leave</button>
            </div>
          ) : (
            <div className={c.hereBtns}>
              <button className={c.btnPrimary} onClick={() => { op.checkIn(me, z.id, "tap"); ui.toast(`Checked in to ${z.code} · ${z.name}`); }}><IconLocation size={16} />I’m here</button>
              <button className={c.btnGhost} onClick={() => ui.sheet(<ScanSheet s={s} />)}><IconQr size={16} />Scan</button>
            </div>
          )}
        </div>

        <div className={c.section}>
          <div className={c.secHead}><h3 className={c.h3}>Who’s here · {here(s, z.id).length}</h3>{(command || isLead) && <button className={c.linkBtn} onClick={() => ui.sheet(<AssignSheet s={s} zoneId={z.id} />)}><IconPlus size={14} />Assign</button>}</div>
          <WhoHere s={s} zoneId={z.id} />
        </div>

        <div className={c.section}>
          <div className={c.secHead}><h3 className={c.h3}>Tasks here · {openTasksIn(s, z.id).length}</h3><button className={c.linkBtn} onClick={() => ui.sheet(<TaskSheet s={s} zoneId={z.id} />)}><IconPlus size={14} />Task</button></div>
          {tasks.length ? tasks.map((t) => <TaskRow key={t.id} t={t} s={s} />) : <p className={c.empty}>No tasks here.</p>}
        </div>

        <div className={c.section}>
          <h3 className={c.h3}>Requests</h3>
          <div className={c.reqBtns}>
            <button onClick={() => ui.sheet(<RequestSheet zoneId={z.id} kind="staff" />)}><span>👥</span>Need people</button>
            <button onClick={() => ui.sheet(<RequestSheet zoneId={z.id} kind="supplies" />)}><span>📦</span>Need supplies</button>
            <button onClick={() => ui.sheet(<RequestSheet zoneId={z.id} kind="issue" />)}><span>⚠</span>Report issue</button>
          </div>
          {reqs.map((r) => <RequestCard key={r.id} s={s} r={r} />)}
        </div>

        <div className={c.section}>
          <button className={c.chatLink} onClick={() => ui.openChat(z.id)}>
            <span className={c.hashLg}>#</span>
            <span className={c.inboxMain}>
              <b>#{z.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}</b>
              <small>{lastMsg ? `${firstName(lastMsg.by)}: ${lastMsg.text ?? "posted a request"}` : "Zone chat"}</small>
            </span>
            <IconChevron size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- the zone's channel ---- */

export function ChatView({ s, zoneId, onBack }: { s: OpState; zoneId: string; onBack: () => void }) {
  const ui = useUi();
  const z = zoneOf(s, zoneId)!;
  const [text, setText] = useState("");
  const msgs = s.chat.filter((m) => m.zoneId === zoneId).sort((a, b) => a.at - b.at);
  const send = () => { if (!text.trim()) return; op.postChat(zoneId, ui.me, text.trim()); setText(""); };
  return (
    <div className={c.page}>
      <header className={c.navBar}>
        <button className={c.backBtn} onClick={onBack}><IconBack size={20} />Back</button>
        <span className={c.navTitle}><b>#{z.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}</b><small><Code z={z} /> {here(s, z.id).length} here</small></span>
        <span />
      </header>
      <div className={`${c.scroll} ${c.thread}`}>
        {msgs.map((m) => {
          const r = m.requestId ? s.requests.find((x) => x.id === m.requestId) : undefined;
          const mineMsg = m.by === ui.me;
          return (
            <div key={m.id} className={`${c.msg} ${mineMsg ? c.msgMine : ""}`}>
              {!mineMsg && <Av id={m.by} size={28} />}
              <div className={c.msgBody}>
                {!mineMsg && <small>{firstName(m.by)} · {clock(m.at)}</small>}
                {r ? <RequestCard s={s} r={r} compact /> : <p className={c.bubble}>{m.text}</p>}
              </div>
            </div>
          );
        })}
      </div>
      <div className={c.composer}>
        <button className={c.headBtn} onClick={() => ui.sheet(<RequestSheet zoneId={zoneId} kind="staff" />)} aria-label="New request"><IconPlus size={20} /></button>
        <input className={c.composerInput} value={text} placeholder={`Message #${z.code.toLowerCase()}`} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
      </div>
    </div>
  );
}

/* ---- #broadcasts ---- */

export function BroadcastsView({ s, onBack }: { s: OpState; onBack: () => void }) {
  const ui = useUi();
  const command = canCommand(ui.me);
  return (
    <div className={c.page}>
      <header className={c.navBar}>
        <button className={c.backBtn} onClick={onBack}><IconBack size={20} />Back</button>
        <span className={c.navTitle}><b>📣 #broadcasts</b><small>Pinned · only Command posts</small></span>
        <span />
      </header>
      <div className={`${c.scroll} ${c.thread}`}>
        {s.broadcasts.map((b) => (
          <div key={b.id} className={c.bcWrap}>
            <BroadcastItem s={s} b={b} onRemind={command ? () => { const n = op.remind(b.id, ui.me); ui.toast(`Reminded ${n} people`); } : undefined} />
            {!command && !b.acks[ui.me] && <button className={c.btnPrimarySm} onClick={() => op.ack(b.id, ui.me)}>Got it</button>}
          </div>
        ))}
      </div>
      {command && <div className={c.composerTall}><BroadcastComposer s={s} compact /></div>}
    </div>
  );
}

/* ---- the Ops board: every task, by zone ---- */

export function BoardView({ s, onBack }: { s: OpState; onBack: () => void }) {
  const ui = useUi();
  const [zone, setZone] = useState<string>("all");
  const list = s.tasks.filter((t) => zone === "all" || t.zoneId === zone).sort((a, b) => Number(a.step === "done") - Number(b.step === "done") || a.due - b.due);
  return (
    <div className={c.page}>
      <header className={c.navBar}>
        <button className={c.backBtn} onClick={onBack}><IconBack size={20} />Back</button>
        <span className={c.navTitle}><b>Ops board</b><small>{s.tasks.filter((t) => t.step !== "done").length} open</small></span>
        <button className={c.headBtn} onClick={() => ui.sheet(<TaskSheet s={s} zoneId={zone === "all" ? s.zones[0].id : zone} />)} aria-label="New task"><IconPlus size={20} /></button>
      </header>
      <div className={c.codes} style={{ padding: "0 16px 8px" }}>
        <button className={zone === "all" ? c.codeOn : undefined} onClick={() => setZone("all")}>All</button>
        {s.zones.map((z) => <button key={z.id} className={zone === z.id ? c.codeOn : undefined} onClick={() => setZone(z.id)}>{z.code}</button>)}
      </div>
      <div className={c.scroll}><div className={c.section}>{list.map((t) => <TaskRow key={t.id} t={t} s={s} showZone={zone === "all"} />)}</div></div>
    </div>
  );
}

export { IconCloud };

/* ---------------------------------------------------------------------------
   The Operation's chat: what opens from the inbox, like any group. Its
   channels run along the top; the title in the middle opens everything else.
--------------------------------------------------------------------------- */

export function GroupChat({ s, channel: initial = "general", onBack, onInfo, onRadio }: {
  s: OpState; channel?: string; onBack: () => void; onInfo: () => void; onRadio: () => void;
}) {
  const ui = useUi();
  const me = ui.me;
  const command = canCommand(me);
  const [ch, setCh] = useState(initial);
  const [text, setText] = useState("");
  const zone = zoneOf(s, ch);
  const myZone = zoneOf(s, s.presence[me]?.zoneId);
  const unread = command ? [] : s.broadcasts.filter((b) => b.level === "normal" && !b.acks[me]);
  const missed = missedFor(s, me);
  const msgs = s.chat.filter((m) => m.zoneId === ch).sort((a, b) => a.at - b.at);
  const tabs = [
    { id: "general", label: "# general" },
    { id: "broadcasts", label: "📣 broadcasts" },
    ...s.zones.map((z) => ({ id: z.id, label: `${z.code} ${slug(z.name)}` })),
  ];
  const send = () => { if (!text.trim()) return; op.postChat(ch, me, text.trim()); setText(""); };
  const liveTx = s.radio.tx.find((t) => t.live);
  return (
    <div className={c.page}>
      <header className={c.navBar}>
        <button className={c.backBtn} onClick={onBack}><IconBack size={20} />Chats</button>
        <button className={c.capsule} onClick={onInfo} aria-label="Operation info">
          <span className={c.capsuleBadge}>EWC</span>
          <span className={c.capsuleText}><b>{s.name}</b><small>Day {s.day} · {onSite(s)} on site · {pendingRequests(s).length} requests</small></span>
        </button>
        <button className={`${c.radioBtn} ${liveTx ? c.radioBtnLive : ""}`} onClick={onRadio} aria-label="Radio">
          <IconWalkie size={20} />{missed > 0 && <i className={c.dotBadge}>{missed}</i>}
        </button>
      </header>
      <div className={c.chanTabs}>
        {tabs.map((x) => <button key={x.id} className={ch === x.id ? c.chanTabOn : undefined} onClick={() => setCh(x.id)}>{x.label}</button>)}
      </div>
      {liveTx && (
        <button className={c.onAirStrip} onClick={onRadio}>
          <i className={c.liveDot} /><b>{liveTx.by === me ? "You" : firstName(liveTx.by)}</b><span>on air</span>
          <span className={c.inboxText}>{liveTx.text || "…"}</span>
        </button>
      )}
      {!command && ch === "general" && (
        <div className={c.pinTop}>
          {myZone
            ? <button className={c.wherePill} onClick={() => ui.openZone(myZone.id)}><IconLocation size={13} />You’re in <b>{myZone.code} · {myZone.name}</b><IconChevron size={12} /></button>
            : <button className={c.wherePill} onClick={() => ui.sheet(<ScanSheet s={s} />)}><IconQr size={13} />Not checked in · <b>Scan</b></button>}
          {unread.map((b) => <BroadcastBanner key={b.id} b={b} />)}
        </div>
      )}
      <div className={`${c.scroll} ${c.thread}`}>
        {ch === "broadcasts" ? s.broadcasts.map((b) => (
          <div key={b.id} className={c.bcWrap}>
            <BroadcastItem s={s} b={b} onRemind={command ? () => { const n = op.remind(b.id, me); ui.toast(`Reminded ${n} people`); } : undefined} />
            {!command && !b.acks[me] && <button className={c.btnPrimarySm} onClick={() => op.ack(b.id, me)}>Got it</button>}
          </div>
        )) : <>
          {zone && <button className={c.zoneStrip} onClick={() => ui.openZone(zone.id)}><Code z={zone} />{zone.name} · {here(s, zone.id).length}/{zone.target} here · {openTasksIn(s, zone.id).length} tasks<IconChevron size={12} /></button>}
          {msgs.map((m) => {
            const r = m.requestId ? s.requests.find((x) => x.id === m.requestId) : undefined;
            const mine = m.by === me;
            return (
              <div key={m.id} className={`${c.msg} ${mine ? c.msgMine : ""}`}>
                {!mine && <Av id={m.by} size={28} />}
                <div className={c.msgBody}>
                  {!mine && <small>{firstName(m.by)} · {clock(m.at)}</small>}
                  {r ? <RequestCard s={s} r={r} compact /> : <p className={c.bubble}>{m.text}</p>}
                </div>
              </div>
            );
          })}
        </>}
      </div>
      {ch === "broadcasts" ? (
        command ? <div className={c.composerTall}><BroadcastComposer s={s} compact /></div> : <p className={c.readOnly}>Only Command posts in #broadcasts</p>
      ) : (
        <div className={c.composer}>
          <button className={c.headBtn} onClick={() => ui.sheet(<RequestSheet zoneId={zone?.id ?? myZone?.id ?? s.zones[0].id} kind={zone ? "staff" : "issue"} />)} aria-label="New request"><IconPlus size={20} /></button>
          <input className={c.composerInput} value={text} placeholder={`Message #${zone ? zone.code.toLowerCase() : "general"}`} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        </div>
      )}
    </div>
  );
}
