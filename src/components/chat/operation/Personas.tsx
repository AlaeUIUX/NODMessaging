"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useAccounts } from "@/lib/chat/account";
import { initials } from "@/lib/chat/avatar";
import { groupInfo, isAdmin, rolesOf } from "@/lib/chat/groups";
import { effectiveRule, isQuiet, readMutes } from "@/lib/chat/mutes";
import { crewOf, leadsZone, zoneById, type OpLive } from "@/lib/chat/operation";
import { useOpLive } from "@/lib/chat/opstore";
import { allPeople } from "@/lib/chat/people";
import { EWC_ID } from "@/lib/chat/seed-ops";
import { useChat, userById } from "@/lib/chat/store";
import type { Chat, GroupInfo } from "@/lib/chat/types";
import Avatar from "../Avatar";
import { IconBellOff, IconCheck, IconChevronDown, IconClose, IconOpen, IconSearch } from "../Icons";
import styles from "../chat.module.css";
import p from "./personas.module.css";

/**
 * Seeing the app as someone else: "Viewing as Alae · Admin, Command" sits
 * above the phone, and opens a panel of the Operation's people by crew.
 * Switch swaps the whole phone to that person (nothing reloads); the window
 * button opens them side by side, both live.
 */

/** People the demo is told through, each with the thing to try as them. */
const SUGGESTED: { id: string; note: string }[] = [
  { id: "me", note: "Approve requests, send a critical broadcast" },
  { id: "reema", note: "Operation lead, on the Command channel" },
  { id: "faisal", note: "Stage B is short: ask for people" },
  { id: "jamshad", note: "Decide the spill at Gate 3" },
  { id: "salman", note: "Mutes EWC: critical broadcasts still break through" },
  { id: "tariq", note: "New this shift: scan in to a zone" },
];
/** Who a second window is most useful as. */
const WINDOW_PICKS = ["me", "charles", "reema", "faisal", "jamshad", "salman", "tariq"];

const EMPTY = new Set<string>();

export function openAs(userId: string) {
  window.open(`/?as=${encodeURIComponent(userId)}`, "_blank", "noopener");
}

/** The person a "second tab" link opens as: Charles for Alae (the chat demo), else Alae. */
export const companionOf = (me: string) => (me === "me" ? "charles" : "me");

/** "Runners" → "Runner"; names that aren't a plural stay as they are. */
const singular = (name: string) => (/^[A-Za-z]+s$/.test(name) && !/ss$/.test(name) ? name.slice(0, -1) : name);

/** "B2 lead", "Admin, Command", "Runner · A1", "Security · Not checked in". */
export function personaTitle(info: GroupInfo | undefined, live: OpLive | null, userId: string) {
  const op = info?.operation;
  if (!info || !op) return "";
  const lead = leadsZone(op, userId);
  if (lead) return `${lead.code} lead`;
  if (rolesOf(info, userId).includes(op.commandRole)) return isAdmin(info, userId) ? "Admin, Command" : "Command";
  const crew = crewOf(info, userId);
  const what = crew ? singular(crew.name) : isAdmin(info, userId) ? "Admin" : "Crew";
  if (!live) return what;
  const zone = zoneById(op, live.presence[userId]?.zoneId);
  return `${what} · ${zone ? zone.code : "Not checked in"}`;
}

export interface PersonGroup { id: string; label: string; ids: string[] }

/**
 * Everyone on NOD, by the Operation's crews: Command first, then each crew
 * (leads first), then anyone without a crew or outside the Operation.
 */
export function personGroups(chats: Chat[], groupId = EWC_ID): PersonGroup[] {
  const everyone = allPeople().map((u) => u.id);
  const group = chats.find((c) => c.id === groupId && !c.groupId && !c.removedAt);
  const op = group?.group?.operation;
  if (!group || !op) return [{ id: "all", label: "People", ids: everyone }];
  const info = groupInfo(group);
  const members = group.memberIds;
  const byName = (a: string, b: string) => userById(a).fullName.localeCompare(userById(b).fullName);
  const zoneOrder = (u: string) => { const z = leadsZone(op, u); return z ? op.zones.indexOf(z) : 99; };
  const command = members.filter((u) => rolesOf(info, u).includes(op.commandRole))
    .sort((a, b) => Number(isAdmin(info, b)) - Number(isAdmin(info, a)) || byName(a, b));
  const out: PersonGroup[] = [{ id: "command", label: info.roles.find((r) => r.id === op.commandRole)?.name ?? "Command", ids: command }];
  for (const id of op.crews) {
    const ids = members.filter((u) => !command.includes(u) && crewOf(info, u)?.id === id).sort((a, b) => zoneOrder(a) - zoneOrder(b) || byName(a, b));
    out.push({ id, label: info.roles.find((r) => r.id === id)?.name ?? "Crew", ids });
  }
  const placed = new Set(out.flatMap((g) => g.ids));
  out.push({ id: "nocrew", label: "No crew yet", ids: members.filter((u) => !placed.has(u)).sort(byName) });
  out.push({ id: "others", label: `Not in ${group.name}`, ids: everyone.filter((u) => !members.includes(u)).sort(byName) });
  return out.filter((g) => g.ids.length);
}

