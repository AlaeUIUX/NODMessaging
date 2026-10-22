"use client";

import { groupInfo } from "@/lib/chat/groups";
import { useMemo } from "react";
import {
  forMembers, opId, readRate, staffing, zoneById, zoneStatus,
  type Audience, type ChannelId, type OpBroadcast, type OpRequest, type Presence, type RequestKind, type Target, type Transmission, type ZoneStatus,
} from "@/lib/chat/operation";
import { opDispatch, opLive, useOpLive } from "@/lib/chat/opstore";
import { newTask } from "@/lib/chat/project";
import { useChat } from "@/lib/chat/store";
import type { Card, Message, Priority, ProjectCard, Task } from "@/lib/chat/types";

/**
 * Everything an Operation screen needs: the group, its setup, its live state,
 * and every action, each of which keeps the chat (cards in the zone
 * channels and #broadcasts) and the live state in step. Actions stamp their
 * own ids and times, so call them from event handlers and timers, never
 * while rendering. Most take an optional `as`: a simulated person acting
 * (the simulation passes it; screens leave it out and act as `me`).
 */
export function useOperation(groupId: string | null | undefined) {
  const chat = useChat();
  const { state, me, sendCard, postAs, cardOp } = chat;
  const group = groupId ? state.data.chats.find((c) => c.id === groupId && !c.groupId && !c.removedAt) : undefined;
  const info = group ? groupInfo(group) : undefined;
  const op = info?.operation;
  const raw = useOpLive(op ? groupId : null);
  const members = useMemo(() => group?.memberIds ?? [], [group?.memberIds]);
  // Someone who left or was removed is no longer on site.
  const live = useMemo(() => (raw ? forMembers(raw, members) : raw), [raw, members]);
  const boardMessage = op?.boardMessageId && group
    ? (state.data.messages[group.id]?.find((m) => m.id === op.boardMessageId && m.card?.type === "project") as (Message & { card: ProjectCard }) | undefined)
    : undefined;

  const gid = group?.id ?? "";
  const now = () => Date.now();
  const post = (chatId: string, by: string, card: Card, summary: string) =>
    (by === me ? sendCard(chatId, card, summary) : postAs(chatId, by, summary, card));

  const act = {
    checkIn(zoneId: string | null, via: Presence["via"] = "tap", as = me) {
      opDispatch(gid, { t: "checkIn", userId: as, zoneId, via, at: now(), feedId: opId("f") });
    },

    raiseRequest(r: { kind: RequestKind; zoneId: string; note: string; count?: number; people?: string[]; fromZoneId?: string; photo?: boolean; urgency: OpRequest["urgency"] }, as = me) {
      const z = op && zoneById(op, r.zoneId);
      if (!z) return "";
      const id = opId("r");
      const request: OpRequest = { ...r, id, by: as, at: now(), status: "pending", accepts: {}, sending: true, chatId: z.channelId };
      opDispatch(gid, { t: "request.add", request, feedId: opId("f") });
      post(z.channelId, as, { type: "opRef", groupId: gid, ref: "request", id }, requestSummary(request, z.code));
      // Venue signal: queued on the phone, then it lands.
      setTimeout(() => opDispatch(gid, { t: "request.landed", id }), 1400);
      return id;
    },

    decide(requestId: string, approve: boolean, people?: string[], as = me) {
      opDispatch(gid, { t: "request.decide", id: requestId, approve, by: as, people, at: now(), feedId: opId("f") });
    },

    /**
     * A moved person's answer. Accepting checks them in; a zone that was only
     * busy for want of people settles to OK once staffed (credited to whoever
     * decided the move, not the person who came).
     */
    answer(requestId: string, accept: boolean, as = me) {
      opDispatch(gid, { t: "request.answer", id: requestId, userId: as, accept, at: now(), feedId: opId("f") });
      const after = opLive(gid);
      const r = after?.requests.find((x) => x.id === requestId);
      const z = r && op && zoneById(op, r.zoneId);
      if (accept && after && z && zoneStatus(after, z.id) === "busy" && !openIssue(z.id)) {
        const st = staffing(forMembers(after, members), z);
        if (st.level === "ok" || st.level === "over") act.setZoneStatus(z.id, "ok", r?.decidedBy ?? as);
      }
    },

    /** Done. An issue that was the last one open in its zone puts the zone back to OK (a Closed zone stays closed). */
    markDone(requestId: string, as = me) {
      const r = opLive(gid)?.requests.find((x) => x.id === requestId);
      opDispatch(gid, { t: "request.done", id: requestId, by: as, at: now() });
      if (r?.kind !== "issue") return;
      const status = zoneStatus(opLive(gid)!, r.zoneId);
      if ((status === "issue" || status === "busy") && !openIssue(r.zoneId)) act.setZoneStatus(r.zoneId, "ok", as);
    },

    setZoneStatus(zoneId: string, status: ZoneStatus, as = me) {
      opDispatch(gid, { t: "zone.status", zoneId, status, by: as, at: now(), feedId: opId("f") });
    },

    /** Sends someone to a zone: a one-person move request, approved at once, that they accept. */
    assign(userId: string, zoneId: string, as = me) {
      const from = opLive(gid)?.presence[userId]?.zoneId ?? undefined;
      const z = op && zoneById(op, zoneId);
      const id = act.raiseRequest({ kind: "move", zoneId, fromZoneId: from, count: 1, people: [userId], note: `Please come to ${z?.code ?? "this zone"}.`, urgency: "normal" }, as);
      if (id) act.decide(id, true, [userId], as);
      return id;
    },

    sendBroadcast(text: string, level: OpBroadcast["level"], audience: Audience, as = me) {
      if (!op) return "";
      const id = opId("b");
      const at = now();
      opDispatch(gid, { t: "broadcast.add", broadcast: { id, level, text, audience, by: as, at, acks: { [as]: at } }, feedId: opId("f") });
      post(op.broadcastsChannel, as, { type: "opRef", groupId: gid, ref: "broadcast", id }, `${level === "critical" ? "Critical" : "Broadcast"}: ${text}`);
      return id;
    },

    ack(broadcastId: string, as = me) {
      opDispatch(gid, { t: "broadcast.ack", id: broadcastId, userId: as, at: now() });
    },

    /** Re-pings everyone who hasn't read it; returns how many that was. */
    remind(broadcastId: string, as = me) {
      const l = opLive(gid);
      const b = l?.broadcasts.find((x) => x.id === broadcastId);
      if (!l || !b || !info) return 0;
      const count = readRate(info, l, members, b).unread.length;
      opDispatch(gid, { t: "broadcast.remind", id: broadcastId, by: as, at: now(), count, feedId: opId("f") });
      return count;
    },

    tune(channel: ChannelId, as = me) { opDispatch(gid, { t: "radio.tune", userId: as, channel }); },
    radioSeen(as = me) { opDispatch(gid, { t: "radio.seen", userId: as, at: now() }); },
    /**
     * Keys up: a live call whose words arrive as they're spoken. Returns its id.
     * Pass a fixed id when several tabs might send the same call (a simulated
     * reply): the second one is then the same call, not a repeat.
     */
    keyUp(target: Target, source: Transmission["source"] = "voice", as = me, fixedId?: string) {
      const id = fixedId ?? opId("x");
      opDispatch(gid, { t: "radio.key", tx: { id, by: as, at: now(), target, text: "", live: true, source } });
      return id;
    },
    words(txId: string, text: string) { opDispatch(gid, { t: "radio.words", id: txId, text }); },
    release(txId: string, text: string, source?: Transmission["source"]) { opDispatch(gid, { t: "radio.release", id: txId, text, at: now(), source }); },
    setShift(shift: string) { opDispatch(gid, { t: "shift", shift }); },

    /** A task on the Ops board, in a zone. */
    addTask(t: { title: string; zoneId: string; priority?: Priority; assignee?: string | null; dueMins?: number }, as = me) {
      if (!boardMessage) return;
      const column = boardMessage.card.columns[0]?.id ?? "todo";
      const task = newTask({ title: t.title, column, assignee: t.assignee ?? null, due: t.dueMins ? now() + t.dueMins * 60_000 : null, zone: t.zoneId, priority: t.priority }, as);
      cardOp(boardMessage, { kind: "task.add", task });
    },

    /** One step along the board (To do → Doing → Done), or back. */
    stepTask(task: Task, dir: 1 | -1, as = me) {
      if (!boardMessage) return;
      const cols = boardMessage.card.columns;
      const i = cols.findIndex((c) => c.id === task.column);
      const next = cols[Math.max(0, Math.min(cols.length - 1, i + dir))];
      if (!next || next.id === task.column) return;
      cardOp(boardMessage, { kind: "task.update", id: task.id, patch: { column: next.id, order: now() }, at: now() });
      if (next.id === cols[cols.length - 1].id) {
        opDispatch(gid, { t: "feed", event: { id: opId("f"), at: now(), kind: "task", title: task.title, zoneId: task.zone ?? null, by: as } });
      }
    },
  };

  /** An issue still pending or approved in a zone (other than the one being closed). */
  function openIssue(zoneId: string) {
    return !!opLive(gid)?.requests.some((x) => x.zoneId === zoneId && x.kind === "issue" && (x.status === "pending" || x.status === "approved"));
  }

  /** Board tasks (not deleted), optionally only one zone's. */
  const tasks = (zoneId?: string) =>
    Object.values(boardMessage?.card.tasks ?? {}).filter((t) => !t.deleted && (!zoneId || t.zone === zoneId));
  const doneColumn = boardMessage?.card.columns[boardMessage.card.columns.length - 1]?.id;

  return { ...chat, group, info, op, live, members, boardMessage, tasks, doneColumn, act };
}

export type OperationApi = ReturnType<typeof useOperation>;

export function requestSummary(r: Pick<OpRequest, "kind" | "count" | "note" | "people">, code: string) {
  if (r.kind === "staff") return `Request: ${r.count ?? 1} ${r.count === 1 ? "person" : "people"} for ${code}`;
  if (r.kind === "move") return `Move to ${code}`;
  if (r.kind === "supplies") return `Request: supplies for ${code}`;
  return `Issue at ${code}: ${r.note.split(/\s+/).slice(0, 6).join(" ")}`;
}
