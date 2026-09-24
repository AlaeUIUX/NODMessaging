"use client";

import { useEffect, useRef, useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { useChat, userById } from "@/lib/chat/store";
import type { Card, Message, Rsvp } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { ConfirmPay } from "./CardBuilders";
import { IconBell, IconCheck, IconChecklist, IconLock, IconMoneyReceive, IconPlus, IconPoll } from "./Icons";
import MiniMap from "./MiniMap";
import { getPermission, relative, Sheet, Toggle, uid, useChatUi, useNow } from "./ui";
import styles from "./chat.module.css";

type Of<T extends Card["type"]> = Extract<Card, { type: T }>;

interface Props {
  message: Message;
  interactive: boolean;
}

const euro = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "EUR" });
const clock = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function Faces({ ids, size = 18 }: { ids: string[]; size?: number }) {
  if (!ids.length) return null;
  return (
    <span className={styles.faces}>
      {ids.slice(0, 3).map((id) => {
        const u = userById(id);
        return <Avatar key={id} glyph={initials(u.fullName)} tone={u.tone} size={size} shape="circle" />;
      })}
      {ids.length > 3 && <em>+{ids.length - 3}</em>}
    </span>
  );
}

export default function CardView({ message, interactive }: Props) {
  const card = message.card!;
  switch (card.type) {
    case "poll": return <PollCard message={message} card={card} interactive={interactive} />;
    case "checklist": return <ChecklistCard message={message} card={card} interactive={interactive} />;
    case "reminder": return <ReminderCard message={message} card={card} interactive={interactive} />;
    case "location": return <LocationCard message={message} card={card} interactive={interactive} />;
    case "event": return <EventCard message={message} card={card} interactive={interactive} />;
    case "payment": return <PaymentCard message={message} card={card} interactive={interactive} />;
  }
}

/* ---------------------------------------------------------------------------
   Poll — vote, change your mind, see who (unless anonymous), creator can end it
--------------------------------------------------------------------------- */