/** Members who have the group quietened (each person's mutes are their own). For handlers, not rendering. */
function mutedIn(group: Chat) {
  const now = Date.now();
  return new Set(group.memberIds.filter((u) => isQuiet(effectiveRule(readMutes(u), group, now))));
}

/** Moves focus up and down a list of [data-nav] items (and back to `first` above the top). */
function arrowNav(e: KeyboardEvent, box: HTMLElement | null, first?: HTMLElement | null) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return false;
  if ((e.key === "Home" || e.key === "End") && document.activeElement === first) return false;
  const items = [...(box?.querySelectorAll<HTMLElement>("[data-nav]") ?? [])];
  if (!items.length) return false;
  e.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  let next: HTMLElement | null | undefined;
  if (e.key === "Home") next = items[0];
  else if (e.key === "End") next = items[items.length - 1];
  else if (e.key === "ArrowDown") next = items[Math.min(items.length - 1, i + 1)];
  else next = i <= 0 ? first ?? items[0] : items[i - 1];
  next?.focus({ preventScroll: true });
  next?.scrollIntoView({ block: "nearest" });
  return true;
}

/** Closes a popover when a press lands outside it. */
function useOutside(open: boolean, root: RefObject<HTMLElement | null>, close: () => void) {
  const latest = useRef(close);
  useEffect(() => { latest.current = close; });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) latest.current(); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, root]);
}

/* ===========================================================================
   The switcher above the phone
   =========================================================================== */

export function PersonaSwitcher({ groupId = EWC_ID }: { groupId?: string }) {
  const { state, me, setMe, peers } = useChat();
  const accounts = useAccounts();
  const live = useOpLive(groupId);
  const group = state.data.chats.find((c) => c.id === groupId && !c.groupId && !c.removedAt);
  const info = group?.group?.operation ? groupInfo(group) : undefined;
  const members = group?.memberIds ?? [];

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [muted, setMuted] = useState<Set<string>>(EMPTY);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const listId = useId();

  useOutside(open, root, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const f = requestAnimationFrame(() => search.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(f);
  }, [open]);

  const show = () => {
    // Who has the Operation muted, read as the panel opens.
    setMuted(group ? mutedIn(group) : EMPTY);
    setQuery("");
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  const pick = (id: string) => {
    hide();
    if (id !== me) setMe(id);
  };

  const signedIn = accounts === null ? null : accounts.includes(me);
  const title = (u: string) => (info && members.includes(u) ? personaTitle(info, live, u) : "");
  const onLine = (u: string) => u !== me && peers.some((x) => x.userId === u);

  const q = query.trim().toLowerCase();
  const groups = open ? personGroups(state.data.chats, groupId) : [];
  const matches = (u: string, label: string) => {
    if (!q) return true;
    const x = userById(u);
    return `${x.fullName} ${x.name} ${x.username ?? ""} ${title(u)} ${label}`.toLowerCase().includes(q);
  };
  const shown = groups.map((g) => ({ ...g, ids: g.ids.filter((u) => matches(u, g.label)) })).filter((g) => g.ids.length);
  const total = groups.reduce((n, g) => n + g.ids.length, 0);
  const found = shown.reduce((n, g) => n + g.ids.length, 0);
  const suggested = q ? [] : SUGGESTED.filter((s) => members.includes(s.id) || allPeople().some((u) => u.id === s.id));

  const row = (u: string, note?: string) => (
    <PersonRow
      key={u}
      id={u}
      title={title(u)}
      note={note}
      muted={muted.has(u)}
      current={u === me && !!signedIn}
      onLine={onLine(u)}
      onPick={() => pick(u)}
      onWindow={() => openAs(u)}
    />
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (query && document.activeElement === search.current) setQuery("");
      else hide();
      return;
    }
    arrowNav(e, list.current, search.current);
  };

  return (
    <div ref={root} className={p.dock}>
      <button
        ref={trigger}
        className={`${p.trigger} ${styles.glassStrong}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? hide() : show())}
      >
        <span className={p.triggerLabel}>Viewing as</span>
        {signedIn === false ? (
          <span className={p.triggerWho}><b>Nobody yet</b><span>· pick someone</span></span>
        ) : (
          <>
            <PersonFace id={me} size={22} />
            <span className={p.triggerWho}>
              <b>{signedIn === null ? "…" : userById(me).name}</b>
              {signedIn && title(me) && <span>· {title(me)}</span>}
            </span>
          </>
        )}
        <span className={p.triggerChevron}><IconChevronDown size={14} /></span>
      </button>

      {open && (
        <div id={panelId} className={p.panel} role="dialog" aria-label="View the app as someone else" onKeyDown={onKeyDown}>
          <header className={p.head}>
            <div>
              <h2>View as</h2>
              <p>Switch swaps the phone to that person. A new window keeps both live, side by side.</p>
            </div>
            <button className={p.iconBtn} onClick={hide} aria-label="Close"><IconClose size={16} /></button>
          </header>
          <label className={p.search}>
            <IconSearch size={16} />
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${total} people`}
              aria-label="Search people"
              aria-controls={listId}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className={p.srOnly} aria-live="polite">{q ? `${found} ${found === 1 ? "person" : "people"} found` : ""}</p>
          <div ref={list} id={listId} className={p.scroll}>
            {suggested.length > 0 && (
              <Section label="Suggested" count={suggested.length} tinted>
                {suggested.map((s) => row(s.id, s.note))}
              </Section>
            )}
            {shown.map((g) => (
              <Section key={g.id} label={g.label} count={g.ids.length}>
                {g.ids.map((u) => row(u))}
              </Section>
            ))}
            {q && !found && <p className={p.empty}>No one matches “{query.trim()}”.</p>}
          </div>
          <footer className={p.foot}>
            {peers.length
              ? <><i className={p.liveDot} aria-hidden="true" />{peers.length} other window{peers.length > 1 ? "s" : ""} open: {[...new Set(peers.map((x) => userById(x.userId).name))].join(", ")}</>
              : "Only this window is open. Everyone else is simulated."}
          </footer>
        </div>
      )}
    </div>
  );
}

