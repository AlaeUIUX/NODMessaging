"use client";

import { useMemo, useState } from "react";
import { chatIdentity } from "@/lib/chat/avatar";
import { canSee } from "@/lib/chat/groups";
import { stripFormatting } from "@/lib/chat/markdown";
import { isQuiet, ruleFor, useMutes } from "@/lib/chat/mutes";
import {
  agoText, canDecide, currentDay, isCommand, isOnAir, leadsZone, missedCalls, onSite, pendingRequests, reaches, readRate, titleOf, zoneById,
  type OpRequest,
} from "@/lib/chat/operation";
import { useChat, userById } from "@/lib/chat/store";
import Avatar from "../Avatar";
import { linksIn } from "../ContactPage";
import GroupMind from "../GroupMind";
import { IconAlert, IconBellOff, IconBoard, IconChart, IconChevron, IconClock, IconMegaphone, IconPause, IconSettings, IconWalkie } from "../Icons";
import { Segmented, useChatUi, useNow } from "../ui";
import styles from "../chat.module.css";
import { Av, Code, CrewDot } from "./kit";
import { DaySheet } from "./DaySheet";
import { RequestSheet, RequestView } from "./OpCards";
import {
  ALL_ZONES, FilterButton, isNarrowingLog, isNarrowingZones, LogChips, LogFilterMenu, WHOLE_LOG, ZoneChips, ZoneFilterMenu, zonesFor,
  type LogFilter, type ZoneFilter,
} from "./OpFilters";
import {
  badgeText, BroadcastBanner, byStep, crewGroups, DayReport, FeedList, FloorMap, MapLegend, nameOf, openTasks, PageLayer, TaskRow,
  unreadBroadcasts, useOp, WhereCard, ZoneTile, type Op,
} from "./zones";
import p from "./pages.module.css";

type Tab = "zones" | "log" | "mind" | "members";
type View = "list" | "grid" | "map";

/** Urgent first, then the ones waiting longest. */
const byUrgency = (a: OpRequest, b: OpRequest) => Number(b.urgency === "urgent") - Number(a.urgency === "urgent") || a.at - b.at;

/**
 * The Operation's page: what the title capsule opens (the chat stays what
 * the inbox opens). The live strip and a slim shelf (Radio, Broadcasts, the
 * Ops board), then what this person needs: where they are and their tasks
 * (crew), or what waits on them (Command and leads). Then #broadcasts, the
 * channels, and Zones · Log · Mind · Members.
 */
