"use client";

import { useEffect, useRef, useState } from "react";
import StatusBar from "@/components/chat/StatusBar";
import { IconAlert, IconBellOff, IconCheck, IconChevron, IconClose, IconRoute } from "@/components/chat/Icons";
import { getPermission, useDialog, useNow } from "@/components/chat/ui";
import { getPrefs } from "@/lib/chat/account";
import { canSee, groupInfo } from "@/lib/chat/groups";
import { effectiveRule, isQuiet, useMutes } from "@/lib/chat/mutes";
import { agoText, audienceOf, titleOf, zoneById, type OpBroadcast, type OpRequest } from "@/lib/chat/operation";
import { onOpAction, opLive, useAllOpLive } from "@/lib/chat/opstore";
import { useChat, userById } from "@/lib/chat/store";
import type { Chat } from "@/lib/chat/types";
import { Av } from "./kit";
import { useOperation } from "./useOperation";
import chat from "../chat.module.css";
import s from "./cards.module.css";

/**
 * What an Operation puts on top of everything, for the signed-in person,
 * across every Operation they're in: a critical broadcast takes the whole
 * screen until Got it (mutes don't stop it), a move request waits at the
 * bottom for Accept or Can't, and new normal broadcasts and All-call radio
 * calls raise the phone's banner (whose own mute rules then apply).
 *
 * Mounted once at the phone (inside the screen box, outside any chat), so it
 * reads the chat store directly instead of a ChatView's ui host.
 */

interface BannerIn { chatId: string; title: string; body: string }

const operationsOf = (chats: Chat[], me: string) =>
  chats.filter((c) => c.kind === "group" && !c.groupId && !c.removedAt && !!c.group?.operation && c.memberIds.includes(me));

/** A critical broadcast older than this no longer takes over the screen. */
const STALE_CRITICAL_MS = 30 * 60_000;

export function OperationOverlays({ onBanner, onOpenChat }: {
  onBanner: (b: BannerIn) => void;
  onOpenChat: (chatId: string) => void;
}) {
  const { state, me } = useChat();
  const all = useAllOpLive();
  const { rules } = useMutes(me);
  const now = useNow(30_000);
  const [note, setNote] = useState<{ text: string; key: number } | null>(null);
  const chats = state.data.chats;

  // The newest critical broadcast that reaches me and I haven't acknowledged, and the first move I'm asked to make.
  let critical: { group: Chat; b: OpBroadcast; waiting: number } | null = null;
  let move: { group: Chat; r: OpRequest } | null = null;
  let waiting = 0;
  for (const g of operationsOf(chats, me)) {
    const live = all?.[g.id];
    if (!live) continue;
    const info = groupInfo(g);
    for (const b of live.broadcasts) {
      if (b.level !== "critical" || b.by === me || b.acks[me]) continue;
      // An old alert (from before someone joined, or long over) stays in #broadcasts; it doesn't take the screen.
      if (now - b.at > STALE_CRITICAL_MS) continue;
      if (!audienceOf(info, live, g.memberIds, b.audience).includes(me)) continue;
      waiting++;
      if (!critical || b.at > critical.b.at) critical = { group: g, b, waiting: 0 };
    }
    if (!move) {
      // A move into a zone that has since been removed can't be answered: skip it, so it never hides the next one.
      const op = info.operation!;
      const r = live.requests.find((x) => x.accepts[me] === "pending" && x.status !== "declined" && x.status !== "done" && !!zoneById(op, x.zoneId));
      if (r) move = { group: g, r };
    }
  }
  if (critical) critical = { ...critical, waiting };

  // Muted (the Operation, or its #broadcasts): said on the takeover, which comes through anyway.
  let muted = false;
  if (critical) {
    const g = critical.group;
    const bc = chats.find((c) => c.id === g.group?.operation?.broadcastsChannel);
    muted = isQuiet(effectiveRule(rules, g, now)) || (!!bc && isQuiet(effectiveRule(rules, bc, now)));
  }

  const flash = (text: string) => {
    const key = Date.now();
    setNote({ text, key });
    setTimeout(() => setNote((n) => (n?.key === key ? null : n)), 2400);
  };

  // Banners: only for what arrives while this is on screen, once each. Actions
  // are events (from this tab, or another one), so no render ever raises one.
  // Like every other banner (ReminderWatcher in ChatApp), they need the
  // notifications permission, and Show previews off hides what was said.
  const latest = useRef({ chats, me, onBanner });
  useEffect(() => { latest.current = { chats, me, onBanner }; });
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => onOpAction((groupId, a) => {
    if (a.t !== "broadcast.add" && a.t !== "radio.release") return;
    const { chats: list, me: who, onBanner: banner } = latest.current;
    const group = operationsOf(list, who).find((c) => c.id === groupId);
    const live = opLive(groupId);
    if (!group || !live) return;
    const info = groupInfo(group);
    const notify = (b: BannerIn) => {
      if (getPermission("notifications") !== "granted") return;
      banner(getPrefs(who).previews ? b : { ...b, body: "Tap to open the chat" });
    };
    if (a.t === "broadcast.add") {
      const b = a.broadcast;
      // Critical ones take over the screen instead.
      if (b.level !== "normal" || b.by === who || seen.current.has(b.id)) return;
      seen.current.add(b.id);
      if (!audienceOf(info, live, group.memberIds, b.audience).includes(who)) return;
      notify({ chatId: info.operation!.broadcastsChannel, title: `${group.name} · Broadcast`, body: b.text });
      return;
    }
    const t = live.radio.tx.find((x) => x.id === a.id);
    // Still live: the release didn't land. Gone: let go without a word, so nothing went out.
    if (!t || t.live || !t.target.all || t.by === who || seen.current.has(t.id)) return;
    seen.current.add(t.id);
    notify({ chatId: group.id, title: `All-call · ${userById(t.by).name}`, body: t.text });
  }), []);

  return (
    <>
      {critical ? (
        <CriticalTakeover key={critical.b.id} groupId={critical.group.id} broadcast={critical.b} more={critical.waiting - 1} muted={muted} now={now} onDone={flash} />
      ) : move ? (
        <div className={s.moveHost}>
          <MovePrompt key={move.r.id} groupId={move.group.id} request={move.r} onDone={flash} onOpenChat={onOpenChat} />
        </div>
      ) : null}
      {note && (
        <div className={s.noteHost}>
          <div key={note.key} className={`${chat.toast} ${chat.glassStrong}`} role="status"><IconCheck size={14} />{note.text}</div>
        </div>
      )}
    </>
  );
}

