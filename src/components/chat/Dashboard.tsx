"use client";

import { useMemo, useState } from "react";
import { chatIdentity, initials } from "@/lib/chat/avatar";
import { isOverdue } from "@/lib/chat/invoice";
import { collectionItems, dayKey, lastSevenDays, useMind } from "@/lib/chat/mind";
import { openState, type OpenState } from "@/lib/chat/open";
import { billShares, doneColumn, money } from "@/lib/chat/ops";
import { useChat, userById } from "@/lib/chat/store";
import type { Card, Chat, Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { Emoji } from "@/lib/chat/emoji";
import {
  IconBell, IconBoard, IconCalendar, IconChecklist, IconChevron, IconClock, IconGame, IconLocation, IconMoneyReceive,
  IconPoll, IconReceipt, IconRoute,
} from "./Icons";
import Logo from "./Logo";
import { MyTasks } from "./Project";
import { smooth, useNow } from "./ui";
import d from "./dashboard.module.css";

/**
 * The dashboard: everything that can be tracked, from every chat and from
 * Mind, in one place. What needs you comes first, then what's coming up,
 * then how things are going. Every row opens the chat it came from.
 */

const DAY = 86_400_000;
const SHOWN = 4;

const CARD_ICON: Partial<Record<Card["type"], React.ReactNode>> = {
  checklist: <IconChecklist size={16} />,
  poll: <IconPoll size={16} />,
  event: <IconCalendar size={16} />,
  payment: <IconMoneyReceive size={16} />,
  reminder: <IconBell size={16} />,
  location: <IconLocation size={16} />,
  tictactoe: <IconGame size={16} />,
  plan: <IconRoute size={16} />,
  bill: <IconReceipt size={16} />,
  project: <IconBoard size={16} />,
};

/** When a card has to be dealt with by, if it says. */
function deadline(c: Card | undefined): number | null {
  if (!c) return null;
  if (c.type === "poll") return c.closesAt;
  if (c.type === "event") return c.startsAt;
  if (c.type === "reminder") return c.at;
  if (c.type === "payment" && c.invoice) return c.invoice.dueAt;
  return null;
}

const greeting = (now: number) => {
  const h = new Date(now).getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
const weekday = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: "short" });
const dayLabel = (t: number, now: number) => {
  const k = dayKey(t);
  if (k === dayKey(now)) return "Today";
  if (k === dayKey(now + DAY)) return "Tomorrow";
  return new Date(t).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
};
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: smooth(), block: "start" });
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

type Row = { key: string; chat: Chat; message: Message; state: OpenState; label: string };
type Upcoming = { key: string; at: number; title: string; sub: string; icon: React.ReactNode; chat?: Chat; timed: boolean };

