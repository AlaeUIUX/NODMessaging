"use client";

import { useMemo, useState, type ReactNode } from "react";
import { chatIdentity, initials, TONES } from "@/lib/chat/avatar";
import { billShares, doneColumn, money, unclaimedItems } from "@/lib/chat/ops";
import { useChat, userById } from "@/lib/chat/store";
import type { AvatarTone, Card, Chat, Message } from "@/lib/chat/types";
import { outcome } from "./Artifacts";
import Avatar from "./Avatar";
import {
  IconBell, IconBoard, IconBrush, IconCalendar, IconCheck, IconChecklist, IconChevronDown, IconClock, IconGame,
  IconLocation, IconMoneyReceive, IconMoneySend, IconPoll, IconReceipt, IconRoute, IconSearch, IconUserGroup, IconWheel,
} from "./Icons";
import Logo from "./Logo";
import { MyTasks } from "./Project";
import { relative, useNow } from "./ui";
import styles from "./chat.module.css";
import s from "./activity.module.css";

/**
 * Analytics: every card anyone has created in a chat you're in — polls,
 * checklists, reminders, plans, boards, bills, payments, doodles, the wheel,
 * tic-tac-toe — as a feed of cards (kicker + status, title, who and what kind,
 * a row of plain stats), filterable by the same Together/Money/Artifacts
 * groups the composer's "Add to message" sheet already uses.
 */

type Category = "together" | "money" | "artifacts";
type Filter = "all" | Category;

const CATEGORY: Record<Card["type"], Category> = {
  poll: "together", checklist: "together", reminder: "together", event: "together",
  plan: "together", project: "together", location: "together",
  payment: "money", bill: "money",
  sketch: "artifacts", tictactoe: "artifacts", wheel: "artifacts",
};

export const KIND_LABEL: Record<Card["type"], string> = {
  poll: "Poll", checklist: "Checklist", reminder: "Reminder", event: "Event", location: "Location",
  plan: "Plan", project: "Board", bill: "Bill", payment: "Payment",
  sketch: "Doodle", tictactoe: "Tic-tac-toe", wheel: "Wheel",
};

const CATEGORY_TONE: Record<Category, AvatarTone> = { together: "sage", money: "graphite", artifacts: "plum" };
const CATEGORY_LABEL: Record<Category, string> = { together: "Together", money: "Money", artifacts: "Artifacts" };

/** The icon in front of each card's own headline stat — one per kind. */
const STAT_ICON: Record<Card["type"], ReactNode> = {
  poll: <IconPoll size={13} />, checklist: <IconChecklist size={13} />, reminder: <IconBell size={13} />,
  location: <IconLocation size={13} />, event: <IconCalendar size={13} />, plan: <IconRoute size={13} />,
  project: <IconBoard size={13} />, bill: <IconReceipt size={13} />, sketch: <IconBrush size={13} />,
  tictactoe: <IconGame size={13} />, wheel: <IconWheel size={13} />,
  payment: <IconMoneyReceive size={13} />, // overridden per-mode in statIcon()
};

type StatKind = "type" | "progress" | "people" | "time";
interface Stat { kind: StatKind; text: string }

interface ActivityItem {
  message: Message;
  chat: Chat;
  category: Category;
  kind: string;
  title: string;
  /** Plain icon+number facts, no colour — a time stat is appended at render. */
  stats: Stat[];
  /** What it needs, in a few words: shown as small coloured text, not a pill. */
  detail: string;
  needsMe: boolean;
  resolved: boolean;
}

const euro = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "EUR" });
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const shortTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/** One line each: what it is, and where it stands — independent of `lib/chat/open`'s
 * "still open" semantics, since this feed shows finished and one-off items too. */
