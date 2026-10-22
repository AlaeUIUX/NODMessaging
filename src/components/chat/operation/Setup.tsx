"use client";

import { useState, type ReactNode } from "react";
import { initials, TONES } from "@/lib/chat/avatar";
import { can, groupInfo, permissionsFor, ROLE_TONES, rolesOf } from "@/lib/chat/groups";
import {
  addCrew, addLink, canManageZones, dayOf, DEFAULT_SHIFTS, deleteZone, emptyLive, here, isCommand, joinUrl, newLinkCode, newZone, onSite, opId, pendingRequests, removeLink, templateOf, TEMPLATES, toOperation, updateOperation,
  upsertZone, zoneById, zoneChannelName, type OpLive, type OperationSetup,
} from "@/lib/chat/operation";
import { ensureOpLive, opDispatch, useOpLive } from "@/lib/chat/opstore";
import { newProject } from "@/lib/chat/project";
import { USERS } from "@/lib/chat/seed";
import { useChat, userById } from "@/lib/chat/store";
import type { AvatarTone, Chat, GroupInfo, GroupRole, OperationInfo, OperationLink, OperationShift, OperationZone } from "@/lib/chat/types";
import Avatar from "../Avatar";
import {
  IconCalendar, IconCheck, IconChevron, IconCopy, IconGame, IconLink, IconLocation, IconMic, IconMinus, IconOpen, IconPlus,
  IconQr, IconSearch, IconShare, IconShield, IconTrash, IconUserAdd, IconUserGroup,
} from "../Icons";
import { QrPattern } from "../Invite";
import { Group, Row, SubPage, Tile } from "../Settings";
import { Segmented, Sheet } from "../ui";
import { Av, Code, CrewDot } from "./kit";
import { useOperation } from "./useOperation";
import styles from "../chat.module.css";
import a from "../account.module.css";
import st from "./setup.module.css";

/**
 * Setting up an Operation with the app's real groups: making one (New group ›
 * Operation), turning a group into one, and administering it from the
 * group's settings (details and shift, zones, crews and permissions, invite
 * links). Plus the live strip under an Operation's row in the inbox.
 *
 * The rules are in lib/chat/operation.ts; edits go through
 * useChat().updateGroup, live changes through the opstore.
 */

/* ===========================================================================
   Dates and shifts
   =========================================================================== */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Local midnight of the day `at` falls on. */