export default function Dashboard({ onOpenChat, onSettings, onUnread, onMind }: {
  onOpenChat: (chat: Chat) => void;
  onSettings: () => void;
  onUnread: () => void;
  onMind: () => void;
}) {
  const { state, me, lastReadAt } = useChat();
  const { mind } = useMind(me);
  const now = useNow(60_000);
  const meUser = userById(me);
  const [allNeeds, setAllNeeds] = useState(false);

  const data = useMemo(() => {
    const chats = state.data.chats.filter((c) => c.memberIds.includes(me));
    let muted: string[] = [];
    try { muted = JSON.parse(localStorage.getItem(`nod.chat.muted.${me}`) ?? "[]"); } catch { /* private mode */ }

    const needs: Row[] = [];
    const checklists: (Row & { done: number; total: number })[] = [];
    const invoices: (Row & { amount: number; out: boolean; overdue: boolean; paid: boolean })[] = [];
    const upcoming: Upcoming[] = [];
    let unread = 0;
    let unreadChats = 0;
    let youOwe = 0;
    let owedToYou = 0;
    const perDay = new Map(lastSevenDays().map((k) => [k, 0]));
    const perChat = new Map<string, number>();
    const horizon = now + 7 * DAY;

    for (const chat of chats) {
      const label = chatIdentity(chat, me, userById).label;
      const messages = state.data.messages[chat.id] ?? [];
      const lastRead = lastReadAt(chat.id);
      const fresh = messages.filter((m) => m.authorId !== me && m.createdAt > lastRead && !m.deletedAt).length;
      if (fresh && !muted.includes(chat.id)) { unread += fresh; unreadChats++; }

      for (const m of [...(state.data.archive[chat.id] ?? []), ...messages]) {
        const k = dayKey(m.createdAt);
        if (perDay.has(k) && !m.deletedAt) {
          perDay.set(k, perDay.get(k)! + 1);
          perChat.set(chat.id, (perChat.get(chat.id) ?? 0) + 1);
        }
      }

      for (const m of messages) {
        const c = m.card;
        if (!c || m.deletedAt) continue;
        const st = openState(m, me, now);
        const row = { key: `${chat.id}:${m.id}`, chat, message: m, label, state: st! };
        if (st?.open && st.needsMe) needs.push(row);

        if (c.type === "checklist") {
          checklists.push({ ...row, state: st ?? { open: false, needsMe: false, summary: "", title: c.title }, done: c.items.filter((i) => i.doneBy).length, total: c.items.length });
        }
        if (c.type === "payment" && c.mode === "request") {
          const cents = Math.round(c.amount * 100);
          if (c.from.includes(me) && !c.paidBy.includes(me)) youOwe += cents;
          if (m.authorId === me) owedToYou += cents * c.from.filter((id) => !c.paidBy.includes(id)).length;
          if (c.invoice && (m.authorId === me || c.from.includes(me))) {
            const paid = c.paidBy.includes(c.from[0]);
            invoices.push({ ...row, state: st ?? { open: false, needsMe: false, summary: "Paid", title: `Invoice ${c.invoice.number}` }, amount: cents, out: m.authorId === me, paid, overdue: !paid && isOverdue(c.invoice.dueAt, now) });
            if (!paid && c.invoice.dueAt < horizon) {
              upcoming.push({ key: `inv:${m.id}`, at: c.invoice.dueAt, timed: false, title: `Invoice ${c.invoice.number} due`, sub: `${money(cents)} · ${label}`, icon: <IconReceipt size={15} />, chat });
            }
          }
        }
        if (c.type === "bill") {
          const shares = billShares(c);
          if (c.paidBy !== me && shares[me] > 0 && !c.paid.includes(me)) youOwe += shares[me];
          if (c.paidBy === me) owedToYou += Object.entries(shares).filter(([id, v]) => id !== me && v > 0 && !c.paid.includes(id)).reduce((s, [, v]) => s + v, 0);
        }
        if (c.type === "event" && c.startsAt > now && c.startsAt < horizon) {
          const going = Object.values(c.rsvps).filter((r) => r === "going").length;
          upcoming.push({ key: `ev:${m.id}`, at: c.startsAt, timed: true, title: c.title, sub: `${c.place ? `${c.place} · ` : ""}${going} going · ${label}`, icon: <IconCalendar size={15} />, chat });
        }
        if (c.type === "reminder" && c.firedAt === null && c.at > now && c.at < horizon && (c.audience === "everyone" || m.authorId === me)) {
          upcoming.push({ key: `rem:${m.id}`, at: c.at, timed: true, title: c.text, sub: `Reminder · ${label}`, icon: <IconBell size={15} />, chat });
        }
        if (c.type === "plan") {
          const going = c.rsvps[me] === "going";
          for (const stop of c.days.flatMap((x) => x.stops)) {
            if (stop.doneBy || stop.at === null || stop.at < now || stop.at > horizon) continue;
            if (stop.owner === me || going) upcoming.push({ key: `stop:${stop.id}`, at: stop.at, timed: true, title: stop.title, sub: `${c.title}${stop.place ? ` · ${stop.place}` : ""}`, icon: <IconRoute size={15} />, chat });
          }
        }
        if (c.type === "project") {
          const done = doneColumn(c);
          for (const t of Object.values(c.tasks)) {
            if (t.deleted || t.assignee !== me || t.column === done || t.due === null || t.due > horizon) continue;
            upcoming.push({ key: `task:${t.id}`, at: t.due, timed: false, title: t.title, sub: `${t.due < now ? "Overdue · " : ""}${c.name}`, icon: <IconClock size={15} />, chat });
          }
        }
      }
    }

    // Mind dates count as plans too.
    if (mind) {
      for (const b of Object.values(mind.blocks)) {
        if ((b.kind === "date" || (b.kind === "amount" && !b.paid)) && b.at && b.at > now - DAY && b.at < horizon) {
          upcoming.push({ key: `mind:${b.id}`, at: b.at, timed: false, title: b.title, sub: b.kind === "amount" ? `Mind · ${money(Math.round((b.amount ?? 0) * 100))} due` : "Mind", icon: <Emoji char={b.kind === "amount" ? "💶" : "📅"} /> });
        }
      }
    }

    const soon = (r: Row) => deadline(r.message.card) ?? Infinity;
    needs.sort((a, b) => soon(a) - soon(b) || b.message.createdAt - a.message.createdAt);
    checklists.sort((a, b) => Number(b.state.open) - Number(a.state.open) || b.message.createdAt - a.message.createdAt);
    invoices.sort((a, b) => Number(a.paid) - Number(b.paid) || Number(b.overdue) - Number(a.overdue) || b.message.createdAt - a.message.createdAt);
    upcoming.sort((a, b) => a.at - b.at);

    const busiest = [...perChat.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      needs, checklists, invoices, upcoming, unread, unreadChats, youOwe, owedToYou,
      week: [...perDay.entries()].map(([k, n]) => ({ k, n })),
      busiest: busiest ? { chat: chats.find((c) => c.id === busiest[0])!, n: busiest[1] } : null,
    };
  }, [state.data, me, lastReadAt, mind, now]);

  const mindStats = useMemo(() => {
    if (!mind) return null;
    const today = dayKey(now);
    const blocks = Object.values(mind.blocks);
    const habits = blocks.filter((b) => b.kind === "habit");
    return {
      toSort: mind.collections.reduce((n, c) => n + c.vault.length, 0),
      cards: blocks.filter((b) => b.kind === "flashcard" && b.due).length,
      todos: blocks.filter((b) => b.kind === "todo" && !b.done).length,
      habits: habits.length,
      habitsToday: habits.filter((b) => b.days?.includes(today)).length,
      collections: mind.collections.map((c) => ({ c, n: collectionItems(mind, c).length })),
    };
  }, [mind, now]);

  if (!state.hydrated) return <div className={d.wrap} aria-busy="true" />;

  const needsShown = allNeeds ? data.needs : data.needs.slice(0, SHOWN);
  const openLists = data.checklists.filter((x) => x.state.open);
  const listDone = data.checklists.reduce((n, x) => n + x.done, 0);
  const listTotal = data.checklists.reduce((n, x) => n + x.total, 0);
  const openInvoices = data.invoices.filter((x) => !x.paid);
  const weekMax = Math.max(1, ...data.week.map((x) => x.n));
  const weekTotal = data.week.reduce((n, x) => n + x.n, 0);
  const upcomingByDay = data.upcoming.slice(0, 8).reduce<{ day: string; items: Upcoming[] }[]>((groups, u) => {
    const day = u.at < now && !u.timed ? "Overdue" : dayLabel(u.at, now);
    const g = groups.find((x) => x.day === day);
    if (g) g.items.push(u); else groups.push({ day, items: [u] });
    return groups;
  }, []);
  const colMax = Math.max(1, ...(mindStats?.collections.map((x) => x.n) ?? [1]));

  return (
    <div className={d.wrap}>
      <header className={d.hello}>
        <div>
          <p>{new Date(now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h2>{greeting(now)}, {meUser.name}</h2>
        </div>
        <button className={d.me} onClick={onSettings} aria-label="Settings">
          <Avatar glyph={initials(meUser.fullName)} tone={meUser.tone} photo={meUser.photo} size={40} shape="circle" />
        </button>
      </header>

      {/* The four numbers worth knowing at a glance. Each one goes somewhere. */}
      <div className={d.tiles}>
        <button className={`${d.tile} ${data.needs.length ? d.tileAccent : ""}`} onClick={() => jump("dash-needs")}>
          <b>{data.needs.length}</b>
          <span>{data.needs.length === 1 ? "Needs you" : "Need you"}</span>
        </button>
        <button className={d.tile} onClick={() => jump("dash-soon")}>
          <b>{data.upcoming.length}</b>
          <span>Coming up this week</span>
        </button>
        <button className={d.tile} onClick={onUnread}>
          <b>{data.unread}</b>
          <span>Unread{data.unreadChats ? ` in ${data.unreadChats} ${data.unreadChats === 1 ? "chat" : "chats"}` : ""}</span>
        </button>
        <button className={d.tile} onClick={onMind}>
          <b>{mindStats?.toSort ?? 0}</b>
          <span>To sort in Mind</span>
        </button>
      </div>

      <section className={d.section} id="dash-needs" aria-labelledby="dash-needs-title">
        <p className={d.head}><span id="dash-needs-title">Needs your attention</span>{data.needs.length > 0 && <em>{data.needs.length}</em>}</p>
        {data.needs.length === 0 ? (
          <p className={d.hint}>Nothing is waiting on you. Votes, payments, RSVPs and your turns show up here.</p>
        ) : (
          <div className={d.list}>
            {needsShown.map((r) => (
              <button key={r.key} className={d.row} onClick={() => onOpenChat(r.chat)}>
                <span className={d.rowIcon}>{CARD_ICON[r.message.card!.type]}</span>
                <span className={d.rowText}>
                  <b>{r.state.title}</b>
                  <small>{r.state.summary} · {r.label}</small>
                </span>
                <IconChevron size={14} />
              </button>
            ))}
            {data.needs.length > SHOWN && (
              <button className={d.more} onClick={() => setAllNeeds((v) => !v)} aria-expanded={allNeeds}>
                {allNeeds ? "Show fewer" : `Show all ${data.needs.length}`}
              </button>
            )}
          </div>
        )}
      </section>

      <MyTasks onOpenChat={onOpenChat} />

      <section className={d.section} id="dash-soon" aria-labelledby="dash-soon-title">
        <p className={d.head}><span id="dash-soon-title">Coming up</span><em>next 7 days</em></p>
        {upcomingByDay.length === 0 ? (
          <p className={d.hint}>No events, plan stops, reminders or due dates this week.</p>
        ) : (
          <div className={d.list}>
            {upcomingByDay.map((g) => (
              <div key={g.day} className={d.dayGroup}>
                <p className={`${d.day} ${g.day === "Overdue" ? d.late : ""}`}>{g.day}</p>
                {g.items.map((u) => (
                  <button key={u.key} className={d.row} onClick={() => (u.chat ? onOpenChat(u.chat) : onMind())}>
                    <span className={d.rowIcon}>{u.icon}</span>
                    <span className={d.rowText}>
                      <b>{u.title}</b>
                      <small>{u.sub}</small>
                    </span>
                    {u.timed && <span className={d.time}>{clock(u.at)}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={d.section} aria-labelledby="dash-money-title">
        <p className={d.head}><span id="dash-money-title">Money</span></p>
        <div className={d.money}>
          <div>
            <span>You owe</span>
            <b className={data.youOwe ? d.late : undefined}>{money(data.youOwe)}</b>
          </div>
          <div>
            <span>Owed to you</span>
            <b>{money(data.owedToYou)}</b>
          </div>
        </div>
        {data.invoices.length > 0 && (
          <div className={d.list}>
            {data.invoices.slice(0, SHOWN).map((x) => {
              const c = x.message.card as Extract<Card, { type: "payment" }>;
              const other = userById(x.out ? c.from[0] : x.message.authorId);
              return (
                <button key={x.key} className={d.row} onClick={() => onOpenChat(x.chat)}>
                  <Avatar glyph={initials(other.fullName)} tone={other.tone} photo={other.photo} size={32} shape="circle" />
                  <span className={d.rowText}>
                    <b>{c.invoice!.number} · {x.out ? `to ${other.name}` : `from ${other.name}`}</b>
                    <small className={x.overdue ? d.late : x.paid ? d.ok : undefined}>{x.paid ? "Paid" : x.state.summary}</small>
                  </span>
                  <span className={d.figure}>{money(x.amount)}</span>
                </button>
              );
            })}
          </div>
        )}
        {openInvoices.length > 0 && (
          <p className={d.note}>
            {openInvoices.length} open {openInvoices.length === 1 ? "invoice" : "invoices"}
            {openInvoices.some((x) => x.overdue) ? `, ${openInvoices.filter((x) => x.overdue).length} overdue` : ""}
          </p>
        )}
      </section>

      <section className={d.section} aria-labelledby="dash-lists-title">
        <p className={d.head}><span id="dash-lists-title">Checklists</span>{listTotal > 0 && <em>{listDone} of {listTotal} ticked</em>}</p>
        {data.checklists.length === 0 ? (
          <p className={d.hint}>Checklists from your chats, and how far along they are.</p>
        ) : (
          <div className={d.list}>
            {(openLists.length ? openLists : data.checklists).slice(0, SHOWN).map((x) => (
              <button key={x.key} className={d.row} onClick={() => onOpenChat(x.chat)}>
                <span className={d.rowText}>
                  <b>{x.state.title}</b>
                  <small>{x.done === x.total ? "All done" : `${x.total - x.done} left`} · {x.label}</small>
                  <span className={d.bar} role="img" aria-label={`${x.done} of ${x.total} done`}><i style={{ width: `${(x.done / Math.max(1, x.total)) * 100}%` }} /></span>
                </span>
                <span className={d.figure}>{Math.round((x.done / Math.max(1, x.total)) * 100)}%</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {mindStats && (
        <section className={d.section} aria-labelledby="dash-mind-title">
          <p className={d.head}><span id="dash-mind-title">Mind</span></p>
          <div className={d.minis}>
            <button onClick={onMind}><b>{mindStats.toSort}</b><span>to sort</span></button>
            <button onClick={onMind}><b>{mindStats.cards}</b><span>cards to learn</span></button>
            <button onClick={onMind}><b>{mindStats.todos}</b><span>to-dos open</span></button>
            <button onClick={onMind}><b>{mindStats.habitsToday}/{mindStats.habits}</b><span>habits today</span></button>
          </div>
          {mindStats.collections.length > 0 ? (
            <div className={d.list}>
              {mindStats.collections.map(({ c, n }) => (
                <button key={c.id} className={d.row} onClick={onMind}>
                  <span className={d.rowIcon} style={{ background: `color-mix(in srgb, ${c.tone} 16%, transparent)` }}><Emoji char={c.emoji} /></span>
                  <span className={d.rowText}>
                    <b>{c.name}</b>
                    <small>{c.pages.length} {c.pages.length === 1 ? "page" : "pages"}{c.vault.length ? ` · ${c.vault.length} to sort` : ""}</small>
                    <span className={d.bar} role="img" aria-label={`${n} items`}><i style={{ width: `${(n / colMax) * 100}%`, background: c.tone }} /></span>
                  </span>
                  <span className={d.figure}>{n}</span>
                </button>
              ))}
            </div>
          ) : <p className={d.hint}>Make a collection in Mind and its numbers show up here.</p>}
        </section>
      )}

      <section className={d.section} aria-labelledby="dash-week-title">
        <p className={d.head}><span id="dash-week-title">This week</span><em>{weekTotal} messages</em></p>
        <div className={d.chartCard}>
          <div className={d.chart} role="list" aria-label="Messages per day, last 7 days">
            {data.week.map((x, i) => {
              const t = new Date(`${x.k}T12:00`).getTime();
              return (
                <div key={x.k} className={d.col} role="listitem" tabIndex={0} aria-label={`${weekday(t)}: ${x.n} messages`}>
                  <span className={d.tip} aria-hidden="true">{x.n} {x.n === 1 ? "message" : "messages"}</span>
                  <span className={d.barCol}><i className={i === data.week.length - 1 ? d.today : undefined} style={{ height: `${Math.max(x.n ? 6 : 0, (x.n / weekMax) * 100)}%` }} /></span>
                  <small>{i === data.week.length - 1 ? "Today" : weekday(t)}</small>
                </div>
              );
            })}
          </div>
          {data.busiest && (
            <p className={d.note}>
              Busiest: <b>{chatIdentity(data.busiest.chat, me, userById).label}</b> with {data.busiest.n} {data.busiest.n === 1 ? "message" : "messages"}
            </p>
          )}
        </div>
      </section>

      <p className={d.foot}><Logo size={14} /> Everything here comes from your chats and your Mind.</p>
    </div>
  );
}