function summarize(message: Message, me: string, now: number): Omit<ActivityItem, "message" | "chat" | "kind"> | null {
  const c = message.card;
  if (!c || message.deletedAt) return null;
  const category = CATEGORY[c.type];

  switch (c.type) {
    case "checklist": {
      const done = c.items.filter((i) => i.doneBy).length;
      const left = c.items.length - done;
      const canEdit = c.everyoneCanEdit || message.authorId === me || c.editors.includes(me);
      const pct = c.items.length ? Math.round((done / c.items.length) * 100) : 0;
      return {
        category, title: c.title,
        stats: [{ kind: "type", text: plural(c.items.length, "item") }, { kind: "progress", text: `${pct}%` }],
        detail: left ? `${left} of ${c.items.length} left` : "All done", needsMe: left > 0 && canEdit, resolved: left === 0,
      };
    }
    case "poll": {
      const open = c.closedAt === null && now < c.closesAt;
      const voted = c.options.some((o) => o.votes.includes(me));
      const votes = c.options.reduce((n, o) => n + o.votes.length, 0);
      return {
        category, title: c.question, stats: [{ kind: "type", text: plural(votes, "vote") }],
        detail: !open ? "Closed" : voted ? "You voted" : "Awaiting your vote", needsMe: open && !voted, resolved: !open,
      };
    }
    case "event": {
      const open = c.startsAt > now;
      const mine = c.rsvps[me];
      const going = Object.values(c.rsvps).filter((r) => r === "going").length;
      return {
        category, title: c.title,
        stats: [{ kind: "type", text: shortDate(c.startsAt) }, { kind: "people", text: `${going} going` }],
        detail: !open ? "Past" : mine === "going" ? "You're in" : mine ? "You responded" : "Awaiting your RSVP",
        needsMe: open && !mine, resolved: !open,
      };
    }
    case "reminder": {
      const fired = c.firedAt !== null || c.at <= now;
      return { category, title: c.text, stats: [{ kind: "type", text: shortTime(c.at) }], detail: fired ? "Done" : "Upcoming", needsMe: false, resolved: fired };
    }
    case "location": {
      const live = c.live && (c.until ?? 0) > now;
      return {
        category, title: c.place, stats: [{ kind: "type", text: c.live ? "Live" : "Static" }],
        detail: !c.live ? "Shared" : live ? "Sharing live" : "Live ended", needsMe: false, resolved: !live,
      };
    }
    case "plan": {
      const stops = c.days.flatMap((d) => d.stops);
      const done = stops.filter((x) => x.doneBy).length;
      const left = stops.filter((x) => !x.doneBy);
      const pct = stops.length ? Math.round((done / stops.length) * 100) : 0;
      return {
        category, title: c.title,
        stats: [{ kind: "type", text: plural(stops.length, "stop") }, { kind: "progress", text: `${pct}%` }],
        detail: left.length ? `${left.length} of ${stops.length} left` : "Done",
        needsMe: left.some((x) => x.owner === me), resolved: left.length === 0,
      };
    }
    case "project": {
      const done = doneColumn(c);
      const live = Object.values(c.tasks).filter((t) => !t.deleted);
      const open = live.filter((t) => t.column !== done).length;
      const mine = live.filter((t) => t.assignee === me && t.column !== done).length;
      const pct = live.length ? Math.round(((live.length - open) / live.length) * 100) : 0;
      return {
        category, title: c.name,
        stats: [{ kind: "type", text: plural(live.length, "task") }, { kind: "progress", text: `${pct}%` }],
        detail: !live.length ? "No tasks yet" : open ? `${open} open${mine ? ` · ${mine} yours` : ""}` : "All done",
        needsMe: mine > 0, resolved: live.length > 0 && open === 0,
      };
    }
    case "payment": {
      if (c.mode === "sent") {
        const isAuthor = message.authorId === me;
        return {
          category, title: c.note || "Payment", stats: [{ kind: "type", text: euro(c.amount) }],
          detail: `${isAuthor ? "You sent" : "Sent to you"} · ${euro(c.amount)}`, needsMe: false, resolved: true,
        };
      }
      const unpaid = c.from.filter((id) => !c.paidBy.includes(id));
      const owe = c.from.includes(me) && !c.paidBy.includes(me);
      return {
        category, title: c.note || `Request · ${euro(c.amount)}`, stats: [{ kind: "type", text: euro(c.amount) }],
        detail: owe ? `You owe ${euro(c.amount)}` : unpaid.length ? `${unpaid.length} unpaid` : "Settled",
        needsMe: owe, resolved: unpaid.length === 0,
      };
    }
    case "bill": {
      const shares = billShares(c);
      const owing = Object.keys(shares).filter((id) => id !== c.paidBy && shares[id] > 0 && !c.paid.includes(id));
      const unclaimed = unclaimedItems(c).length;
      const mine = owing.includes(me);
      return {
        category, title: c.merchant,
        stats: [{ kind: "type", text: money(c.total, c.currency) }, { kind: "people", text: people(Object.keys(shares).length) }],
        detail: mine ? `You owe ${money(shares[me], c.currency)}` : unclaimed ? `${unclaimed} unclaimed` : owing.length ? `${owing.length} to pay` : "Settled",
        needsMe: mine, resolved: owing.length === 0 && unclaimed === 0,
      };
    }
    case "tictactoe": {
      const res = outcome(c.board);
      const moves = c.board.filter(Boolean).length;
      return {
        category, title: "Tic-tac-toe", stats: [{ kind: "type", text: plural(moves, "move") }],
        detail: !res ? "In progress" : res.winner === "draw" ? "A draw" : `${res.winner === me ? "You" : userById(res.winner).name} won`,
        needsMe: false, resolved: !!res,
      };
    }
    case "sketch":
      return {
        category, title: c.prompt || "Doodle", stats: [{ kind: "type", text: plural(c.strokes.length, "stroke") }],
        detail: c.strokes.length ? "In progress" : "Empty canvas", needsMe: false, resolved: false,
      };
    case "wheel": {
      const last = c.spins[c.spins.length - 1];
      return {
        category, title: c.question, stats: [{ kind: "type", text: plural(c.spins.length, "spin") }],
        detail: last ? `Landed on ${c.options[last.index]}` : `${c.options.length} options`, needsMe: false, resolved: false,
      };
    }
  }
}