/** Critical: the whole screen, ignoring mute and Do Not Disturb, until Got it. */
function CriticalTakeover({ groupId, broadcast: b, more, muted, now, onDone }: {
  groupId: string;
  broadcast: OpBroadcast;
  /** Other critical broadcasts still waiting behind this one. */
  more: number;
  muted: boolean;
  now: number;
  onDone: (text: string) => void;
}) {
  const { group, info, act } = useOperation(groupId);
  const ref = useRef<HTMLDivElement>(null);
  // Tab stays inside; Escape does nothing: it needs Got it.
  useDialog(ref);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true }); }, []);
  const by = userById(b.by);
  return (
    <div ref={ref} className={s.takeover} role="alertdialog" aria-modal="true" aria-labelledby={`crit-${b.id}`} tabIndex={-1}>
      <StatusBar />
      <div className={s.takeoverPulse} aria-hidden="true" />
      <span className={s.takeoverTag}><IconAlert size={14} />Critical broadcast</span>
      {group && <p className={s.takeoverGroup}>{group.name}</p>}
      <h2 id={`crit-${b.id}`}>{b.text}</h2>
      <p className={s.takeoverBy}>
        <Av id={b.by} size={24} />
        {by.fullName} · {info ? titleOf(info, b.by) : "Command"} · {agoText(now - b.at)}
      </p>
      {muted && <p className={s.takeoverMuted}><IconBellOff size={15} />You have this Operation muted. Critical broadcasts still come through.</p>}
      <button className={s.takeoverBtn} onClick={() => { act.ack(b.id); onDone("Command can see you’ve read it"); }}>
        <IconCheck size={20} />Got it
      </button>
      {more > 0 && <p className={s.takeoverMore}>{more} more after this one</p>}
    </div>
  );
}

/** "Reema asks you to go to B2 Stage B": Accept checks you in there and opens its chat. */
function MovePrompt({ groupId, request: r, onDone, onOpenChat }: {
  groupId: string;
  request: OpRequest;
  onDone: (text: string) => void;
  onOpenChat: (chatId: string) => void;
}) {
  const { group, info, op, live, me, act } = useOperation(groupId);
  const z = op ? zoneById(op, r.zoneId) : undefined;
  if (!info || !op || !z) return null;
  // Open the zone's chat only when it's there for me: a channel I can't see (or one that was closed) would open nothing.
  const channel = info.channels.find((c) => c.id === z.channelId);
  const canOpen = !!channel && canSee(info, channel, me);
  const hereId = live?.presence[me]?.zoneId;
  const from = hereId ? zoneById(op, hereId) : undefined;
  const asker = userById(r.decidedBy ?? r.by);
  const urgent = r.urgency === "urgent";
  return (
    <div className={s.move} role="alertdialog" aria-label={`Move request to ${z.code} ${z.name}`}>
      <span className={s.moveTag}>
        <IconRoute size={14} />
        <span className={urgent ? s.moveUrgent : undefined}>Move request{urgent ? " · Urgent" : ""}</span>
        {group && <span>{group.name}</span>}
      </span>
      <h3>{asker.id === me ? "You" : asker.name} {asker.id === me ? "asked" : "asks"} you to go to <span className={s.codeInline}>{z.code}</span> {z.name}</h3>
      {r.note && <p className={s.moveNote}>{r.note}</p>}
      <div className={s.moveRoute}>
        <span>{from ? `${from.code} · ${from.name}` : "Not checked in"}</span>
        <IconChevron size={14} />
        <b>{z.code} · {z.name}</b>
      </div>
      <div className={s.actions}>
        <button className={s.btnGhost} onClick={() => { act.answer(r.id, false); onDone("Command knows you can’t"); }}><IconClose size={16} />Can’t</button>
        <button className={s.btn} onClick={() => { act.answer(r.id, true); onDone(`Checked in to ${z.code} · ${z.name}`); if (canOpen) onOpenChat(z.channelId); }}>
          <IconCheck size={16} />Accept
        </button>
      </div>
    </div>
  );
}
