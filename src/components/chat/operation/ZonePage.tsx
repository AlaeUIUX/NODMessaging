"use client";

import { stripFormatting } from "@/lib/chat/markdown";
import { can, canSee } from "@/lib/chat/groups";
import { canManageZones, clock, staffing, zoneById, zoneStatus } from "@/lib/chat/operation";
import { useChat, userById } from "@/lib/chat/store";
import { IconAlert, IconChevron, IconLocation, IconPlus, IconQr, IconUserGroup } from "../Icons";
import { useChatUi, useNow } from "../ui";
import { Code, StatusChip, STATUS_LABEL } from "./kit";
import { RequestSheet, RequestView } from "./OpCards";
import {
  AssignSheet, byStep, IconPackage, nameOf, NewTaskSheet, PageLayer, ScanSheet, StatusSheet, TaskRow, useOp, WhoHere,
} from "./zones";
import p from "./pages.module.css";

/** Requests that are done stay on the zone a little while, so the person who asked sees it closed. */
const DONE_STAYS = 20 * 60_000;

/**
 * One zone, full screen: how staffed it is, checking in or out, who's here,
 * its tasks on the Ops board, its requests, and its chat.
 */
export function ZonePage({ groupId, zoneId, onClose }: { groupId: string; zoneId: string; onClose: () => void }) {
  const o = useOp(groupId);
  const { state } = useChat();
  const ui = useChatUi();
  const now = useNow(30_000);
  const z = o ? zoneById(o.op, zoneId) : undefined;
  if (!o) return null;
  if (!z) {
    return (
      <PageLayer label="Zone" onClose={onClose}>
        <div className={p.section}><p className={p.emptyBox}>This zone isn’t part of the Operation any more.</p></div>
      </PageLayer>
    );
  }
  const { info, live, me } = o;
  const st = staffing(live, z);
  const status = zoneStatus(live, z.id);
  const presence = live.presence[me];
  const isHere = presence?.zoneId === z.id;
  const manage = canManageZones(info, me) || z.leadId === me;
  // Sending people here is Command's call; a lead asks for them instead.
  const assign = canManageZones(info, me) || can(info, me, "approveRequests");
  const tasks = o.tasks(z.id).sort(byStep(o));
  const openCount = tasks.filter((t) => t.column !== o.doneColumn).length;
  const requests = live.requests
    .filter((r) => r.zoneId === z.id && r.status !== "declined" && (r.status !== "done" || now - (r.decidedAt ?? r.at) < DONE_STAYS))
    .reverse();
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const channel = info.channels.find((c) => c.id === z.channelId);
  const last = [...(state.data.messages[z.channelId] ?? [])].reverse().find((m) => !m.deletedAt);
  const act = o.act;
  const ask = (kind: "staff" | "supplies" | "issue") =>
    ui.openSheet(<RequestSheet groupId={groupId} zoneId={z.id} kind={kind} onClose={ui.closeSheet} />);

  return (
    <PageLayer
      label={`${z.code} · ${z.name}`}
      title={<><Code z={z} />{z.name}</>}
      onClose={onClose}
      end={manage ? (
        <button
          className={p.chipBtn}
          onClick={() => ui.openSheet(<StatusSheet groupId={groupId} zoneId={z.id} onClose={ui.closeSheet} />)}
          aria-label={`Status: ${STATUS_LABEL[status]}. Change`}
        >
          <StatusChip status={status} />
        </button>
      ) : <StatusChip status={status} />}
    >
      <div className={p.zoneHero}>
        <Code z={z} size="lg" />
        <div>
          <h2>{z.name}</h2>
          <p>{[z.area, z.leadId ? `Lead ${z.leadId === me ? "you" : userById(z.leadId).fullName}` : null].filter(Boolean).join(" · ")}</p>
        </div>
      </div>

      <div className={p.stats}>
        <div className={p.stat}><b className={p[`lvl_${st.level}`]}>{st.n}/{st.target}</b><small>here</small></div>
        <div className={p.stat}><b>{openCount}</b><small>open {openCount === 1 ? "task" : "tasks"}</small></div>
        <div className={`${p.stat} ${pendingCount ? p.statWarn : ""}`}><b>{pendingCount}</b><small>{pendingCount === 1 ? "request" : "requests"}</small></div>
      </div>

      <section className={p.section} aria-label="Check in">
        {isHere && presence ? (
          <div className={p.hereRow}>
            <span><IconLocation size={16} />You’re here since {clock(presence.since)}</span>
            <button className={p.btnSmGhost} onClick={() => { act.checkIn(null); ui.toast(`Left ${z.code}`); }}>Leave</button>
          </div>
        ) : (
          <div className={p.hereBtns}>
            <button className={p.btn} onClick={() => { act.checkIn(z.id, "tap"); ui.toast(`Checked in to ${z.code} · ${z.name}`); }}>
              <IconLocation size={17} />I’m here
            </button>
            <button className={p.btnGhost} onClick={() => ui.openSheet(<ScanSheet groupId={groupId} onClose={ui.closeSheet} />)}>
              <IconQr size={17} />Scan
            </button>
          </div>
        )}
      </section>

      <section className={p.section} aria-label="Who's here">
        <div className={p.secHead}>
          <h3 className={p.h3}>Who’s here<em>{st.n}</em></h3>
          {assign ? (
            <button className={p.pill} onClick={() => ui.openSheet(<AssignSheet groupId={groupId} zoneId={z.id} onClose={ui.closeSheet} />)}>
              <IconPlus size={14} />Assign
            </button>
          ) : manage && (
            <button className={p.pill} onClick={() => ui.openSheet(<RequestSheet groupId={groupId} zoneId={z.id} kind="staff" onClose={ui.closeSheet} />)}>
              <IconPlus size={14} />Ask for people
            </button>
          )}
        </div>
        <WhoHere o={o} zoneId={z.id} />
      </section>

      <section className={p.section} aria-label="Tasks here">
        <div className={p.secHead}>
          <h3 className={p.h3}>Tasks here<em>{openCount}</em></h3>
          {o.boardMessage && (
            <button className={p.pill} onClick={() => ui.openSheet(<NewTaskSheet groupId={groupId} zoneId={z.id} onClose={ui.closeSheet} />)}>
              <IconPlus size={14} />Task
            </button>
          )}
        </div>
        {tasks.length
          ? tasks.map((t) => <TaskRow key={t.id} o={o} task={t} />)
          : <p className={p.emptyBox}>{o.boardMessage ? `No tasks in ${z.code} yet.` : "This Operation has no Ops board yet."}</p>}
      </section>

      <section className={p.section} aria-label="Requests">
        <div className={p.secHead}><h3 className={p.h3}>Requests<em>{pendingCount ? `${pendingCount} pending` : ""}</em></h3></div>
        <div className={p.reqBtns}>
          <button className={p.reqBtn} onClick={() => ask("staff")}><IconUserGroup size={20} />Need people</button>
          <button className={p.reqBtn} onClick={() => ask("supplies")}><IconPackage size={20} />Need supplies</button>
          <button className={p.reqBtn} onClick={() => ask("issue")}><IconAlert size={20} />Report issue</button>
        </div>
        {requests.length > 0 && (
          <div className={p.reqList}>
            {requests.map((r) => <RequestView key={r.id} groupId={groupId} request={r} interactive />)}
          </div>
        )}
      </section>

      {channel && canSee(info, channel, me) && (
        <section className={p.section} aria-label="Zone chat">
          <button className={p.chatLink} onClick={() => ui.switchChannel?.(z.channelId)}>
            <span className={p.hash}>#</span>
            <span className={p.rowMain}>
              <b>#{channel.name}</b>
              <small>{last ? `${nameOf(last.authorId, me)}: ${stripFormatting(last.body) || "Attachment"}` : "Zone chat"}</small>
            </span>
            <span className={p.chev}><IconChevron size={16} /></span>
          </button>
        </section>
      )}
    </PageLayer>
  );
}