function PollCard({ message, card, interactive }: { message: Message; card: Of<"poll">; interactive: boolean }) {
  const { me, updateCard } = useChat();
  const now = useNow(1000);
  const closed = card.closedAt !== null || now >= card.closesAt;
  const total = card.options.reduce((n, o) => n + o.votes.length, 0);
  const voters = new Set(card.options.flatMap((o) => o.votes)).size;
  const top = Math.max(...card.options.map((o) => o.votes.length));
  const mine = card.options.filter((o) => o.votes.includes(me)).map((o) => o.id);
  const isOwner = message.authorId === me;

  const vote = (id: string) => {
    if (!interactive || closed) return;
    updateCard(message, (c) => {
      if (c.type !== "poll") return c;
      return {
        ...c,
        options: c.options.map((o) => {
          const has = o.votes.includes(me);
          if (o.id === id) return { ...o, votes: has ? o.votes.filter((v) => v !== me) : [...o.votes, me] };
          return c.multiple ? o : { ...o, votes: o.votes.filter((v) => v !== me) };
        }),
      };
    });
  };

  return (
    <div className={styles.card}>
      <p className={styles.cardKicker}>
        <span><IconPoll size={14} /> Poll</span>
        {card.multiple && <span>Multiple choice</span>}
        {card.anonymous && <span>Anonymous</span>}
      </p>
      <h4 className={styles.cardTitle}>{card.question}</h4>
      <div className={styles.pollOptions} role={card.multiple ? "group" : "radiogroup"}>
        {card.options.map((o) => {
          const pct = total ? Math.round((o.votes.length / total) * 100) : 0;
          const picked = o.votes.includes(me);
          const winner = closed && o.votes.length === top && top > 0;
          return (
            <button
              key={o.id}
              className={`${styles.pollOption} ${picked ? styles.pollPicked : ""} ${winner ? styles.pollWinner : ""}`}
              onClick={() => vote(o.id)}
              disabled={!interactive || closed}
              role={card.multiple ? "checkbox" : "radio"}
              aria-checked={picked}
            >
              <span className={styles.pollFill} style={{ width: `${pct}%` }} />
              <span className={`${styles.pollMark} ${card.multiple ? styles.pollMarkSquare : ""}`}>{picked && <IconCheck size={10} />}</span>
              <span className={styles.pollLabel}>{o.label}</span>
              {!card.anonymous && <Faces ids={o.votes} size={16} />}
              <span className={styles.pollPct}>{total ? `${pct}%` : ""}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.cardFoot}>
        <span>
          {voters} {voters === 1 ? "vote" : "votes"} · {closed ? "Final results" : `Closes in ${relative(card.closesAt - now)}`}
        </span>
        {interactive && isOwner && !closed && (
          <button className={styles.cardLink} onClick={() => updateCard(message, (c) => (c.type === "poll" ? { ...c, closedAt: Date.now() } : c))}>
            End poll
          </button>
        )}
        {!closed && mine.length > 0 && <span className={styles.cardMuted}>Tap again to change</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Checklist — edit permission, access requests, approvals
--------------------------------------------------------------------------- */

function ChecklistCard({ message, card, interactive }: { message: Message; card: Of<"checklist">; interactive: boolean }) {
  const { me, updateCard } = useChat();
  const ui = useChatUi();
  const [draft, setDraft] = useState("");
  const owner = userById(message.authorId);
  const isOwner = message.authorId === me;
  const canEdit = card.everyoneCanEdit || isOwner || card.editors.includes(me);
  const done = card.items.filter((i) => i.doneBy).length;
  const pending = card.requests.includes(me);

  const set = (fn: (c: Of<"checklist">) => Of<"checklist">) => updateCard(message, (c) => (c.type === "checklist" ? fn(c) : c));

  // Approval is always a person's decision: the owner approves from their own
  // session (another tab, or "Signed in as" in the Developer drawer).
  const requestAccess = () => {
    set((c) => ({ ...c, requests: c.requests.includes(me) ? c.requests : [...c.requests, me] }));
    ui.toast(`Request sent to ${owner.name}`);
  };
  const withdraw = () => {
    set((c) => ({ ...c, requests: c.requests.filter((r) => r !== me) }));
    ui.toast("Request withdrawn");
  };

  // The owner hears about new requests, and requesters hear the answer.
  const seenRequests = useRef(card.requests);
  const wasEditor = useRef(card.editors.includes(me));
  const lastMe = useRef(me);
  useEffect(() => {
    if (!interactive) return;
    // Switching identity (demo "Signed in as") re-baselines instead of toasting.
    if (lastMe.current !== me) {
      lastMe.current = me;
      seenRequests.current = card.requests;
      wasEditor.current = card.editors.includes(me);
      return;
    }
    if (isOwner) {
      card.requests.filter((r) => !seenRequests.current.includes(r))
        .forEach((r) => ui.toast(`${userById(r).name} asked to edit “${card.title}”`));
    }
    const nowEditor = card.editors.includes(me);
    if (!isOwner && nowEditor && !wasEditor.current) ui.toast(`${owner.name} gave you edit access`);
    seenRequests.current = card.requests;
    wasEditor.current = nowEditor;
  }, [card.requests, card.editors, interactive, isOwner, me, owner.name, card.title, ui]);

  const askForAccess = () => ui.openSheet(
    <Sheet title="Edit access" onClose={ui.closeSheet}>
      {(close) => (
        <div className={styles.accessSheet}>
          <span className={styles.accessIcon}><IconLock size={22} /></span>
          <b>Only {owner.name} can edit this checklist</b>
          <p>{owner.name} turned off editing for everyone. Ask for access and you’ll be able to tick and add items once approved.</p>
          {pending ? (
            <>
              <p className={styles.pendingNote}>Your request is waiting for {owner.name}.</p>
              <button className={styles.secondaryWide} onClick={() => close(withdraw)}>Withdraw request</button>
            </>
          ) : (
            <button className={styles.primaryWide} onClick={() => close(requestAccess)}>Ask {owner.name} for access</button>
          )}
        </div>
      )}
    </Sheet>,
  );

  const toggle = (id: string) => {
    if (!interactive) return;
    if (!canEdit) { askForAccess(); return; }
    set((c) => ({ ...c, items: c.items.map((it) => (it.id === id ? { ...it, doneBy: it.doneBy ? null : me } : it)) }));
  };

  const add = () => {
    const label = draft.trim();
    if (!label) return;
    set((c) => ({ ...c, items: [...c.items, { id: uid(), label, doneBy: null }] }));
    setDraft("");
  };

  return (
    <div className={styles.card}>
      <p className={styles.cardKicker}>
        <span><IconChecklist size={14} /> Checklist</span>
        <span>{done} of {card.items.length}</span>
        {interactive && isOwner && card.requests.length > 0 && (
          <em className={styles.requestCount}>{card.requests.length} {card.requests.length === 1 ? "request" : "requests"}</em>
        )}
      </p>
      <h4 className={styles.cardTitle}>{card.title}</h4>
      <div className={styles.progress}><span style={{ width: `${card.items.length ? (done / card.items.length) * 100 : 0}%` }} /></div>
      <ul className={styles.checkList}>
        {card.items.map((it) => (
          <li key={it.id}>
            <button className={`${styles.checkItem} ${it.doneBy ? styles.checkDone : ""}`} onClick={() => toggle(it.id)} disabled={!interactive} aria-pressed={!!it.doneBy}>
              <span className={styles.checkBox}>{it.doneBy && <IconCheck size={12} />}</span>
              <span className={styles.checkText}>
                <span className={styles.checkLabel}>{it.label}</span>
                {it.doneBy && (
                  <span className={styles.checkBy}>
                    <Avatar glyph={initials(userById(it.doneBy).fullName)} tone={userById(it.doneBy).tone} size={20} shape="circle" />
                    Done by {it.doneBy === me ? "you" : userById(it.doneBy).name}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {interactive && canEdit && (
        <form className={styles.checkAdd} onSubmit={(e) => { e.preventDefault(); add(); }}>
          <IconPlus size={14} />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add item" aria-label="Add checklist item" />
        </form>
      )}

      {interactive && isOwner && card.requests.length > 0 && (
        <div className={styles.requests}>
          {card.requests.map((rid) => (
            <div key={rid} className={styles.requestRow}>
              <div className={styles.requestWho}>
                <Faces ids={[rid]} size={32} />
                <span><b>{userById(rid).name}</b><small>wants to edit this checklist</small></span>
              </div>
              <div className={styles.requestActions}>
                <button onClick={() => set((c) => ({ ...c, requests: c.requests.filter((r) => r !== rid) }))}>Decline</button>
                <button className={styles.requestApprove} onClick={() => set((c) => ({ ...c, requests: c.requests.filter((r) => r !== rid), editors: [...c.editors, rid] }))}>Approve</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.cardFoot}>
        {isOwner && interactive ? (
          <label className={styles.cardSetting}>
            <span>Allow everyone to edit</span>
            <Toggle on={card.everyoneCanEdit} onChange={(v) => set((c) => ({ ...c, everyoneCanEdit: v }))} label="Allow everyone to edit" />
          </label>
        ) : card.everyoneCanEdit ? (
          <span>Everyone can edit</span>
        ) : canEdit ? (
          <span><IconLock size={11} /> You can edit · shared by {owner.name}</span>
        ) : (
          <>
            <span><IconLock size={11} /> Only {owner.name} can edit</span>
            {interactive && <button className={styles.cardLink} onClick={askForAccess}>{pending ? "Request pending" : "Ask for access"}</button>}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Reminder — live countdown, fires a notification (if allowed)
--------------------------------------------------------------------------- */

function ReminderCard({ message, card, interactive }: { message: Message; card: Of<"reminder">; interactive: boolean }) {
  const now = useNow(1000);
  const ui = useChatUi();
  const [perm, setPerm] = useState(() => getPermission("notifications"));
  const fired = card.firedAt !== null || now >= card.at;
  const author = userById(message.authorId);
  return (
    <div className={`${styles.card} ${fired ? styles.cardDim : ""}`}>
      <div className={styles.reminderRow}>
        <span className={`${styles.bell} ${!fired ? styles.bellLive : ""}`}><IconBell size={20} /></span>
        <div>
          <h4 className={styles.cardTitle}>{card.text}</h4>
          <p className={styles.cardSub}>
            {fired ? `Reminded at ${clock(card.firedAt ?? card.at)}` : `${clock(card.at)} · in ${relative(card.at - now)}`}
            {" · "}{card.audience === "everyone" ? "Everyone here" : `Only ${author.name}`}
          </p>
        </div>
      </div>
      {interactive && perm !== "granted" && !fired && (
        <div className={styles.cardFoot}>
          <span>Notifications are off — you’ll only see this in the chat.</span>
          <button className={styles.cardLink} onClick={async () => setPerm((await ui.ask("notifications")) ? "granted" : "denied")}>Turn on</button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Location — static or live, with a clear end
--------------------------------------------------------------------------- */

function LocationCard({ message, card, interactive }: { message: Message; card: Of<"location">; interactive: boolean }) {
  const { me, updateCard } = useChat();
  const now = useNow(15000);
  const live = card.live && card.until !== null && now < card.until;
  return (
    <div className={`${styles.card} ${styles.cardFlush}`}>
      <div className={styles.mapFrame}><MiniMap x={card.x} y={card.y} live={live} /></div>
      <div className={styles.cardPad}>
        <h4 className={styles.cardTitle}>{card.place}</h4>
        <p className={styles.cardSub}>
          {card.live ? (live ? <><i className={styles.liveDot} />Live · {relative((card.until ?? now) - now)} left</> : "Live location ended") : card.address}
        </p>
        <div className={styles.cardActions}>
          <a className={styles.pillBtn} href={`https://maps.google.com/?q=${encodeURIComponent(card.address)}`} target="_blank" rel="noopener noreferrer">Directions</a>
          {interactive && live && message.authorId === me && (
            <button className={styles.pillBtn} onClick={() => updateCard(message, (c) => (c.type === "location" ? { ...c, until: Date.now() } : c))}>Stop sharing</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Event — RSVP and add to calendar (.ics)
--------------------------------------------------------------------------- */

function icsFor(card: Of<"event">) {
  const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NOD//Prototype//EN", "BEGIN:VEVENT",
    `UID:${uid()}@nod`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(card.startsAt)}`,
    `DTEND:${stamp(card.startsAt + 3_600_000)}`, `SUMMARY:${card.title}`, `LOCATION:${card.place}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return body;
}

/** Builds the file only when asked, so no object URLs pile up per render. */
function downloadIcs(card: Of<"event">) {
  const url = URL.createObjectURL(new Blob([icsFor(card)], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${card.title.replace(/\W+/g, "-").toLowerCase() || "event"}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function EventCard({ message, card, interactive }: { message: Message; card: Of<"event">; interactive: boolean }) {
  const { me, updateCard } = useChat();
  const d = new Date(card.startsAt);
  const counts = (r: Rsvp) => Object.entries(card.rsvps).filter(([, v]) => v === r).map(([k]) => k);
  const choices: { id: Rsvp; label: string }[] = [
    { id: "going", label: "Going" },
    { id: "maybe", label: "Maybe" },
    { id: "no", label: "Can’t" },
  ];
  return (
    <div className={styles.card}>
      <div className={styles.eventHead}>
        <span className={styles.dateTile}>
          <small>{d.toLocaleDateString(undefined, { month: "short" })}</small>
          <b>{d.getDate()}</b>
        </span>
        <div>
          <h4 className={styles.cardTitle}>{card.title}</h4>
          <p className={styles.cardSub}>{d.toLocaleDateString(undefined, { weekday: "long" })} · {clock(card.startsAt)} · {card.place}</p>
        </div>
      </div>
      <div className={styles.rsvp}>
        {choices.map((c) => {
          const who = counts(c.id);
          const on = card.rsvps[me] === c.id;
          return (
            <button
              key={c.id}
              className={on ? styles.rsvpOn : undefined}
              disabled={!interactive}
              onClick={() => updateCard(message, (x) => {
                if (x.type !== "event") return x;
                const rsvps = { ...x.rsvps };
                if (rsvps[me] === c.id) delete rsvps[me]; else rsvps[me] = c.id;
                return { ...x, rsvps };
              })}
            >
              {c.label}<em>{who.length || ""}</em>
            </button>
          );
        })}
      </div>
      <div className={styles.cardFoot}>
        <Faces ids={counts("going")} />
        <span>{counts("going").length ? `${counts("going").length} going` : "Be the first to answer"}</span>
        {interactive && (
          <button className={styles.cardLink} onClick={() => downloadIcs(card)}>Add to calendar</button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Payment — requests track who paid; paying needs a confirmation
--------------------------------------------------------------------------- */

function PaymentCard({ message, card, interactive }: { message: Message; card: Of<"payment">; interactive: boolean }) {
  const { me, updateCard } = useChat();
  const ui = useChatUi();
  const author = userById(message.authorId);
  const isAuthor = message.authorId === me;

  if (card.mode === "sent") {
    const to = userById(card.from[0]);
    return (
      <div className={`${styles.card} ${styles.payCard}`}>
        <span className={styles.paySent}><IconCheck size={16} /></span>
        <div>
          <p className={styles.cardSub}>{isAuthor ? `You sent ${to.name}` : `${author.name} sent ${card.from[0] === me ? "you" : to.name}`}</p>
          <b className={styles.payAmount}>{euro(card.amount)}</b>
          {card.note && <p className={styles.cardSub}>{card.note}</p>}
        </div>
      </div>
    );
  }

  const owes = card.from.includes(me) && !card.paidBy.includes(me);
  const pay = () => ui.openSheet(
    <Sheet title="Pay request" onClose={ui.closeSheet}>
      <div className={styles.accessSheet}>
        <b className={styles.payAmount}>{euro(card.amount)}</b>
        <p>To {author.fullName}{card.note ? ` · ${card.note}` : ""}</p>
        <ConfirmPay amount={euro(card.amount)} onDone={() => {
          updateCard(message, (c) => (c.type === "payment" && !c.paidBy.includes(me) ? { ...c, paidBy: [...c.paidBy, me] } : c));
          ui.closeSheet();
          ui.toast(`Paid ${euro(card.amount)} to ${author.name}`);
        }} />
        <p className={styles.demoNote}>Demo payments — no real money moves.</p>
      </div>
    </Sheet>,
  );

  return (
    <div className={styles.card}>
      <p className={styles.cardKicker}><span><IconMoneyReceive size={14} /> Request</span><span>{card.paidBy.length} of {card.from.length} paid</span></p>
      <b className={styles.payAmount}>{euro(card.amount)}</b>
      {card.note && <p className={styles.cardSub}>{card.note}</p>}
      <ul className={styles.payList}>
        {card.from.map((id) => {
          const u = userById(id);
          const paid = card.paidBy.includes(id);
          return (
            <li key={id}>
              <Avatar glyph={initials(u.fullName)} tone={u.tone} size={22} shape="circle" />
              <span>{id === me ? "You" : u.name}</span>
              <em className={paid ? styles.paidTag : undefined}>{paid ? "Paid" : "Pending"}</em>
            </li>
          );
        })}
      </ul>
      {interactive && owes && <button className={styles.primaryWide} onClick={pay}>Pay {euro(card.amount)}</button>}
      {isAuthor && card.paidBy.length === card.from.length && <p className={styles.cardSub}><IconCheck size={14} /> Everyone has paid</p>}
    </div>
  );
}