export function midnight(at: number) {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function addDays(at: number, n: number) {
  const d = new Date(at);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
const dateValue = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function fromDateValue(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}
/** "Wed 22 Oct". */
export function dayText(at: number) {
  const d = new Date(at);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
/** "Wed 22 – Fri 24 Oct · 3 days". */
export function datesText(startsAt: number, days: number) {
  const n = `${days} ${days === 1 ? "day" : "days"}`;
  if (days <= 1) return `${dayText(startsAt)} · ${n}`;
  const from = new Date(startsAt);
  const to = new Date(addDays(startsAt, days - 1));
  const left = from.getMonth() === to.getMonth() ? `${WEEKDAYS[from.getDay()]} ${from.getDate()}` : dayText(startsAt);
  return `${left} – ${dayText(to.getTime())} · ${n}`;
}
/** Where an Operation is in its run: "Day 2" while it's on, else when it starts or that it ended. */
export function phaseOf(op: OperationInfo, now: number): { on: boolean; text: string } {
  if (now < op.startsAt) return { on: false, text: `Starts ${dayText(op.startsAt)}` };
  if (now >= addDays(op.startsAt, op.days)) return { on: false, text: "Ended" };
  return { on: true, text: `Day ${dayOf(op, now)}` };
}

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
/** The shift on at a time of day (the last one when none matches). */
export function shiftAt(shifts: OperationShift[], at: number) {
  const d = new Date(at);
  const t = d.getHours() * 60 + d.getMinutes();
  return (shifts.find((s) => minutes(s.from) <= t && t < minutes(s.to)) ?? shifts[shifts.length - 1] ?? DEFAULT_SHIFTS[1]).id;
}

/** A blank setup: today, one day, the esports venue. */
export const newOperationDraft = (now: number): OperationSetup => ({ venue: "", startsAt: midnight(now), days: 1, template: "esports" });

/* ===========================================================================
   Pure edits that belong to setting up
   =========================================================================== */

const withOp = (group: Chat, fn: (op: OperationInfo) => OperationInfo): Chat => {
  const info = groupInfo(group);
  return info.operation ? { ...group, group: { ...info, operation: fn(info.operation) } } : group;
};

/** Points the Operation at its Ops board (a project card in the group's own thread). */
export const withBoard = (group: Chat, boardMessageId: string): Chat => withOp(group, (op) => ({ ...op, boardMessageId }));

/** A crew role went: it leaves the Operation's crews, the zones it worked in and the links that gave it. */
export function forgetCrew(group: Chat, roleId: string): Chat {
  return withOp(group, (op) => ({
    ...op,
    crews: op.crews.filter((c) => c !== roleId),
    zones: op.zones.map((z) => (z.crews.includes(roleId) ? { ...z, crews: z.crews.filter((c) => c !== roleId) } : z)),
    links: op.links.map((l) => (l.roleIds.includes(roleId) ? { ...l, roleIds: l.roleIds.filter((r) => r !== roleId) } : l)),
  }));
}

/** The Command role can't be deleted: the Operation runs on it. */
export const isCommandRole = (info: GroupInfo, roleId: string | undefined) => !!roleId && info.operation?.commandRole === roleId;

/**
 * Starts an Operation on a group: zones, crews, Command and #broadcasts (see
 * toOperation), its live state, and an Ops board in the group's own thread.
 * Call from an event handler.
 */
export function useStartOperation() {
  const { me, updateGroup, sendCard } = useChat();
  return (groupId: string, setup: OperationSetup) => {
    updateGroup(groupId, (g) => toOperation(g, { ...setup, venue: setup.venue.trim() }, me));
    const at = Date.now();
    ensureOpLive(groupId, () => emptyLive(shiftAt(DEFAULT_SHIFTS, at)));
    // Command runs the event from everywhere: checked in to no zone.
    opDispatch(groupId, { t: "checkIn", userId: me, zoneId: null, via: "tap", at, feedId: opId("f") });
    const boardId = sendCard(groupId, newProject("Ops board"), "Board: Ops board");
    updateGroup(groupId, (g) => withBoard(g, boardId));
  };
}

/* ===========================================================================
   Links: real URLs that open the app and join (?join=<code>)
   =========================================================================== */

/** What a link shows: without the scheme. */
export const displayUrl = (url: string) => url.replace(/^https?:\/\//, "");

export async function copyLink(url: string, onToast: (t: string) => void, done = "Link copied") {
  try { await navigator.clipboard.writeText(url); onToast(done); } catch { onToast(displayUrl(url)); }
}

async function shareLink(url: string, title: string, onToast: (t: string) => void) {
  if (typeof navigator.share === "function") {
    try { await navigator.share({ title, url }); return; } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
    }
  }
  await copyLink(url, onToast, "Link copied: paste it anywhere");
}

/* ===========================================================================
   Fields: venue and dates, a stepper, the template picker
   =========================================================================== */

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className={st.stepper}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`}><IconMinus size={14} /></button>
      <b aria-live="polite">{value}</b>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}><IconPlus size={14} /></button>
    </span>
  );
}

export const OPERATION_HINT = "An Operation is a group for running a live event: zones, crews, requests, broadcasts and a radio.";

/** Venue, first day and how many days (1–7), with the dates spelled out. */
export function NewOperationFields({ value, onChange, hint = true }: {
  value: Pick<OperationSetup, "venue" | "startsAt" | "days">;
  onChange: (patch: Partial<OperationSetup>) => void;
  /** Says what an Operation is, above the fields. */
  hint?: boolean;
}) {
  return (
    <>
      {hint && <p className={st.hint}>{OPERATION_HINT}</p>}
      <div className={a.fields}>
        <label className={a.field}>
          <span>Venue</span>
          <input value={value.venue} onChange={(e) => onChange({ venue: e.target.value.slice(0, 60) })} placeholder="e.g. Boulevard Riyadh City" />
        </label>
        <label className={a.field}>
          <span>First day</span>
          <input
            type="date"
            className={st.date}
            value={dateValue(value.startsAt)}
            onChange={(e) => { const t = fromDateValue(e.target.value); if (t !== null) onChange({ startsAt: t }); }}
          />
        </label>
        <div className={`${a.field} ${st.stepField}`}>
          <span>Days</span>
          <Stepper value={value.days} min={1} max={7} onChange={(days) => onChange({ days })} label="days" />
        </div>
      </div>
      <p className={st.summary}><IconCalendar size={14} />{datesText(value.startsAt, value.days)}</p>
    </>
  );
}

const TEMPLATE_ICON: Record<OperationInfo["template"], ReactNode> = {
  esports: <IconGame size={18} />,
  conference: <IconMic size={18} />,
  blank: <IconPlus size={18} />,
};

/** Esports venue, Conference or Blank, with what each one creates. */
export function TemplatePicker({ value, onChange }: { value: OperationInfo["template"]; onChange: (t: OperationInfo["template"]) => void }) {
  const t = templateOf(value);
  return (
    <>
      <div className={st.tplList} role="radiogroup" aria-label="Zone template">
        {TEMPLATES.map((x) => (
          <button key={x.id} role="radio" aria-checked={x.id === value} className={`${st.tpl} ${x.id === value ? st.tplOn : ""}`} onClick={() => onChange(x.id)}>
            {TEMPLATE_ICON[x.id]}
            <b>{x.name}</b>
            <small>{x.zones.length ? `${x.zones.length} zones · ${x.crews.length} crews` : "Start empty"}</small>
          </button>
        ))}
      </div>
      <p className={st.hint}>{t.sub}.</p>
      {t.zones.length > 0 && (
        <>
          <p className={styles.sheetLabel}>Zones and channels · {t.zones.length}</p>
          <div className={st.tplZones}>
            {t.zones.map((z) => (
              <span key={z.code} className={st.tplZone}>
                <Code z={z} />
                <span><b>{z.name}</b><small>#{zoneChannelName(z)}</small></span>
              </span>
            ))}
          </div>
        </>
      )}
      <p className={styles.sheetLabel}>Crews (roles) · {t.crews.length + 1}</p>
      <div className={st.crews}>
        <span className={st.crew}><CrewDot tone="clay" />Command</span>
        {t.crews.map((c) => <span key={c.key} className={st.crew}><CrewDot tone={c.tone} />{c.name}</span>)}
      </div>
      <p className={st.hint}>Also adds <b>#broadcasts</b>, pinned under #general. Only Command can post there.</p>
    </>
  );
}

/* ===========================================================================
   Turning a group into an Operation (its settings › Organise)
   =========================================================================== */

export function TurnIntoOperationSheet({ groupId, onClose, onToast }: { groupId: string; onClose: () => void; onToast: (t: string) => void }) {
  const { state } = useChat();
  const start = useStartOperation();
  const [draft, setDraft] = useState<OperationSetup>(() => newOperationDraft(Date.now()));
  const group = state.data.chats.find((c) => c.id === groupId && !c.removedAt);
  if (!group) return null;
  const tpl = templateOf(draft.template);
  return (
    <Sheet
      title="Turn into an Operation"
      onClose={onClose}
      action={{
        label: "Convert",
        onClick: () => {
          start(groupId, draft);
          onToast(`${group.name} is now an Operation${tpl.zones.length ? ` · ${tpl.zones.length} zones` : ""}`);
        },
      }}
    >
      <p className={st.hint}>Adds zones, crews, requests, broadcasts and a radio. Members and channels stay.</p>
      <NewOperationFields value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} hint={false} />
      <p className={styles.sheetLabel}>Zone template</p>
      <TemplatePicker value={draft.template} onChange={(template) => setDraft((d) => ({ ...d, template }))} />
      <p className={st.hint}>You get Command. Give people their crew in Crews &amp; permissions, or share a crew link.</p>
    </Sheet>
  );
}

/* ===========================================================================
   Group settings › Operation: the rows, and the pages they open
   =========================================================================== */

export type OperationPageId = "opDetails" | "opZones" | "opCrews" | "opLinks";
export const isOperationPage = (id: string): id is OperationPageId => id === "opDetails" || id === "opZones" || id === "opCrews" || id === "opLinks";

export function OperationSettingsRows({ group, now, onOpen }: { group: Chat; now: number; onOpen: (id: OperationPageId) => void }) {
  const { me } = useChat();
  const info = groupInfo(group);
  const op = info.operation;
  if (!op) return null;
  const phase = phaseOf(op, now);
  return (
    <Group label="Operation">
      <Row
        icon={<Tile tone="graphite"><IconCalendar size={16} /></Tile>}
        title="Operation details"
        sub={[op.venue, datesText(op.startsAt, op.days)].filter(Boolean).join(" · ")}
        value={phase.on ? `${phase.text} of ${op.days}` : phase.text}
        onClick={() => onOpen("opDetails")}
      />
      {canManageZones(info, me) && (
        <Row icon={<Tile tone="denim"><IconLocation size={16} /></Tile>} title="Zones" value={String(op.zones.length)} onClick={() => onOpen("opZones")} />
      )}
      {can(info, me, "manageRoles") && (
        <Row icon={<Tile tone="plum"><IconUserGroup size={16} /></Tile>} title="Crews & permissions" value={String(op.crews.length + 1)} onClick={() => onOpen("opCrews")} />
      )}
      {can(info, me, "invite") && (
        <Row icon={<Tile tone="sage"><IconLink size={16} /></Tile>} title="Invite links" value={String(op.links.length + 1)} onClick={() => onOpen("opLinks")} />
      )}
    </Group>
  );
}

export interface OperationPageProps {
  group: Chat;
  leaving: boolean;
  onBack: () => void;
  onSheet: (n: ReactNode) => void;
  closeSheet: () => void;
  onToast: (t: string) => void;
  /** Opens the group's RoleSheet (it lives with the other group settings). */
  onEditRole: (roleId?: string) => void;
}

/** The page behind an Operation row, sliding in over Group settings. */
export function OperationSettingsPages({ page, ...props }: OperationPageProps & { page: OperationPageId }) {
  if (!groupInfo(props.group).operation) return null;
  if (page === "opDetails") return <DetailsPage {...props} />;
  if (page === "opZones") return <ZonesPage {...props} />;
  if (page === "opCrews") return <CrewsPage {...props} />;
  return <LinksPage {...props} />;
}

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
const roleCount = (group: Chat, info: GroupInfo, roleId: string) => group.memberIds.filter((u) => (info.memberRoles[u] ?? []).includes(roleId)).length;
const crewRolesOf = (info: GroupInfo) => (info.operation?.crews ?? []).map((id) => info.roles.find((r) => r.id === id)).filter((r): r is GroupRole => !!r);

/* ---- details: venue, dates, the shift on now, the template it started from ---- */

function DetailsPage({ group, leaving, onBack, onToast }: OperationPageProps) {
  const { me, updateGroup, live, act } = useOperation(group.id);
  const info = groupInfo(group);
  const op = info.operation!;
  const [draft, setDraft] = useState({ venue: op.venue, startsAt: op.startsAt, days: op.days });
  const edit = can(info, me, "manageGroup") || isCommand(info, me);
  const command = isCommand(info, me);
  const changed = draft.venue.trim() !== op.venue || draft.startsAt !== op.startsAt || draft.days !== op.days;
  const shift = op.shifts.find((s) => s.id === live?.shift) ?? op.shifts[0];
  const save = () => {
    updateGroup(group.id, (g) => updateOperation(g, { venue: draft.venue.trim(), startsAt: draft.startsAt, days: draft.days }));
    onToast("Operation updated");
    onBack();
  };
  return (
    <SubPage
      title="Operation details"
      onBack={onBack}
      leaving={leaving}
      action={edit ? <button className={a.barSave} disabled={!changed} onClick={save}>Save</button> : undefined}
    >
      {edit ? (
        <section className={a.group}>
          <NewOperationFields value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} hint={false} />
        </section>
      ) : (
        <Group>
          <Row title="Venue" value={op.venue || "—"} />
          <Row title="Dates" value={datesText(op.startsAt, op.days)} />
        </Group>
      )}

      {shift && (
        <section className={a.group}>
          <p className={a.groupLabel}>Shift now</p>
          {command && op.shifts.length > 1 ? (
            <Segmented
              value={shift.id}
              options={op.shifts.map((s) => ({ id: s.id, label: s.name }))}
              onChange={(id) => { act.setShift(id); onToast(`${op.shifts.find((s) => s.id === id)?.name ?? "New"} shift is on`); }}
            />
          ) : (
            <div className={a.groupBody}><Row title={shift.name} value={`${shift.from}–${shift.to}`} /></div>
          )}
          <p className={st.shifts}>{op.shifts.map((s) => <span key={s.id}>{s.name} {s.from}–{s.to}</span>)}</p>
          <p className={a.groupNote}>{command ? "Everyone sees the shift you pick: in the inbox, on the Operation page and in the Day report." : "Command sets the shift."}</p>
        </section>
      )}

      <Group label="Setup" note="Zones, crews and links can change any time; the template only set the start.">
        <Row title="Zone template" value={templateOf(op.template).name} />
        <Row title="Zones" value={String(op.zones.length)} />
        <Row title="Crews" value={String(op.crews.length)} />
      </Group>
    </SubPage>
  );
}

/* ---- zones: a code, a name, an area, how many people, a lead and crews ---- */

function ZoneTrail({ leadId }: { leadId?: string }) {
  return (
    <span className={st.trail}>
      {leadId ? <Av id={leadId} size={24} /> : <span className={st.noLead}>No lead</span>}
      <IconChevron size={14} />
    </span>
  );
}

function ZonesPage({ group, leaving, onBack, onSheet, closeSheet, onToast }: OperationPageProps) {
  const info = groupInfo(group);
  const op = info.operation!;
  const edit = (zoneId?: string) => onSheet(<ZoneSheet groupId={group.id} zoneId={zoneId} onClose={closeSheet} onToast={onToast} />);
  const example = op.zones[0] ? `#${zoneChannelName(op.zones[0])}` : "#a1-main-arena";
  const crewName = (id: string) => info.roles.find((r) => r.id === id)?.name;
  return (
    <SubPage title="Zones" onBack={onBack} leaving={leaving}>
      <Group label={`${op.zones.length} ${op.zones.length === 1 ? "zone" : "zones"}`} note={`Every zone is a channel (${example}) and a radio channel.`}>
        {op.zones.map((z) => (
          <Row
            key={z.id}
            icon={<span className={st.codeTile}>{z.code}</span>}
            title={z.name}
            sub={[z.area, `${z.target} needed`, z.crews.map(crewName).filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
            onClick={() => edit(z.id)}
            trailing={<ZoneTrail leadId={z.leadId} />}
          />
        ))}
        <Row icon={<span className={a.addTile}><IconPlus size={16} /></span>} title="Add zone" sub="A place with its own channel and radio" onClick={() => edit()} />
      </Group>
    </SubPage>
  );
}

/** The next free code after the last zone's: D2 → D3; none yet → A1. */
function nextCode(op: OperationInfo) {
  const taken = new Set(op.zones.map((z) => z.code));
  const last = op.zones[op.zones.length - 1]?.code ?? "A0";
  const m = /^([A-Z]+)(\d+)$/.exec(last);
  const letter = m?.[1] ?? "A";
  for (let n = Number(m?.[2] ?? 0) + 1; n < 100; n++) if (!taken.has(`${letter}${n}`)) return `${letter}${n}`;
  return "";
}

/** Who leads the zone: the current pick, and a searchable list of members (the zone's crews first). */
function LeadPicker({ info, op, live, members, crews, zoneId, value, onChange }: {
  info: GroupInfo;
  op: OperationInfo;
  live: OpLive | null;
  members: string[];
  crews: string[];
  zoneId?: string;
  value?: string;
  onChange: (id: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const inCrew = (u: string) => crews.some((c) => rolesOf(info, u).includes(c));
  const detail = (u: string) => {
    const crew = op.crews.map((c) => info.roles.find((r) => r.id === c)).find((r) => r && rolesOf(info, u).includes(r.id));
    const other = op.zones.find((z) => z.id !== zoneId && z.leadId === u);
    const at = live?.presence[u]?.zoneId ? zoneById(op, live.presence[u].zoneId) : undefined;
    return [isCommand(info, u) ? "Command" : crew?.name, other ? `Leads ${other.code}` : null, at ? `In ${at.code}` : null].filter(Boolean).join(" · ") || "Member";
  };
  const list = members
    .filter((u) => !query || userById(u).fullName.toLowerCase().includes(query))
    .sort((x, y) => Number(inCrew(y)) - Number(inCrew(x)) || userById(x).fullName.localeCompare(userById(y).fullName));
  const cur = value ? userById(value) : null;
  return (
    <>
      <div className={styles.listGroup}>
        <button className={styles.contactRow} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {cur
            ? <Avatar glyph={initials(cur.fullName)} tone={cur.tone} photo={cur.photo} size={36} shape="circle" />
            : <span className={st.ghost}><IconUserAdd size={16} /></span>}
          <span className={styles.contactText}><b>{cur ? cur.fullName : "No lead"}</b><small>{cur ? detail(cur.id) : "Pick who runs this zone"}</small></span>
          <span className={st.change}>{open ? "Done" : cur ? "Change" : "Pick"}</span>
        </button>
      </div>
      {open && (
        <>
          <label className={styles.sheetSearch}>
            <IconSearch size={16} />
            <input placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className={styles.listGroup}>
            {value && (
              <button className={styles.contactRow} onClick={() => { onChange(undefined); setOpen(false); }}>
                <span className={st.ghost}><IconUserGroup size={16} /></span>
                <span className={styles.contactText}><b>No lead</b><small>Command decides everything here</small></span>
              </button>
            )}
            {list.map((u) => {
              const p = userById(u);
              const on = u === value;
              return (
                <button key={u} className={styles.contactRow} onClick={() => { onChange(u); setOpen(false); setQ(""); }}>
                  <Avatar glyph={initials(p.fullName)} tone={p.tone} photo={p.photo} size={36} shape="circle" />
                  <span className={styles.contactText}><b>{p.fullName}</b><small>{detail(u)}</small></span>
                  <span className={`${styles.pickCircle} ${on ? styles.pickOn : ""}`}>{on && <IconCheck size={12} />}</span>
                </button>
              );
            })}
            {!list.length && <p className={styles.sheetNote}>No one matches “{q}”.</p>}
          </div>
        </>
      )}
    </>
  );
}

/** Adds or edits a zone (and its channel); deleting closes the channel and keeps its history. */
export function ZoneSheet({ groupId, zoneId, onClose, onToast }: { groupId: string; zoneId?: string; onClose: () => void; onToast: (t: string) => void }) {
  const { updateGroup, group, info, op, live, act } = useOperation(groupId);
  const existing = op && zoneId ? zoneById(op, zoneId) : undefined;
  const [code, setCode] = useState(() => existing?.code ?? (op ? nextCode(op) : "A1"));
  const [name, setName] = useState(existing?.name ?? "");
  const [area, setArea] = useState(existing?.area ?? "");
  const [target, setTarget] = useState(existing?.target ?? 2);
  const [lead, setLead] = useState<string | undefined>(existing?.leadId);
  const [crews, setCrews] = useState<string[]>(existing?.crews ?? []);
  const [confirm, setConfirm] = useState(false);
  if (!group || !info || !op || (zoneId && !existing)) return null;

  const taken = op.zones.find((z) => z.id !== zoneId && z.code === code);
  // ALL and CMD are what the radio calls All-call and Command.
  const reserved = code === "ALL" || code === "CMD";
  const codeOk = code.length >= 2 && code.length <= 4 && !reserved;
  const slug = zoneChannelName({ code, name: name.trim() || "zone" });
  const areas = [...new Set(op.zones.map((z) => z.area).filter(Boolean))];
  const crewRoles = crewRolesOf(info);

  const save = () => {
    const fields = { code, name: name.trim(), area: area.trim() || "Venue", target, crews };
    if (existing) {
      const next: OperationZone = { ...existing, ...fields, leadId: lead };
      if (!lead) delete next.leadId;
      updateGroup(groupId, (g) => upsertZone(g, next));
      onToast(`${code} · ${fields.name} saved`);
    } else {
      const z = newZone(group, lead ? { ...fields, leadId: lead } : fields);
      updateGroup(groupId, (g) => upsertZone(g, z));
      onToast(`${code} added · #${zoneChannelName(z)}`);
    }
  };

  return (
    <Sheet
      title={existing ? `${existing.code} · ${existing.name}` : "New zone"}
      onClose={onClose}
      action={{ label: existing ? "Save" : "Add", disabled: !codeOk || !!taken || !name.trim(), onClick: save }}
    >
      {(close) => (
        <>
          <div className={a.fields}>
            <label className={`${a.field} ${taken || reserved ? a.fieldBad : ""}`}>
              <span>Code</span>
              <input
                className={st.codeInput}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
                placeholder="A1"
                autoCapitalize="characters"
                spellCheck={false}
                {...(existing ? {} : { "data-autofocus": true })}
              />
            </label>
            <label className={a.field}>
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 32))} placeholder="e.g. Main Arena" />
            </label>
            <label className={a.field}>
              <span>Area</span>
              <input value={area} onChange={(e) => setArea(e.target.value.slice(0, 24))} placeholder="e.g. Hall A, Outdoor, Level 2" />
            </label>
            {areas.length > 0 && (
              <div className={styles.chipGrid} aria-label="Areas so far">
                {areas.map((x) => (
                  <button key={x} className={`${styles.choice} ${area === x ? styles.choiceOn : ""}`} onClick={() => setArea(x)}>{x}</button>
                ))}
              </div>
            )}
            <div className={`${a.field} ${st.stepField}`}>
              <span>People needed</span>
              <Stepper value={target} min={1} max={99} onChange={setTarget} label="people" />
            </div>
          </div>
          <p className={`${styles.sheetNote} ${taken || (code && !codeOk) ? a.noteBad : ""}`}>
            {taken
              ? `${code} is already ${taken.name}.`
              : reserved
                ? `${code} is how the radio says ${code === "ALL" ? "All-call" : "Command"}. Pick another code.`
                : !codeOk
                  ? "2 to 4 letters or numbers, like A1: how the zone is said on the radio and on signs."
                  : `Its channel is #${slug}, and it gets a radio channel, ${code}.`}
          </p>

          <p className={styles.sheetLabel}>Lead</p>
          <LeadPicker info={info} op={op} live={live} members={group.memberIds} crews={crews} zoneId={zoneId} value={lead} onChange={setLead} />

          <p className={styles.sheetLabel}>Crews here</p>
          {crewRoles.length ? (
            <div className={styles.chipGrid}>
              {crewRoles.map((r) => {
                const on = crews.includes(r.id);
                return (
                  <button key={r.id} className={`${styles.choice} ${on ? styles.choiceOn : ""}`} aria-pressed={on} onClick={() => setCrews((x) => (on ? x.filter((y) => y !== r.id) : [...x, r.id]))}>
                    <CrewDot tone={r.tone} />{r.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className={styles.sheetNote}>No crews yet. Add them in Crews &amp; permissions.</p>
          )}
          <p className={styles.sheetNote}>Its crews come first when Command sends people here. The lead decides supplies and issues in {code || "the zone"}.</p>

          {existing && (
            <button
              className={styles.mindDanger}
              onClick={() => {
                if (!confirm) { setConfirm(true); return; }
                close(() => {
                  // Whoever was checked in there is checked out; the channel closes, its history stays.
                  for (const u of live ? here(live, existing.id) : []) act.checkIn(null, "tap", u);
                  updateGroup(groupId, (g) => deleteZone(g, existing.id));
                  onToast(`${existing.code} deleted. #${zoneChannelName(existing)} is closed, its history kept.`);
                });
              }}
            >
              {confirm ? `Tap again to delete ${existing.code}` : "Delete zone"}
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}

/* ---- crews & permissions: Command, the crews (roles), zone leads ---- */

function CrewsPage({ group, leaving, onBack, onSheet, closeSheet, onToast, onEditRole }: OperationPageProps) {
  const { me } = useChat();
  const info = groupInfo(group);
  const op = info.operation!;
  const command = info.roles.find((r) => r.id === op.commandRole);
  const crews = crewRolesOf(info);
  const manageZones = canManageZones(info, me);
  const zonesOf = (roleId: string) => op.zones.filter((z) => z.crews.includes(roleId)).map((z) => z.code);
  const powers = command ? permissionsFor(info).filter((p) => command.permissions.includes(p.id)).map((p) => p.label).join(", ") : "";
  return (
    <SubPage title="Crews & permissions" onBack={onBack} leaving={leaving}>
      <Group label="Command" note="Command approves requests, broadcasts and can All-call. Zone leads decide supplies and issues in their own zone.">
        {command && (
          <Row
            icon={<Tile tone={command.tone}><IconShield size={15} /></Tile>}
            title={command.name}
            sub={[people(roleCount(group, info, command.id)), powers].filter(Boolean).join(" · ")}
            onClick={() => onEditRole(command.id)}
          />
        )}
      </Group>

      <Group label={`Crews · ${crews.length}`} note="A crew is a role. Give it to people (in Members, or with a crew link) and they join its radio channel and the zones it works in.">
        {crews.map((r) => {
          const codes = zonesOf(r.id);
          return (
            <Row
              key={r.id}
              icon={<Tile tone={r.tone}><IconUserGroup size={15} /></Tile>}
              title={r.name}
              sub={`${people(roleCount(group, info, r.id))} · ${codes.length ? codes.join(", ") : "No zones yet"}`}
              onClick={() => onEditRole(r.id)}
            />
          );
        })}
        <Row icon={<span className={a.addTile}><IconPlus size={16} /></span>} title="Add crew" sub="e.g. Medical, Cleaning, Volunteers" onClick={() => onSheet(<CrewSheet groupId={group.id} onClose={closeSheet} onToast={onToast} />)} />
      </Group>

      {op.zones.length > 0 && (
        <Group label="Zone leads" note={manageZones ? "Tap a zone to pick its lead. A lead decides supplies and issues there, never moves between zones." : "Command picks zone leads."}>
          {op.zones.map((z) => (
            <Row
              key={z.id}
              icon={<span className={st.codeTile}>{z.code}</span>}
              title={z.name}
              sub={z.leadId ? userById(z.leadId).fullName : "No lead yet"}
              onClick={manageZones ? () => onSheet(<ZoneSheet groupId={group.id} zoneId={z.id} onClose={closeSheet} onToast={onToast} />) : undefined}
              trailing={manageZones ? <ZoneTrail leadId={z.leadId} /> : z.leadId ? <Av id={z.leadId} size={24} /> : <span />}
            />
          ))}
        </Group>
      )}
    </SubPage>
  );
}

const TONE_NAMES: Record<AvatarTone, string> = { clay: "Clay", sage: "Sage", ochre: "Ochre", denim: "Denim", plum: "Plum", graphite: "Graphite" };

/** A new crew: a name, a colour, and (optionally) the zones it works in. */
export function CrewSheet({ groupId, onClose, onToast }: { groupId: string; onClose: () => void; onToast: (t: string) => void }) {
  const { updateGroup, group, info, op } = useOperation(groupId);
  const [name, setName] = useState("");
  const [tone, setTone] = useState<AvatarTone>(() => ROLE_TONES[(op?.crews.length ?? 0) % ROLE_TONES.length]);
  const [zones, setZones] = useState<string[]>([]);
  if (!group || !info || !op) return null;
  const clean = name.trim();
  const taken = !!clean && info.roles.some((r) => r.name.toLowerCase() === clean.toLowerCase());
  const save = () => {
    updateGroup(groupId, (g) => {
      let next = addCrew(g, clean, tone);
      const nop = groupInfo(next).operation;
      const id = nop?.crews[nop.crews.length - 1];
      if (nop && id) for (const z of nop.zones) if (zones.includes(z.id)) next = upsertZone(next, { ...z, crews: [...z.crews, id] });
      return next;
    });
    onToast(`${clean} added${zones.length ? ` to ${zones.length} ${zones.length === 1 ? "zone" : "zones"}` : ""}`);
  };
  return (
    <Sheet title="New crew" onClose={onClose} action={{ label: "Add", disabled: !clean || taken, onClick: save }}>
      <input className={`${styles.plainInput} ${styles.mindTitleInput}`} value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} placeholder="Crew name, e.g. Medical" data-autofocus aria-label="Crew name" />
      {taken && <p className={`${styles.sheetNote} ${a.noteBad}`}>There’s already a role called {clean}.</p>}
      <p className={styles.sheetLabel}>Colour</p>
      <div className={a.tones} role="radiogroup" aria-label="Crew colour">
        {ROLE_TONES.map((t) => (
          <button key={t} role="radio" aria-checked={tone === t} aria-label={TONE_NAMES[t]} className={tone === t ? a.toneOn : undefined} style={{ background: TONES[t] }} onClick={() => setTone(t)}>
            {tone === t && <IconCheck size={12} />}
          </button>
        ))}
      </div>
      {op.zones.length > 0 && (
        <>
          <p className={styles.sheetLabel}>Works in</p>
          <div className={styles.chipGrid}>
            {op.zones.map((z) => {
              const on = zones.includes(z.id);
              return (
                <button key={z.id} className={`${styles.choice} ${on ? styles.choiceOn : ""}`} aria-pressed={on} onClick={() => setZones((x) => (on ? x.filter((y) => y !== z.id) : [...x, z.id]))}>
                  {z.code}
                </button>
              );
            })}
          </div>
        </>
      )}
      <p className={styles.sheetNote}>It gets its own radio channel. Give it to people from Members or with a crew link.</p>
    </Sheet>
  );
}

/* ---- invite links: the group's own, and crew links (crew + zone) ---- */

function linkSub(info: GroupInfo, l: OperationLink) {
  const op = info.operation;
  const roles = l.roleIds.map((r) => info.roles.find((x) => x.id === r)?.name).filter(Boolean).join(", ") || "No crew";
  const z = op && l.zoneId ? zoneById(op, l.zoneId) : undefined;
  return z ? `${roles} · checks in to ${z.code}` : roles;
}

function LinkCard({ group, code, title, sub, caption, onSheet, closeSheet, onToast, onDelete }: {
  group: Chat;
  code: string;
  title: string;
  sub: string;
  /** Under the QR: what scanning it does. */
  caption: string;
  onSheet: (n: ReactNode) => void;
  closeSheet: () => void;
  onToast: (t: string) => void;
  onDelete?: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const url = joinUrl(code);
  return (
    <div className={st.linkCard}>
      <div className={st.linkTop}>
        <span className={st.linkIcon}><IconLink size={16} /></span>
        <span className={a.rowText}><b>{title}</b><small>{sub}</small></span>
      </div>
      <span className={st.linkUrl}>{displayUrl(url)}</span>
      <div className={st.linkActions}>
        <button className={st.linkBtn} onClick={() => copyLink(url, onToast, `${title}: link copied`)}><IconCopy size={14} />Copy link</button>
        <button className={st.linkBtn} onClick={() => onSheet(<LinkQrSheet group={group} url={url} title={title} caption={caption} onClose={closeSheet} onToast={onToast} />)}><IconQr size={14} />QR</button>
        <button className={st.linkBtn} onClick={() => shareLink(url, `${group.name} · ${title}`, onToast)}><IconShare size={14} />Share</button>
        {onDelete && (
          <button
            className={`${st.linkBtn} ${confirm ? st.linkConfirm : st.linkDelete}`}
            onClick={() => (confirm ? onDelete() : setConfirm(true))}
            aria-label={confirm ? undefined : `Delete ${title}`}
          >
            <IconTrash size={14} />{confirm && "Delete"}
          </button>
        )}
      </div>
      <button className={st.tryLink} onClick={() => onSheet(<TryAsSheet groupId={group.id} code={code} label={title} onClose={closeSheet} />)}>
        <IconOpen size={13} />Try it as someone new
      </button>
    </div>
  );
}

function LinksPage({ group, leaving, onBack, onSheet, closeSheet, onToast }: OperationPageProps) {
  const { me, updateGroup } = useChat();
  const info = groupInfo(group);
  const op = info.operation!;
  if (!can(info, me, "invite")) {
    return (
      <SubPage title="Invite links" onBack={onBack} leaving={leaving}>
        <Group note="Only people who can invite see the links. Ask Command for one." ><Row title="Invite links" value="Not for you" /></Group>
      </SubPage>
    );
  }
  const card = { group, onSheet, closeSheet, onToast };
  return (
    <SubPage title="Invite links" onBack={onBack} leaving={leaving}>
      <Group label="Group link" note="Joins as a plain member: no crew, no zone.">
        <LinkCard {...card} code={info.inviteCode} title={group.name} sub="Anyone with the link" caption="Scan to join on NOD" />
      </Group>
      <Group
        label={`Crew links · ${op.links.length}`}
        note="A crew link also gives its crew and, when it has a zone, checks people in there as they join. Print the QR for the crew room."
      >
        {op.links.map((l) => (
          <LinkCard
            key={l.code}
            {...card}
            code={l.code}
            title={l.label}
            sub={linkSub(info, l)}
            caption={`Scan to join as ${linkSub(info, l)}`}
            onDelete={() => { updateGroup(group.id, (g) => removeLink(g, l.code)); onToast(`${l.label} deleted. The link stops working.`); }}
          />
        ))}
        <Row
          icon={<span className={a.addTile}><IconPlus size={16} /></span>}
          title="New crew link"
          sub={info.operation?.crews.length ? "A crew, and a zone to check in to" : "Add a crew first"}
          onClick={() => onSheet(<CrewLinkSheet groupId={group.id} onClose={closeSheet} onToast={onToast} />)}
        />
      </Group>
    </SubPage>
  );
}

/** A big QR for a link, to print or show on a screen. */
function LinkQrSheet({ group, url, title, caption, onClose, onToast }: { group: Chat; url: string; title: string; caption: string; onClose: () => void; onToast: (t: string) => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className={a.invite}>
        <div className={a.qrCard}>
          <div className={a.qrWrap}>
            <QrPattern seed={url} />
            <span className={a.qrFace}><Avatar glyph={initials(group.name)} tone={group.tone ?? "graphite"} photo={group.photo} size={40} /></span>
          </div>
          <b>{group.name}</b>
          <small>{caption}</small>
        </div>
        <div className={a.linkRow}>
          <span>{displayUrl(url)}</span>
          <button className={a.pill} onClick={() => copyLink(url, onToast)}><IconCopy size={13} /> Copy</button>
        </div>
        <p className={styles.demoNote}>The QR is drawn for the demo. Copy the link to try it.</p>
      </div>
    </Sheet>
  );
}

/** A crew link: a label, the crews it gives, and an optional zone to check in to. */
export function CrewLinkSheet({ groupId, onClose, onToast }: { groupId: string; onClose: () => void; onToast: (t: string) => void }) {
  const { me, updateGroup, group, info, op } = useOperation(groupId);
  const [label, setLabel] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [zoneId, setZoneId] = useState<string | null>(null);
  if (!group || !info || !op) return null;
  const crewRoles = crewRolesOf(info);
  const zone = zoneId ? zoneById(op, zoneId) : undefined;
  const auto = [roles.map((r) => info.roles.find((x) => x.id === r)?.name).filter(Boolean).join(", "), zone?.name].filter(Boolean).join(" · ");
  const save = () => {
    const link: OperationLink = {
      code: newLinkCode(),
      label: label.trim() || auto || "Crew link",
      roleIds: roles,
      ...(zoneId ? { zoneId } : {}),
      createdBy: me,
      createdAt: Date.now(),
    };
    updateGroup(groupId, (g) => addLink(g, link));
    void copyLink(joinUrl(link.code), onToast, `${link.label}: link ready and copied`);
  };
  return (
    <Sheet title="New crew link" onClose={onClose} action={{ label: "Create", disabled: !roles.length, onClick: save }}>
      <input className={`${styles.plainInput} ${styles.mindTitleInput}`} value={label} onChange={(e) => setLabel(e.target.value.slice(0, 40))} placeholder={auto || "Label, e.g. Security crew"} data-autofocus aria-label="Label" />
      <p className={styles.sheetLabel}>Gives the crew</p>
      {crewRoles.length ? (
        <div className={styles.chipGrid}>
          {crewRoles.map((r) => {
            const on = roles.includes(r.id);
            return (
              <button key={r.id} className={`${styles.choice} ${on ? styles.choiceOn : ""}`} aria-pressed={on} onClick={() => setRoles((x) => (on ? x.filter((y) => y !== r.id) : [...x, r.id]))}>
                <CrewDot tone={r.tone} />{r.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className={styles.sheetNote}>No crews yet. Add one in Crews &amp; permissions first.</p>
      )}
      {op.zones.length > 0 && (
        <>
          <p className={styles.sheetLabel}>Checks in to</p>
          <div className={styles.chipGrid}>
            <button className={`${styles.choice} ${!zoneId ? styles.choiceOn : ""}`} onClick={() => setZoneId(null)}>No zone</button>
            {op.zones.map((z) => (
              <button key={z.id} className={`${styles.choice} ${zoneId === z.id ? styles.choiceOn : ""}`} onClick={() => setZoneId(z.id)}>{z.code}</button>
            ))}
          </div>
        </>
      )}
      <p className={styles.sheetNote}>
        {roles.length
          ? `Whoever opens it joins ${group.name} as ${auto || "crew"}${zone ? ` and is checked in to ${zone.code} · ${zone.name}` : ""}.`
          : "Pick at least one crew."}
      </p>
    </Sheet>
  );
}

/** Opens a new window signed in as someone who isn't in the group yet, joining through the link. */
export function TryAsSheet({ groupId, code, label, onClose }: { groupId: string; code: string; label: string; onClose: () => void }) {
  const { state, me } = useChat();
  const group = state.data.chats.find((c) => c.id === groupId && !c.removedAt);
  if (!group) return null;
  const invited = new Set(groupInfo(group).invites.map((i) => i.userId));
  const outside = USERS.filter((u) => u.id !== me && !group.memberIds.includes(u.id));
  return (
    <Sheet title="Try it as someone new" onClose={onClose}>
      {(close) => (
        <>
          <p className={styles.sheetNote}>Opens a new window signed in as them, joining {group.name} through {label}. This window stays yours.</p>
          {outside.length ? (
            <div className={styles.listGroup}>
              {outside.map((u0) => {
                const u = userById(u0.id);
                return (
                  <button
                    key={u.id}
                    className={styles.contactRow}
                    onClick={() => {
                      window.open(`/?as=${encodeURIComponent(u.id)}&join=${encodeURIComponent(code)}`, "_blank", "noopener");
                      close();
                    }}
                  >
                    <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={40} shape="circle" />
                    <span className={styles.contactText}><b>{u.fullName}</b><small>{invited.has(u.id) ? "Invited, not joined yet" : u.username ? `@${u.username}` : "On NOD"}</small></span>
                    <IconOpen size={16} />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className={styles.sheetNote}>Everyone on NOD is already in {group.name}. Remove someone in Members to try it as them.</p>
          )}
        </>
      )}
    </Sheet>
  );
}

/* ===========================================================================
   The inbox: a live strip under an Operation's row
   =========================================================================== */

/**
 * "● Day 2 · Evening · 26 on site · 3 requests", and for crew where they are.
 * Its own component so only the strip re-renders as the live state changes
 * (a word on the radio), not the whole inbox.
 */
export function OperationRowStrip({ group, me, now }: { group: Chat; me: string; now: number }) {
  const live = useOpLive(group.id);
  const info = groupInfo(group);
  const op = info.operation;
  if (!op) return null;
  const phase = phaseOf(op, now);
  const shift = phase.on ? op.shifts.find((s) => s.id === live?.shift) : undefined;
  const there = live ? onSite(live) : 0;
  const pending = live ? pendingRequests(live).length : 0;
  const parts = [
    phase.text,
    shift?.name,
    phase.on || there ? `${there} on site` : null,
    pending ? `${pending} ${pending === 1 ? "request" : "requests"}` : null,
  ].filter(Boolean);
  const crew = !isCommand(info, me);
  const zone = crew && live ? zoneById(op, live.presence[me]?.zoneId) : undefined;
  return (
    <>
      <span className={st.strip}>
        <i className={`${st.dot} ${phase.on ? st.dotLive : ""}`} aria-hidden="true" />
        <span>{parts.join(" · ")}</span>
      </span>
      {crew && (
        <span className={st.where}>
          <IconLocation size={12} />
          <span>{zone ? `You’re in ${zone.code} · ${zone.name}` : "Not checked in"}</span>
        </span>
      )}
    </>
  );
}
