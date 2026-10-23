"use client";

import { useEffect, useRef, useState } from "react";
import { canSee } from "@/lib/chat/groups";
import { currentDay, dayLabel, onSite, staffing, titleOf, zoneById, zoneStatus } from "@/lib/chat/operation";
import { useChat, userById } from "@/lib/chat/store";
import { IconAlert, IconClose, IconMegaphone } from "../Icons";
import { reducedMotion, useDialog, useNow } from "../ui";
import styles from "../chat.module.css";
import { Av, Code, CrewDot } from "./kit";
import { crewGroups, useOp } from "./zones";
import p from "./pages.module.css";

const LEAVE_MS = 200;

/**
 * The Operation at a glance, the way Discord's side panel works: every zone
 * (with how many are there), every channel (with what's unread), and as you
 * keep scrolling everyone in the Operation, by crew. Slides in from the
 * right, from the menu button in the chat's header.
 */
export function OpMenu({ groupId, currentChatId, onClose, onZone, onChannel }: {
  groupId: string;
  /** The channel on screen, marked in the list. */
  currentChatId: string;
  onClose: () => void;
  onZone: (zoneId: string) => void;
  onChannel: (channelId: string) => void;
}) {
  const o = useOp(groupId);
  const { state, me, lastReadAt } = useChat();
  const now = useNow(60_000);
  const rootRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const closing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Out first, then whatever was picked (so a channel switch doesn't race the slide).
  const close = (after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    timer.current = setTimeout(() => { onClose(); after?.(); }, reducedMotion() ? 0 : LEAVE_MS);
  };
  useDialog(rootRef, () => close());
  useEffect(() => { rootRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!o) return null;
  const { info, op, live, group } = o;
  const shift = op.shifts.find((s) => s.id === live.shift);
  const channels = info.channels.filter((c) => canSee(info, c, me));
  const unreadIn = (chatId: string) => {
    const read = lastReadAt(chatId);
    return (state.data.messages[chatId] ?? []).filter((m) => m.authorId !== me && !m.deletedAt && m.createdAt > read).length;
  };
  const rank = (u: string) => (u === me ? 0 : op.zones.some((z) => z.leadId === u) ? 1 : 2);
  const people = crewGroups(o, o.members).map((g) => ({
    ...g,
    ids: [...g.ids].sort((a, b) => rank(a) - rank(b) || userById(a).fullName.localeCompare(userById(b).fullName)),
  }));

  return (
    <>
      <div className={`${p.drawerScrim} ${leaving ? p.drawerScrimOut : ""}`} onClick={() => close()} aria-hidden="true" />
      <div
        ref={rootRef}
        className={`${p.drawer} ${leaving ? p.drawerOut : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${group.name}: zones, channels and people`}
        tabIndex={-1}
      >
        <header className={p.drawerHead}>
          <span className={p.drawerTitle}>
            <b>{group.name}</b>
            <small>{dayLabel(currentDay(op, live, now), op.days)}{shift ? ` · ${shift.name}` : ""} · {onSite(live)} on site</small>
          </span>
          <button className={`${styles.circleBtn} ${styles.glass}`} onClick={() => close()} aria-label="Close">
            <IconClose size={18} />
          </button>
        </header>

        <div className={p.drawerScroll}>
          {op.zones.length > 0 && (
            <section aria-label="Zones">
              <h3 className={p.drawerLabel}>Zones<em>{op.zones.length}</em></h3>
              {op.zones.map((z) => {
                const st = staffing(live, z);
                const issue = zoneStatus(live, z.id) === "issue";
                return (
                  <button key={z.id} className={p.drawerRow} onClick={() => close(() => onZone(z.id))}>
                    <Code z={z} />
                    <span className={p.drawerMain}>
                      <b>{z.name}</b>
                      <small>{z.area}</small>
                    </span>
                    <span className={p.drawerEnd}>
                      {issue && <span className={p.drawerIssue}><IconAlert size={12} />Issue</span>}
                      <span className={p.count}><b>{st.n}</b><span>/{st.target}</span></span>
                    </span>
                  </button>
                );
              })}
            </section>
          )}

          <section aria-label="Channels">
            <h3 className={p.drawerLabel}>Channels<em>{channels.length}</em></h3>
            {channels.map((c) => {
              const z = op.zones.find((x) => x.channelId === c.id);
              const n = unreadIn(c.id);
              const here = c.id === currentChatId;
              return (
                <button
                  key={c.id}
                  className={`${p.drawerRow} ${here ? p.drawerRowOn : ""}`}
                  onClick={() => close(() => onChannel(c.id))}
                  aria-current={here ? "page" : undefined}
                >
                  <span className={p.drawerHash} aria-hidden="true">{c.id === op.broadcastsChannel ? <IconMegaphone size={15} /> : "#"}</span>
                  <span className={p.drawerMain}>
                    <b className={n ? p.drawerUnreadName : undefined}>{c.name}</b>
                    {z && <small>{z.code} · {z.area}</small>}
                  </span>
                  {n > 0 && <em className={p.unread}>{n}</em>}
                </button>
              );
            })}
          </section>

          <section aria-label="People">
            <h3 className={p.drawerLabel}>People<em>{o.members.length}</em></h3>
            {people.map((g) => (
              <div key={g.key} className={p.drawerGroup}>
                <span className={p.drawerCrew}><CrewDot tone={g.tone} />{g.name}<em>{g.ids.length}</em></span>
                {g.ids.map((u) => {
                  const z = zoneById(op, live.presence[u]?.zoneId);
                  return (
                    <div key={u} className={`${p.drawerRow} ${p.drawerPerson} ${z ? "" : p.drawerAway}`}>
                      <Av id={u} size={30} />
                      <span className={p.drawerMain}>
                        <b>{userById(u).fullName}{u === me && <em> · You</em>}</b>
                        <small>{titleOf(info, u)}</small>
                      </span>
                      <span className={p.drawerEnd}>{z ? <Code z={z} /> : <small>Not in</small>}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