const OPTIONS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "together", label: "Together" },
  { id: "money", label: "Money" },
  { id: "artifacts", label: "Artifacts" },
];

/** A tone's soft-tinted background + full-strength text, the same pairing every status/tag chip in the app uses. */
const tint = (hex: string) => ({ background: `color-mix(in srgb, ${hex} 16%, transparent)`, color: hex });

function CategoryPicker({ value, counts, onChange }: { value: Filter; counts: Record<Filter, number>; onChange: (f: Filter) => void }) {
  const [open, setOpen] = useState(false);
  const current = OPTIONS.find((o) => o.id === value)!;
  const style = value === "all" ? undefined : tint(TONES[CATEGORY_TONE[value]]);
  return (
    <div className={s.pickerWrap}>
      <button className={s.pickerBtn} style={style} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        {current.label}
        <em>{counts[value]}</em>
        <IconChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className={s.scrim} onClick={() => setOpen(false)} />
          <div
            className={`${s.menu} ${styles.glassStrong}`}
            role="menu"
            aria-label="Filter by kind"
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } }}
          >
            {OPTIONS.map((o) => (
              <button
                key={o.id}
                role="menuitemradio"
                aria-checked={value === o.id}
                className={`${s.menuItem} ${value === o.id ? s.menuItemOn : ""}`}
                onClick={() => { setOpen(false); onChange(o.id); }}
              >
                <i className={s.pickerDot} style={o.id === "all" ? undefined : { background: TONES[CATEGORY_TONE[o.id as Category]] }} />
                <span>{o.label}</span>
                <em>{counts[o.id]}</em>
                {value === o.id && <IconCheck size={13} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const ago = (ts: number, now: number) => (now - ts < 60_000 ? "now" : relative(now - ts));
const statIcon = (c: Card) =>
  c.type === "payment" ? (c.mode === "sent" ? <IconMoneySend size={13} /> : <IconMoneyReceive size={13} />) : STAT_ICON[c.type];
const statGlyph = (stat: Stat, card: Card) =>
  stat.kind === "progress" ? <IconWheel size={13} />
  : stat.kind === "people" ? <IconUserGroup size={13} />
  : stat.kind === "time" ? <IconClock size={13} />
  : statIcon(card);

const SECTION_ORDER: Category[] = ["together", "money", "artifacts"];

function FeedCard({ it, me, now, index, onOpen }: { it: ActivityItem; me: string; now: number; index: number; onOpen: () => void }) {
  const identity = chatIdentity(it.chat, me, userById);
  const author = userById(it.message.authorId);
  const statusColor = it.needsMe ? "var(--warn)" : it.resolved ? "var(--ok)" : "var(--ink-3)";
  const allStats: Stat[] = [...it.stats, { kind: "time", text: ago(it.message.createdAt, now) }];
  return (
    <li className={styles.rowEnter} style={{ ["--i" as string]: Math.min(index, 12) }}>
      <button className={s.card} onClick={onOpen}>
        <div className={s.cardTop}>
          <span className={s.kicker}>{identity.label}</span>
          <span className={s.statusText} style={{ color: statusColor }}>{it.detail}</span>
        </div>
        <span className={s.divider} aria-hidden="true" />

        <h3 className={styles.cardTitle}>{it.title}</h3>

        <div className={s.metaRow}>
          <IconUserGroup size={14} />
          <Avatar glyph={initials(author.fullName)} tone={author.tone} size={22} shape="circle" />
          <span className={s.authorName}>{it.message.authorId === me ? "You" : author.name}</span>
          <span className={s.tag} style={tint(TONES[CATEGORY_TONE[it.category]])}>{CATEGORY_LABEL[it.category]}</span>
          <span className={`${s.tag} ${s.tagNeutral}`}>{it.kind}</span>
        </div>

        <div className={s.cardFoot}>
          {allStats.map((stat, si) => (
            <span key={si} className={s.statGroup}>
              {statGlyph(stat, it.message.card!)}
              {stat.text}
            </span>
          ))}
        </div>
      </button>
    </li>
  );
}

export default function AnalyticsTab({ onOpenChat, mode, onOpenWidget }: {
  onOpenChat: (chat: Chat, messageId?: string) => void;
  /** "v1" opens the item in its chat (scrolled to and highlighted); "v2" opens the item's own page. */
  mode: "v1" | "v2";
  onOpenWidget: (chat: Chat, message: Message) => void;
}) {
  const { state, me } = useChat();
  const meUser = userById(me);
  const now = useNow(60_000);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const out: ActivityItem[] = [];
    for (const chat of state.data.chats) {
      if (!chat.memberIds.includes(me)) continue;
      for (const message of state.data.messages[chat.id] ?? []) {
        const sum = summarize(message, me, now);
        if (sum) out.push({ message, chat, kind: KIND_LABEL[message.card!.type], ...sum });
      }
    }
    return out.sort((a, b) => b.message.createdAt - a.message.createdAt);
  }, [state.data.chats, state.data.messages, me, now]);

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: items.length, together: 0, money: 0, artifacts: 0 };
    for (const it of items) out[it.category] += 1;
    return out;
  }, [items]);

  const byCategory = filter === "all" ? items : items.filter((i) => i.category === filter);
  const q = query.trim().toLowerCase();
  const visible = q
    ? byCategory.filter((it) => it.title.toLowerCase().includes(q) || chatIdentity(it.chat, me, userById).label.toLowerCase().includes(q))
    : byCategory;
  const needsMe = visible.filter((i) => i.needsMe).length;

  // Grouped like "Your tasks": one labelled section per kind, in a fixed order.
  const sections = SECTION_ORDER
    .map((cat) => ({ category: cat, label: CATEGORY_LABEL[cat], items: visible.filter((it) => it.category === cat) }))
    .filter((sec) => sec.items.length > 0);

  return (
    <>
      <header className={styles.profile}>
        <div className={styles.profileRow}>
          <div className={styles.profileId}>
            <span className={styles.profileAvatar}>
              <Avatar glyph={initials(meUser.fullName)} tone={meUser.tone} size={40} shape="circle" />
              <span className={styles.orgBadge}><Logo size={12} /></span>
            </span>
            <div className={styles.profileText}>
              <b>Analytics</b>
              <span>
                {items.length
                  ? `${visible.length} item${visible.length === 1 ? "" : "s"}${needsMe ? ` · ${needsMe} need${needsMe === 1 ? "s" : ""} you` : ""}`
                  : "Nothing created yet"}
              </span>
            </div>
          </div>
          {items.length > 0 && <CategoryPicker value={filter} counts={counts} onChange={setFilter} />}
        </div>
        {items.length > 0 && (
          <label className={styles.searchBar}>
            <IconSearch size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search analytics..." />
          </label>
        )}
      </header>

      <div className={styles.inboxBody}>
        <div className={styles.inboxScroll}>
          {!q && (filter === "all" || filter === "together") && <MyTasks onOpenChat={onOpenChat} />}

          {items.length === 0 ? (
            <div className={styles.mindStarter}>
              <Logo size={36} />
              <h2>Nothing here yet</h2>
              <p>Polls, checklists, bills, plans, boards and artifacts you create in any chat will show up here.</p>
            </div>
          ) : sections.length === 0 ? (
            <p className={styles.emptyInbox}>{q ? `Nothing matches "${query}".` : "Nothing in this category yet."}</p>
          ) : (
            sections.map((sec) => (
              <section key={sec.category} className={s.section}>
                <p className={s.sectionHead}>{sec.label}<em>{sec.items.length}</em></p>
                <ul className={s.list}>
                  {sec.items.map((it, i) => (
                    <FeedCard
                      key={it.message.id}
                      it={it}
                      me={me}
                      now={now}
                      index={i}
                      onOpen={() => (mode === "v2" ? onOpenWidget(it.chat, it.message) : onOpenChat(it.chat, it.message.id))}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}