export function OperationPage({ groupId, onClose, onSettings, onSwitchChannel }: {
  groupId: string;
  onClose: () => void;
  /** The group's settings (notifications and mute live there). */
  onSettings: () => void;
  /** Shows another channel of the group (closing this page). */
  onSwitchChannel: (channelId: string) => void;
}) {
  const o = useOp(groupId);
  const { state, me, lastReadAt } = useChat();
  const ui = useChatUi();
  const now = useNow(30_000);
  const { rules } = useMutes(me);
  const [tab, setTab] = useState<Tab>("zones");
  const [view, setView] = useState<View>("list");
  const [pin, setPin] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>(ALL_ZONES);
  const [logFilter, setLogFilter] = useState<LogFilter>(WHOLE_LOG);

  // Mind's "From the chat": the files and links of the channel that's open, as on any group's page.
  const messages = useMemo(() => (state.data.messages[ui.chat.id] ?? []).filter((m) => !m.deletedAt), [state.data.messages, ui.chat.id]);
  const files = useMemo(() => messages.flatMap((m) => m.attachments.filter((a) => a.kind !== "image").map((a) => ({ message: m, a }))).reverse(), [messages]);
  const links = useMemo(() => messages.filter((m) => m.kind === "text" && m.body).flatMap(linksIn).reverse(), [messages]);

  if (!o) return null;
  const { info, op, live, group } = o;
  const identity = chatIdentity(group, me, userById);
  const command = isCommand(info, me);
  const decides = command || !!leadsZone(op, me);
  const muted = isQuiet(ruleFor(rules, group.id, now));
  const dayState = currentDay(op, live, now);
  const day = dayState.n;
  const shift = op.shifts.find((s) => s.id === live.shift);
  const pending = pendingRequests(live);
  const needs = pending.filter((r) => canDecide(info, me, r)).sort(byUrgency);
  const missed = missedCalls(info, live, me);
  const onAir = live.radio.tx.some((t) => isOnAir(t, now) && t.by !== me && reaches(info, live, t, me));
  const unread = command ? [] : unreadBroadcasts(o);
  const myZone = zoneById(op, live.presence[me]?.zoneId);
  const mine = o.tasks().filter((t) => t.assignee === me && t.column !== o.doneColumn).sort(byStep(o));
  const mineHere = myZone ? mine.filter((t) => t.zone === myZone.id) : [];
  // Nothing of yours here yet: what's open in your zone, so there's always something to pick up.
  const openHere = myZone && !mineHere.length ? openTasks(o, myZone.id).sort(byStep(o)).slice(0, 3) : [];
  const mineElsewhere = mine.filter((t) => !myZone || t.zone !== myZone.id);
  const lastBroadcast = live.broadcasts[live.broadcasts.length - 1];
  const lastRead = lastBroadcast ? readRate(info, live, o.members, lastBroadcast) : null;
  const boardOpen = openTasks(o).length;
  const reportZone = myZone ?? op.zones[0];
  const shown = zonesFor(live, op.zones, zoneFilter);

  const channels = [info.channels[0], ...op.zones.map((z) => info.channels.find((c) => c.id === z.channelId))]
    .filter((c): c is NonNullable<typeof c> => !!c && canSee(info, c, me));
  const lastLine = (chatId: string) => {
    const m = [...(state.data.messages[chatId] ?? [])].reverse().find((x) => !x.deletedAt);
    return m ? `${nameOf(m.authorId, me)}: ${stripFormatting(m.body) || (m.attachments.length ? "Attachment" : "")}` : null;
  };
  const unreadIn = (chatId: string) => {
    const read = lastReadAt(chatId);
    return (state.data.messages[chatId] ?? []).filter((m) => m.authorId !== me && !m.deletedAt && m.createdAt > read).length;
  };

  return (
    <PageLayer
      label={`${group.name}, Operation`}
      back="Chat"
      title={group.name}
      onClose={onClose}
      end={(
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={onSettings} aria-label="Operation settings">
          <IconSettings />
        </button>
      )}
    >
      <div className={p.hero}>
        {identity.photo
          ? <Avatar glyph={identity.glyph} tone={identity.tone} photo={identity.photo} size={84} />
          : <span className={p.badge} aria-hidden="true">{badgeText(group.name)}</span>}
        <div className={p.heroTitle}>
          <h2 className={p.heroName}>{group.name}</h2>
          <button
            className={`${p.dayPill} ${dayState.state === "paused" ? p.dayPillPaused : ""}`}
            onClick={() => ui.openSheet(<DaySheet groupId={groupId} onClose={ui.closeSheet} />)}
            aria-label={`Day ${day} of ${op.days}${dayState.state === "on" ? "" : dayState.state === "paused" ? ", paused" : ", finished"}. Open the day`}
          >
            {dayState.state === "paused" && <IconPause size={12} />}
            {dayState.state === "done" ? "Finished" : `Day ${day}/${op.days}`}
          </button>
        </div>
        <p className={p.heroMeta}>
          {[op.venue, "Operation"].filter(Boolean).join(" · ")}
          {muted && <> · <IconBellOff size={13} /> Muted</>}
        </p>
        <div className={p.strip}>
          {shift && <span><IconClock size={14} />{shift.name} shift</span>}
          <span><b>{onSite(live)}</b> on site</span>
          <span className={pending.length ? p.stripWarn : undefined}><b>{pending.length}</b> {pending.length === 1 ? "request" : "requests"}</span>
        </div>
      </div>

      <div className={p.shelf}>
        <button className={`${p.tile} ${onAir ? p.tileLive : ""}`} onClick={() => ui.openRadio?.()} aria-label={`Radio${missed ? `, ${missed} missed` : ""}${onAir ? ", someone is on air" : ""}`}>
          <IconWalkie size={21} />Radio
          {missed > 0 && <em className={p.tileBadge}>{missed}</em>}
        </button>
        <button className={p.tile} onClick={() => onSwitchChannel(op.broadcastsChannel)} aria-label={`Broadcasts${unread.length ? `, ${unread.length} unread` : ""}`}>
          <IconMegaphone size={21} />Broadcasts
          {unread.length > 0 && <em className={p.tileBadge}>{unread.length}</em>}
        </button>
        <button
          className={p.tile}
          onClick={() => (o.boardMessage ? ui.openBoard(o.boardMessage.id) : ui.toast("This Operation has no Ops board yet"))}
          aria-label={`Ops board, ${boardOpen} open`}
        >
          <IconBoard size={21} />Ops board
          {o.boardMessage && <em className={p.tileCount}>{boardOpen}</em>}
        </button>
      </div>

      {!command && (
        <section className={p.section} aria-label="Where you are">
          <WhereCard o={o} />
          {reportZone && (
            <button className={p.report} onClick={() => ui.openSheet(<RequestSheet groupId={groupId} zoneId={reportZone.id} kind="issue" onClose={ui.closeSheet} />)}>
              <IconAlert size={15} />Report an issue{myZone ? ` in ${myZone.code}` : ""}
            </button>
          )}
        </section>
      )}

      {unread.length > 0 && (
        <section className={p.section} aria-label="Broadcasts to read">
          {unread.map((b) => <BroadcastBanner key={b.id} o={o} b={b} />)}
        </section>
      )}

      {!command && (mineHere.length > 0 || openHere.length > 0 || mineElsewhere.length > 0) && (
        <section className={p.section} aria-label="Your tasks">
          {myZone && (mineHere.length > 0 || openHere.length > 0) && <>
            <div className={p.secHead}><h3 className={p.h3}>{mineHere.length ? "My tasks here" : `Open in ${myZone.code}`}<em>{(mineHere.length || openHere.length)}</em></h3></div>
            {(mineHere.length ? mineHere : openHere).map((t) => <TaskRow key={t.id} o={o} task={t} />)}
          </>}
          {mineElsewhere.length > 0 && <>
            <div className={p.secHead}><h3 className={p.h3}>{myZone ? "My other tasks" : "My tasks"}<em>{mineElsewhere.length}</em></h3></div>
            {mineElsewhere.map((t) => <TaskRow key={t.id} o={o} task={t} showZone />)}
          </>}
        </section>
      )}

      {decides && (
        <section className={p.section} aria-label="Needs you">
          <div className={p.secHead}>
            <h3 className={p.h3}>Needs you<em>{needs.length}</em></h3>
            <button className={p.pill} onClick={() => ui.openSheet(<DayReport groupId={groupId} onClose={ui.closeSheet} />)}>
              <IconChart size={15} />Day report
            </button>
          </div>
          {needs.length
            ? <div className={p.reqList}>{needs.map((r) => <RequestView key={r.id} groupId={groupId} request={r} compact interactive />)}</div>
            : <p className={p.emptyBox}>Nothing waiting on you.</p>}
        </section>
      )}

      {lastBroadcast && (
        <section className={p.section} aria-label="Broadcasts">
          <div className={p.list}>
            <button className={p.row} onClick={() => onSwitchChannel(op.broadcastsChannel)}>
              <span className={p.rowIcon}><IconMegaphone size={18} /></span>
              <span className={p.rowMain}>
                <b>#broadcasts <em>· pinned</em></b>
                <small>{lastBroadcast.level === "critical" ? "Critical: " : ""}{lastBroadcast.text}</small>
              </span>
              <span className={p.rowEnd}>
                {lastRead && <span>{lastRead.read}/{lastRead.aud} read</span>}
                <span>{agoText(now - lastBroadcast.at)}</span>
              </span>
            </button>
          </div>
        </section>
      )}

      {channels.length > 0 && (
        <section className={p.section} aria-label="Channels">
          <div className={p.secHead}><h3 className={p.h3}>Channels<em>{channels.length}</em></h3></div>
          <div className={p.list}>
            {channels.map((c) => {
              const z = op.zones.find((x) => x.channelId === c.id);
              const n = unreadIn(c.id);
              const line = lastLine(c.id);
              return (
                <button key={c.id} className={p.row} onClick={() => onSwitchChannel(c.id)} aria-current={ui.chat.id === c.id ? "page" : undefined}>
                  <span className={p.rowIcon}>{z ? z.code : "#"}</span>
                  <span className={p.rowMain}>
                    <b>#{c.name}{ui.chat.id === c.id && <em> · You’re here</em>}</b>
                    <small>{line ?? (z ? `${z.area} · zone chat` : c.topic || "Everyone")}</small>
                  </span>
                  <span className={p.rowEnd}>
                    {n > 0 && <em className={p.unread}>{n}</em>}
                    <IconChevron size={14} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className={p.tabs}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[{ id: "zones", label: "Zones" }, { id: "log", label: "Log" }, { id: "mind", label: "Mind" }, { id: "members", label: "Members" }]}
        />
      </div>

      <div key={tab} className={p.panel} role="tabpanel" aria-label={tab}>
        {tab === "zones" && <>
          <div className={p.toolRow}>
            <Segmented value={view} onChange={setView} options={[{ id: "list", label: "List" }, { id: "grid", label: "Grid" }, { id: "map", label: "Map" }]} />
            {view !== "map" && op.zones.length > 0 && (
              <FilterButton
                on={isNarrowingZones(zoneFilter)}
                label="Sort and filter zones"
                onOpen={(el) => ui.openSheet(<ZoneFilterMenu anchor={el} filter={zoneFilter} onChange={setZoneFilter} onClose={ui.closeSheet} />)}
              />
            )}
          </div>
          {view !== "map" && <ZoneChips filter={zoneFilter} onChange={setZoneFilter} />}
          {!op.zones.length && <p className={p.emptyBox}>No zones yet. Add them in Settings › Zones.</p>}
          {view !== "map" && op.zones.length > 0 && !shown.length && <p className={p.emptyBox}>No zones match. Clear the filter to see them all.</p>}
          {view === "list" && shown.length > 0 && <div className={p.zoneList}>{shown.map((z) => <ZoneTile key={z.id} o={o} zone={z} />)}</div>}
          {view === "grid" && shown.length > 0 && <div className={p.zoneGrid}>{shown.map((z) => <ZoneTile key={z.id} o={o} zone={z} variant="tile" />)}</div>}
          {view === "map" && op.zones.length > 0 && <>
            <FloorMap o={o} onPick={(id) => setPin((x) => (x === id ? null : id))} picked={pin} />
            <MapLegend />
            {(() => { const z = zoneById(op, pin); return z ? <ZoneTile o={o} zone={z} /> : <p className={p.hint}>Tap a pin to see the zone.</p>; })()}
          </>}
          {op.zones.length > 0 && <p className={p.hint}>Hold a zone for Assign, Set status and Open chat.</p>}
        </>}
        {tab === "log" && <>
          <div className={p.toolRow}>
            <p className={p.toolNote}>Newest first</p>
            <FilterButton
              on={isNarrowingLog(logFilter)}
              label="Filter the log"
              onOpen={(el) => ui.openSheet(<LogFilterMenu anchor={el} filter={logFilter} onChange={setLogFilter} onClose={ui.closeSheet} />)}
            />
          </div>
          <LogChips filter={logFilter} onChange={setLogFilter} />
          <FeedList o={o} filter={logFilter} />
        </>}
        {tab === "mind" && (
          <GroupMind
            group={group}
            files={files}
            links={links}
            onJump={(id) => { onClose(); setTimeout(() => ui.jumpTo(id), 320); }}
            onToast={ui.toast}
          />
        )}
        {tab === "members" && <Members o={o} />}
      </div>
    </PageLayer>
  );
}

/** Everyone in the Operation, by crew: what they are here, and where they are now. */
function Members({ o }: { o: Op }) {
  const { info, op, live, me } = o;
  const rank = (u: string) => (u === me ? 0 : op.zones.some((z) => z.leadId === u) ? 1 : 2);
  const groups = crewGroups(o, o.members).map((g) => ({
    ...g,
    ids: [...g.ids].sort((a, b) => rank(a) - rank(b) || userById(a).fullName.localeCompare(userById(b).fullName)),
  }));
  const onSiteCount = o.members.filter((u) => live.presence[u]?.zoneId).length;
  return (
    <>
      <p className={p.hint}>{o.members.length} people · {onSiteCount} checked in</p>
      {groups.map((g) => (
        <div key={g.key} className={p.reqList}>
          <span className={p.groupLabel}><CrewDot tone={g.tone} />{g.name} · {g.ids.length}</span>
          <div className={p.list}>
            {g.ids.map((u) => {
              const user = userById(u);
              const z = zoneById(op, live.presence[u]?.zoneId);
              return (
                <div key={u} className={p.row}>
                  <Av id={u} size={36} />
                  <span className={p.rowMain}>
                    <b>{user.fullName}{u === me && <em> · You</em>}</b>
                    <small>{titleOf(info, u)}</small>
                  </span>
                  <span className={p.rowEnd}>{z ? <Code z={z} /> : <span>Not in</span>}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