function PersonFace({ id, size, online }: { id: string; size: number; online?: boolean }) {
  const u = userById(id);
  return <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={size} shape="circle" online={online} />;
}

function Section({ label, count, tinted, children }: { label: string; count: number; tinted?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <section className={`${p.section} ${tinted ? p.sectionTinted : ""}`} aria-labelledby={id}>
      <h3 id={id}>{label}<small>{count}</small></h3>
      <ul>{children}</ul>
    </section>
  );
}

function PersonRow({ id, title, note, muted, current, onLine, onPick, onWindow }: {
  id: string;
  title: string;
  note?: string;
  muted: boolean;
  current: boolean;
  onLine: boolean;
  onPick: () => void;
  onWindow: () => void;
}) {
  const u = userById(id);
  const said = [title, muted ? "muted" : "", onLine ? "open in another window" : ""].filter(Boolean).join(", ");
  return (
    <li className={`${p.row} ${current ? p.rowOn : ""}`}>
      <button
        className={p.rowMain}
        data-nav
        onClick={onPick}
        aria-current={current || undefined}
        aria-label={current ? `Viewing as ${u.fullName}${said ? `, ${said}` : ""}` : `Switch to ${u.fullName}${said ? `, ${said}` : ""}`}
      >
        <PersonFace id={id} size={32} online={onLine} />
        <span className={p.rowText}>
          <b>{u.fullName}</b>
          {(title || muted) && (
            <small>
              {title}
              {muted && <span className={p.muted}><IconBellOff size={11} />Muted</span>}
            </small>
          )}
          {note && <em>{note}</em>}
        </span>
        {current
          ? <span className={p.viewing}><IconCheck size={13} />Viewing</span>
          : <span className={p.switch}>Switch</span>}
      </button>
      <button className={p.iconBtn} onClick={onWindow} aria-label={`Open ${u.fullName} in a new window`} title="Open in a new window">
        <IconOpen size={16} />
      </button>
    </li>
  );
}

/* ===========================================================================
   "Open a second window as…", for the top bar
   =========================================================================== */

export function SecondWindowMenu({ className }: { className?: string }) {
  const { state, me } = useChat();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const live = useOpLive(EWC_ID);
  const group = state.data.chats.find((c) => c.id === EWC_ID && !c.groupId && !c.removedAt);
  const info = group?.group?.operation ? groupInfo(group) : undefined;

  useOutside(open, root, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const f = requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>("[data-nav]")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(f);
  }, [open]);

  const close = () => { setOpen(false); button.current?.focus({ preventScroll: true }); };
  const people = WINDOW_PICKS.filter((u) => u !== me && allPeople().some((x) => x.id === u));

  return (
    <div ref={root} className={p.menuRoot}>
      <button
        ref={button}
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        Open a second window <IconChevronDown size={14} />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          className={p.menu}
          role="menu"
          aria-label="Open a second window as"
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Tab") { if (e.key === "Escape") e.preventDefault(); close(); return; }
            arrowNav(e, menu.current);
          }}
        >
          <p className={p.menuHead}>Open a second window as</p>
          {people.map((u) => {
            const x = userById(u);
            const t = info && group?.memberIds.includes(u) ? personaTitle(info, live, u) : "";
            return (
              <button key={u} role="menuitem" data-nav className={p.menuItem} onClick={() => { openAs(u); close(); }}>
                <PersonFace id={u} size={26} />
                <span className={p.rowText}><b>{x.fullName}</b>{t && <small>{t}</small>}</span>
                <IconOpen size={15} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** "Open a second tab": as the person who makes the best pair with whoever this window is. */
export function CompanionLink({ className, children }: { className?: string; children: ReactNode }) {
  const { me } = useChat();
  return <a className={className} href={`/?as=${companionOf(me)}`} target="_blank" rel="noopener">{children}</a>;
}
