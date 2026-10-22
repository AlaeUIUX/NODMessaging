"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { chatIdentity } from "@/lib/chat/avatar";
import { can, canPost, groupInfo, groupOf, roleNames, visibleChannels, writeLastChannel } from "@/lib/chat/groups";
import { effectiveRule, isQuiet, useMutes } from "@/lib/chat/mutes";
import { stripFormatting } from "@/lib/chat/markdown";
import { allPeople } from "@/lib/chat/people";
import { useChat, userById } from "@/lib/chat/store";
import { TONES } from "@/lib/chat/avatar";
import {
  canBroadcast, dayOf, emptyLive, isCommand, onSite, pendingRequests, reaches, staffing, zoneByChannel, zoneById,
} from "@/lib/chat/operation";
import { ensureOpLive } from "@/lib/chat/opstore";
import type { BoardMessage } from "@/lib/chat/project";
import type { Card, Chat, Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import {
  AddSheet, ChecklistBuilder, EventBuilder, LocationBuilder, PaymentBuilder, PollBuilder, ReminderBuilder, type AddKind,
} from "./CardBuilders";
import Composer from "./Composer";
import { IconBack, IconBellOff, IconBoard, IconCheck, IconChevron, IconLocation, IconMegaphone, IconPhone, IconQr } from "./Icons";
import { Code } from "./operation/kit";
import { BroadcastSheet, RequestSheet } from "./operation/OpCards";
import { OperationPage } from "./operation/OperationPage";
import { RadioButton, RadioScreen } from "./operation/Radio";
import { ZonePage } from "./operation/ZonePage";
import { BroadcastBanner, openTasks, ScanSheet, unreadBroadcasts, useOp } from "./operation/zones";
import ps from "./operation/pages.module.css";
import MessageList from "./MessageList";
import MessageOverlay from "./MessageOverlay";
import MessageRow, { type BubblePos } from "./MessageRow";
import { ArtifactGallery, SketchBuilder, WheelBuilder } from "./Artifacts";
import { BillFlow } from "./Bill";
import ContactPage, { type ContactTab } from "./ContactPage";
import { ChannelBar, ChannelSheet, GroupSettings, InvitePeopleSheet } from "./Groups";
import { PlanBuilder } from "./Plans";
import { ProjectBoard, ProjectBuilder, TaskFromMessage } from "./Project";
import { openItems, openState } from "@/lib/chat/open";
import { newProject, newTask, parseTaskCommand, projectsOf } from "@/lib/chat/project";
import { emojify } from "@/lib/chat/emoji";
import { land } from "@/lib/chat/landing";
import { saveToMind, UNASSIGNED } from "@/lib/chat/mind";
import { fly } from "./flight";
import { MindMark } from "./Landing";
import { MoveSheet } from "./Mind";
import { MediaGrid, MediaViewer, ReceiptSheet } from "./MediaViewer";
import ReactionSheet from "./ReactionSheet";
import StatusBar from "./StatusBar";
import { ChatUiProvider, getPermission, PermissionAlert, setPermission, smooth, useBackLayer, useNow, type PermissionKind } from "./ui";
import styles from "./chat.module.css";

interface MenuState {
  message: Message;
  pos: BubblePos;
  rect: { top: number; left: number; width: number; height: number };
  bounds: { width: number; height: number };
  armed: boolean;
}

const EDGE = 24;

/** History keys of the screens stacked on a chat, each with its own entry (see useBackLayer). */
const LAYER_KEYS = ["nodContact", "nodBoard", "nodOp", "nodZone", "nodRadio", "nodOpsBoard"];

/**
 * Closes the stacked screens named by `keys` (the top-most ones), going back
 * through their history entries in one step, then runs `then` once they've
 * gone. Switching channel with a screen still open would otherwise leave its
 * entry behind, and its own cleanup would step back into the old channel.
 */
function afterLayers(then: () => void, keys = LAYER_KEYS) {
  const n = keys.filter((k) => window.history.state?.[k]).length;
  if (!n) { then(); return; }
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", go);
    clearTimeout(fallback);
    then();
  };
  window.addEventListener("popstate", go);
  // In case the browser never reports the step back.
  const fallback = setTimeout(go, 500);
  window.history.go(-n);
}

export default function ChatView({ chat: opened, leaving, onBack, focusMessageId, onSwitchChannel, instant }: {
  chat: Chat;
  leaving: boolean;
  /** `immediate` when a swipe-back already animated the screen away. */
  onBack: (immediate?: boolean) => void;
  /** Scrolled to and flashed once the thread has settled (e.g. opened from Analytics). */
  focusMessageId?: string | null;
  /** A group's channel chip was tapped: show that channel instead. */
  onSwitchChannel?: (chat: Chat) => void;
  /** Shown in place (a channel switch), without sliding in. */
  instant?: boolean;
}) {
  const {
    state, me, isOnline, lastReadAt, send, sendCard, cardOp, retry, toggleReaction, editMessage, deleteMessage,
    togglePin, loadEarlier, hasEarlier, setTyping, typingUsers, markRead,
  } = useChat();

  const screenRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number; leaving?: boolean; actions?: { label: string; run: () => void }[]; mind?: boolean } | null>(null);
  const [viewer, setViewer] = useState<{ message: Message; index: number } | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  /** The message just saved to Mind, while its bubble plays the moment. */
  const [saved, setSaved] = useState<string | null>(null);
  const [overlaySheet, setOverlaySheet] = useState<ReactNode>(null);
  const [alert, setAlert] = useState<{ kind: PermissionKind; resolve: (ok: boolean) => void } | null>(null);
  const [incoming, setIncoming] = useState<{ files: File[]; id: number } | null>(null);
  const [contact, setContact] = useState<ContactTab | null>(null);
  // The open board, by message id: a chat can hold several.
  const [boardId, setBoardId] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The live chat: a group renamed, or someone joining, shows straight away.
  const chat = state.data.chats.find((c) => c.id === opened.id) ?? opened;
  // In a group, this chat is one of its channels (#general is the group's own chat).
  const group = chat.kind === "group" ? groupOf(state.data.chats, chat) : null;
  const gInfo = group ? groupInfo(group) : null;
  const channel = gInfo?.channels.find((c) => c.id === chat.id) ?? null;
  const channels = group ? visibleChannels(group, me) : [];
  const manageChannels = !!gInfo && can(gInfo, me, "manageChannels");
  const showChannels = !!group && !!channel && (channels.length > 1 || manageChannels);
  const canWrite = !gInfo || !channel || canPost(gInfo, channel, me);
  const [groupSettings, setGroupSettings] = useState<{ leaving: boolean } | null>(null);
  const [pendingChannel, setPendingChannel] = useState<string | null>(null);

  // An Operation (a group running a live event): its page, a zone's page, the radio and the Ops board stack on the chat.
  const o = useOp(group?.id);
  const [opPage, setOpPage] = useState(false);
  const [zonePage, setZonePage] = useState<string | null>(null);
  const [radio, setRadio] = useState(false);
  const [opsBoard, setOpsBoard] = useState<{ zone: string | null } | null>(null);
  /** The zone whose channel this is. */
  const chatZone = o ? zoneByChannel(o.op, chat.id) : undefined;
  const opCommand = !!o && isCommand(o.info, me);
  const myZone = o ? zoneById(o.op, o.live.presence[me]?.zoneId) : undefined;
  const opsBoardMessage: BoardMessage | undefined = o?.boardMessage;
  const showOpsBoard = !!opsBoard && !!opsBoardMessage;

  const messages = useMemo(() => state.data.messages[chat.id] ?? [], [state.data.messages, chat.id]);
  const typing = typingUsers(chat.id).filter((id) => id !== me);
  // A channel wears its group's name and picture.
  const identity = chatIdentity(group ?? chat, me, userById);
  const other = chat.kind === "dm" ? chat.memberIds.find((id) => id !== me) : undefined;
  const online = !!other && isOnline(other);
  const members = useMemo(() => allPeople().filter((u) => chat.memberIds.includes(u.id) && u.id !== me), [chat, me]);
  // Anything unfinished in this chat puts a blue dot after the name.
  // Re-checked each minute too: a poll closing or an event starting ends "open" with no new message.
  const minute = useNow(60_000);
  // Muted (this chat, or the group it's a channel of): a small bell under the name says so.
  const { rules: mutes } = useMutes(me);
  const quiet = isQuiet(effectiveRule(mutes, chat, minute));
  const live = useMemo(() => openItems(messages, me, minute), [messages, me, minute]);
  const boards = useMemo(() => projectsOf(messages), [messages]);
  const openBoardMessage = boardId ? boards.find((b) => b.id === boardId) : undefined;
  useBackLayer("nodContact", contact !== null, () => setContact(null));
  useBackLayer("nodBoard", !!openBoardMessage, () => setBoardId(null));
  useBackLayer("nodOp", opPage, () => setOpPage(false));
  useBackLayer("nodOpsBoard", showOpsBoard, () => setOpsBoard(null));
  useBackLayer("nodZone", zonePage !== null, () => setZonePage(null));
  useBackLayer("nodRadio", radio, () => setRadio(false));

  // A new Operation's live state starts the first time it's opened.
  const opGroupId = o?.group.id;
  const firstShift = o?.op.shifts[0]?.id;
  useEffect(() => {
    if (opGroupId) ensureOpLive(opGroupId, () => emptyLive(firstShift));
  }, [opGroupId, firstShift]);

  // Unread in the other channels, for the dots on their chips.
  const channelUnread: Record<string, number> = {};
  for (const c of channels) {
    const read = lastReadAt(c.id);
    channelUnread[c.id] = (state.data.messages[c.id] ?? []).filter((m) => m.authorId !== me && m.createdAt > read).length;
  }
  const switchChannel = (id: string) => {
    if (!group || id === chat.id) return;
    const target = state.data.chats.find((c) => c.id === id);
    if (!target) return;
    writeLastChannel(me, group.id, id);
    onSwitchChannel?.(target);
  };
  // From a screen stacked on the chat: those screens close first (their history entries with them), then the switch.
  const switchRef = useRef(switchChannel);
  useEffect(() => { switchRef.current = switchChannel; });
  const switchFromLayer = useCallback((id: string) => afterLayers(() => switchRef.current(id)), []);
  /** A zone's page; over the radio it replaces it (the radio steps back first). */
  const openZone = useCallback((zoneId: string) => afterLayers(() => setZonePage(zoneId), ["nodRadio"]), [setZonePage]);
  const openRadio = useCallback(() => setRadio(true), [setRadio]);
  /** The Operation's page, under nothing: whatever stacks above it steps back first. */
  const openOperation = useCallback(() => afterLayers(() => setOpPage(true), ["nodRadio", "nodZone", "nodOpsBoard"]), [setOpPage]);
  const groupId = group?.id;
  const inChannel = !!channel;
  useEffect(() => {
    if (groupId && inChannel) writeLastChannel(me, groupId, chat.id);
  }, [groupId, inChannel, me, chat.id]);
  // A channel just made from the + chip: open it once it exists.
  useEffect(() => {
    if (!pendingChannel || !state.data.chats.some((c) => c.id === pendingChannel)) return;
    const id = pendingChannel;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingChannel(null);
    switchChannel(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChannel, state.data.chats]);
  const closeGroupSettings = () => {
    setGroupSettings((x) => (x ? { leaving: true } : x));
    setTimeout(() => setGroupSettings((x) => (x?.leaving ? null : x)), 220);
  };

  // Frozen on open so the divider doesn't chase incoming messages.
  const [firstUnreadId] = useState(() => {
    const lastRead = lastReadAt(chat.id);
    if (!lastRead) return null;
    return messages.find((m) => m.authorId !== me && m.createdAt > lastRead)?.id ?? null;
  });

  // Whatever lands while the chat is on screen is read: on open, on each new
  // message, and when the tab comes back into view.
  useEffect(() => {
    if (document.visibilityState === "visible") markRead(chat.id);
  }, [chat.id, me, messages.length, markRead]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") markRead(chat.id);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [chat.id, markRead]);

  // The thread scrolls under the floating composer, so its bottom inset
  // tracks the composer's real height (reply previews, attachments, growth).
  useEffect(() => {
    // The composer is absolutely positioned (the wrapper has no height) and
    // stays mounted for the life of the chat, edit mode included.
    const composer = composerRef.current?.firstElementChild as HTMLElement | null;
    const screen = screenRef.current;
    if (!composer || !screen) return;
    const ro = new ResizeObserver(() => {
      const thread = screen.querySelector<HTMLElement>("[data-thread]");
      const stick = thread ? thread.scrollHeight - thread.scrollTop - thread.clientHeight < 40 : false;
      screen.style.setProperty("--composer-h", `${composer.offsetHeight + 8}px`);
      if (thread && stick) thread.scrollTop = thread.scrollHeight;
    });
    ro.observe(composer);
    return () => ro.disconnect();
  }, []);

  /** `mind`: about something kept in Mind; the toast leads with Mind's mark (where a saved message flies to) instead of a tick. */
  const flash = useCallback((text: string, actions?: { label: string; run: () => void }[], opts?: { mind?: boolean }) => {
    const id = Date.now();
    setToast({ text, id, actions, mind: opts?.mind });
    // Fade out before unmounting, so toasts leave as gently as they arrive.
    // A toast with actions waits longer, so there's time to tap them.
    const stay = actions ? 4200 : 1800;
    setTimeout(() => setToast((t) => (t?.id === id ? { ...t, leaving: true } : t)), stay);
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), stay + 220);
  }, []);
  const dismissToast = () => {
    setToast((t) => (t ? { ...t, leaving: true } : t));
    setTimeout(() => setToast(null), 220);
  };

  /** Asks for a permission the way the OS would: once, then remembered. */
  const ask = useCallback((kind: PermissionKind) => new Promise<boolean>((resolve) => {
    const state = getPermission(kind);
    if (state === "granted") { resolve(true); return; }
    // A denied permission asks again only when the person explicitly retries.
    setAlert({
      kind,
      resolve: (ok) => {
        setPermission(kind, ok ? "granted" : "denied");
        setAlert(null);
        if (!ok) flash(kind === "notifications" ? "Notifications stay off" : "Access not allowed");
        resolve(ok);
      },
    });
  }), [flash]);

  const closeSheet = useCallback(() => setOverlaySheet(null), []);
  const shareCard = (card: Card, summary: string) => {
    sendCard(chat.id, card, summary);
    closeSheet();
  };

  const startFlow = async (kind: AddKind) => {
    const seed = "";
    switch (kind) {
      case "photos":
        if (await ask("photos")) photoInput.current?.click();
        return;
      case "camera":
        if (await ask("camera")) cameraInput.current?.click();
        return;
      case "file":
        fileInput.current?.click();
        return;
      case "poll":
        setOverlaySheet(<PollBuilder onSend={shareCard} onClose={closeSheet} />);
        return;
      case "checklist":
        setOverlaySheet(<ChecklistBuilder onSend={shareCard} onClose={closeSheet} ownerName="you" />);
        return;
      case "reminder":
        setOverlaySheet(
          <ReminderBuilder
            seed={seed}
            onClose={closeSheet}
            onSend={async (card, summary) => {
              // Reminders are only useful if they can reach you: ask first, send either way.
              if (getPermission("notifications") === "prompt") await ask("notifications");
              shareCard(card, summary);
            }}
          />,
        );
        return;
      case "location": {
        const state = getPermission("location");
        const granted = state === "granted" || (state === "prompt" && (await ask("location")));
        const open = (ok: boolean) => setOverlaySheet(
          <LocationBuilder
            granted={ok}
            onSend={shareCard}
            onClose={closeSheet}
            onEnable={async () => {
              setPermission("location", "prompt");
              closeSheet();
              const again = await ask("location");
              open(again);
            }}
          />,
        );
        open(granted);
        return;
      }
      case "event":
        setOverlaySheet(<EventBuilder onSend={shareCard} onClose={closeSheet} />);
        return;
      case "pay":
      case "request":
        setOverlaySheet(<PaymentBuilder mode={kind} members={members} onSend={shareCard} onClose={closeSheet} />);
        return;
      case "sketch":
        setOverlaySheet(<SketchBuilder onSend={shareCard} onClose={closeSheet} />);
        return;
      case "wheel":
        setOverlaySheet(<WheelBuilder onSend={shareCard} onClose={closeSheet} />);
        return;
      case "plan":
        setOverlaySheet(<PlanBuilder onSend={shareCard} onClose={closeSheet} />);
        return;
      case "bill":
        setOverlaySheet(<BillFlow onSend={shareCard} onClose={closeSheet} />);
        return;
      case "board":
        openBoard();
        return;
      case "tictactoe":
        sendCard(chat.id, { type: "tictactoe", players: [me, null], board: Array(9).fill(null) }, "Tic-tac-toe: who's in?");
        return;
      case "gallery":
        setOverlaySheet(<ArtifactGallery onClose={closeSheet} onPick={(k) => startFlow(k)} />);
        return;
      case "opRequest": {
        // For this zone channel's zone, else where I am, else the first zone.
        if (!o) return;
        const zoneId = chatZone?.id ?? o.live.presence[me]?.zoneId ?? o.op.zones[0]?.id;
        if (!zoneId) { flash("Add a zone first, in Settings › Zones"); return; }
        setOverlaySheet(<RequestSheet groupId={o.group.id} zoneId={zoneId} kind={chatZone ? "staff" : "issue"} onClose={closeSheet} />);
        return;
      }
      case "opBroadcast":
        if (!o) return;
        setOverlaySheet(<BroadcastSheet groupId={o.group.id} onClose={closeSheet} />);
        return;
    }
  };

  const pickFiles = (list: FileList | null) => {
    if (list?.length) setIncoming({ files: Array.from(list), id: Date.now() });
  };

  /** One photo opens full screen; a collection opens its grid first. */
  const openMedia = useCallback((message: Message, index: number | "all") => {
    if (index === "all") {
      setOverlaySheet(<MediaGrid message={message} onClose={closeSheet} onPick={(i) => setViewer({ message, index: i })} />);
    } else {
      setViewer({ message, index });
    }
  }, [closeSheet]);

  // Interactive swipe back: drag from the left edge and the inbox follows.
  const edge = useRef<{ x: number; dx: number; t: number } | null>(null);
  const inboxEl = () => screenRef.current?.parentElement?.querySelector<HTMLElement>("[data-inbox-screen]") ?? null;
  const paint = (dx: number) => {
    const el = screenRef.current;
    const width = el?.offsetWidth ?? 1;
    const p = Math.min(1, Math.max(0, dx / width));
    if (el) el.style.transform = `translateX(${dx}px)`;
    const inbox = inboxEl();
    if (inbox) {
      inbox.style.transform = `translateX(${-28 * (1 - p)}%)`;
      inbox.style.filter = `brightness(${0.94 + 0.06 * p})`;
    }
  };
  const settle = (to: "back" | "stay") => {
    const el = screenRef.current;
    const inbox = inboxEl();
    [el, inbox].forEach((x) => { if (x) x.style.transition = "transform 340ms cubic-bezier(.22, 1, .36, 1), filter 340ms cubic-bezier(.22, 1, .36, 1)"; });
    if (to === "back") {
      paint(el?.offsetWidth ?? 400);
      setTimeout(() => {
        [el, inbox].forEach((x) => { if (x) { x.style.transition = ""; x.style.transform = ""; x.style.filter = ""; } });
        onBack(true);
      }, 340);
    } else {
      paint(0);
      setTimeout(() => {
        [el, inbox].forEach((x) => { if (x) { x.style.transition = ""; x.style.transform = ""; x.style.filter = ""; } });
      }, 340);
    }
  };
  const onEdgeDown = (e: React.PointerEvent) => {
    const el = screenRef.current;
    // A layer over the chat (contact page, board, an Operation's screens) handles its own edge swipe.
    if (!el || menu || viewer || overlaySheet || alert || contact || openBoardMessage) return;
    if (opPage || zonePage !== null || radio || showOpsBoard) return;
    const x = e.clientX - el.getBoundingClientRect().left;
    if (x > EDGE) return;
    // Claim edge drags before a bubble underneath starts its own gesture.
    e.stopPropagation();
    edge.current = { x: e.clientX, dx: 0, t: performance.now() };
    el.setPointerCapture(e.pointerId);
    el.style.animation = "none";
  };
  const onEdgeMove = (e: React.PointerEvent) => {
    if (!edge.current) return;
    edge.current.dx = Math.max(0, e.clientX - edge.current.x);
    paint(edge.current.dx);
  };
  const onEdgeUp = () => {
    const d = edge.current;
    edge.current = null;
    if (!d) return;
    const width = screenRef.current?.offsetWidth ?? 400;
    const velocity = d.dx / Math.max(1, performance.now() - d.t);
    settle(d.dx > width * 0.4 || velocity > 0.6 ? "back" : "stay");
  };

  const jumpTo = useCallback((messageId: string) => {
    const el = screenRef.current?.querySelector(`[data-message-id="${messageId}"]`);
    el?.scrollIntoView({ behavior: smooth(), block: "center" });
    setHighlighted(messageId);
    setTimeout(() => setHighlighted(null), 1200);
  }, []);

  // Opened pointing at one message (Analytics, a jump from elsewhere): let the
  // thread's own mount scroll (to the bottom) settle first, then jump to it.
  useEffect(() => {
    if (!focusMessageId) return;
    const t = setTimeout(() => jumpTo(focusMessageId), 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Boards are read fresh in callbacks; the last one viewed here is remembered per chat.
  const boardsRef = useRef(boards);
  useEffect(() => { boardsRef.current = boards; }, [boards]);
  const openIdRef = useRef(boardId);
  useEffect(() => { openIdRef.current = boardId; }, [boardId]);
  // An Operation's tasks go on its one Ops board (in the group's own thread), in the zone whose channel this is.
  // Crew open it on their own zone; Command on every zone.
  const boardZone = chatZone?.id ?? (o && !opCommand ? myZone?.id ?? null : null);
  const opsRef = useRef<{ board?: BoardMessage; chatZone: string | null; boardZone: string | null; codes: Record<string, string> }>({ chatZone: null, boardZone: null, codes: {} });
  const zoneCodes = o?.op.zones;
  useEffect(() => {
    opsRef.current = {
      board: opsBoardMessage,
      chatZone: chatZone?.id ?? null,
      boardZone,
      codes: Object.fromEntries((zoneCodes ?? []).map((z) => [z.id, z.code])),
    };
  }, [opsBoardMessage, chatZone?.id, boardZone, zoneCodes]);
  const lastBoardKey = `nod.chat.board.${me}.${chat.id}`;
  const showBoard = useCallback((id: string) => {
    setBoardId(id);
    try { localStorage.setItem(lastBoardKey, id); } catch { /* private mode */ }
  }, [lastBoardKey]);
  /** The board new tasks go to: the one on screen, else the last one viewed, else the newest. */
  const currentBoard = useCallback(() => {
    const list = boardsRef.current;
    let last: string | null = null;
    try { last = localStorage.getItem(lastBoardKey); } catch { /* private mode */ }
    return list.find((b) => b.id === openIdRef.current) ?? list.find((b) => b.id === last) ?? list[list.length - 1];
  }, [lastBoardKey]);
  const newBoard = useCallback(() => {
    setOverlaySheet(
      <ProjectBuilder
        onSend={(card, summary) => { const id = sendCard(chat.id, card, summary); closeSheet(); showBoard(id); }}
        onClose={closeSheet}
      />,
    );
  }, [chat.id, closeSheet, sendCard, showBoard]);
  const openBoard = useCallback((messageId?: string) => {
    // The Ops board is its own screen: it lives in the group's thread, and opens over the Operation's page too.
    const ops = opsRef.current;
    if (ops.board && (!messageId || messageId === ops.board.id)) { setOpsBoard({ zone: ops.boardZone }); return; }
    const target = (messageId && boardsRef.current.find((b) => b.id === messageId)) || currentBoard();
    if (target) showBoard(target.id);
    else newBoard();
  }, [currentBoard, newBoard, showBoard, setOpsBoard]);

  const addTask = useCallback((fields: { title: string; assignee: string | null; due: number | null; fromMessageId?: string; zone?: string | null }) => {
    const ops = opsRef.current;
    if (ops.board) {
      const board = ops.board;
      const zone = fields.zone !== undefined ? fields.zone : ops.chatZone;
      const task = newTask({ ...fields, zone, column: board.card.columns[0]?.id ?? "todo" }, me);
      cardOp(board, { kind: "task.add", task });
      const code = zone ? ops.codes[zone] : undefined;
      flash(`Added “${task.title}” to ${code ? `${code} · ` : ""}${board.card.name}`, [{ label: "Open board", run: () => setOpsBoard({ zone: zone ?? null }) }]);
      return;
    }
    const existing = currentBoard();
    const task = newTask({ ...fields, column: existing?.card.columns[0]?.id ?? "todo" }, me);
    if (existing) {
      cardOp(existing, { kind: "task.add", task });
    } else {
      const card = newProject(chat.kind === "group" ? chat.name : "Our board");
      card.tasks[task.id] = task;
      const id = sendCard(chat.id, card, `Board: ${card.name}`);
      flash(`Added “${task.title}” to a new board`, [{ label: "Open board", run: () => showBoard(id) }]);
      return;
    }
    flash(`Added “${task.title}” to ${existing.card.name}`, [{ label: "Open board", run: () => showBoard(existing.id) }]);
  }, [cardOp, chat, currentBoard, flash, me, sendCard, showBoard, setOpsBoard]);

  const openMenu = useCallback((message: Message, pos: BubblePos, bubble: HTMLElement, armed: boolean) => {
    const host = screenRef.current?.getBoundingClientRect();
    if (!host) return;
    const r = bubble.getBoundingClientRect();
    setMenu({
      message,
      pos,
      armed,
      rect: { top: r.top - host.top, left: r.left - host.left, width: r.width, height: r.height },
      bounds: { width: host.width, height: host.height },
    });
  }, []);

  // Stable, so memoized rows skip re-rendering when nothing about them changed.
  const onReply = useCallback((m: Message) => { setReplyTo(m); setEditing(null); }, []);
  const onShowReactions = useCallback((m: Message) => setSheetFor(m.id), []);
  const onShowReceipts = useCallback(
    (m: Message) => setOverlaySheet(<ReceiptSheet message={m} chat={chat} onClose={closeSheet} />),
    [chat, closeSheet],
  );

  const isOp = !!o;
  const ui = useMemo(
    () => ({
      chat, members, openSheet: setOverlaySheet, closeSheet, toast: flash, ask, openMedia, openBoard, addTask, jumpTo,
      // Operations only.
      ...(isOp ? { openZone, openRadio, openOperation, switchChannel: switchFromLayer } : {}),
    }),
    [chat, members, closeSheet, flash, ask, openMedia, openBoard, addTask, jumpTo, isOp, openZone, openRadio, openOperation, switchFromLayer],
  );
  const firstName = identity.label.split(" ")[0];
  const presence = typing.length
    ? chat.kind === "group" ? `${userById(typing[0]).name} is typing…` : "typing…"
    : o
      // An Operation's chat says how the day is going, numbers first.
      ? `Day ${dayOf(o.op, minute)} · ${onSite(o.live)} on site · ${pendingRequests(o.live).length} ${pendingRequests(o.live).length === 1 ? "request" : "requests"}`
      : chat.kind === "group"
        ? `${chat.memberIds.length} ${chat.memberIds.length === 1 ? "member" : "members"}`
        : online ? "Active now" : "Active recently";

  /* ---- an Operation's strips, under the channel chips ---- */
  // A call that reaches me, on air now (not my own: the radio shows that).
  const onAir = o?.live.radio.tx.find((t) => t.live && t.by !== me && reaches(o.info, o.live, t, me));
  const onAirZone = onAir && o ? zoneById(o.op, o.live.presence[onAir.by]?.zoneId) : undefined;
  const onGeneral = !!o && chat.id === o.group.id;
  const unreadNormal = o && onGeneral && !opCommand ? unreadBroadcasts(o) : [];
  const stripsRef = useRef<HTMLDivElement>(null);
  // The thread makes room for whatever the strips hold.
  useEffect(() => {
    const el = stripsRef.current;
    const screen = screenRef.current;
    if (!el || !screen) return;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      screen.style.setProperty("--op-strips-h", h ? `${h + 6}px` : "0px");
    });
    ro.observe(el);
    return () => { ro.disconnect(); screen.style.removeProperty("--op-strips-h"); };
  }, [isOp, showChannels]);
  const onBroadcasts = !!o && chat.id === o.op.broadcastsChannel;

  const sheetMessage = sheetFor ? messages.find((m) => m.id === sheetFor) : undefined;
  const menuMessage = menu ? messages.find((m) => m.id === menu.message.id) ?? menu.message : null;

  return (
    <ChatUiProvider value={ui}>
    <div
      ref={screenRef}
      className={`${styles.screen} ${styles.chatScreen} ${showChannels ? styles.chatWithChannels : ""} ${isOp && showChannels ? ps.opScreen : ""} ${instant ? styles.chatInstant : ""} ${leaving ? styles.leaving : ""}`}
      data-chat-screen
      onPointerDownCapture={onEdgeDown}
      onPointerMove={onEdgeMove}
      onPointerUp={onEdgeUp}
      onPointerCancel={onEdgeUp}
      style={{ ["--chat-tone" as string]: TONES[identity.tone] }}
    >
      <StatusBar />
      <div className={styles.edgeTop} data-edge-top />

      <header className={styles.chatHeader}>
        <div className={styles.headerSide}>
          <button className={`${styles.circleBtn} ${styles.glass}`} onClick={() => onBack()} aria-label="Back to messages">
            <IconBack />
          </button>
        </div>
        {/* The name opens the contact page (an Operation's: its page); a blue dot means something here is still open. */}
        <button
          className={`${styles.titleCapsule} ${styles.titleButton}`}
          onClick={() => (isOp ? openOperation() : setContact(live.length ? "live" : "media"))}
          aria-label={`${chat.kind === "dm" ? firstName : identity.label}${live.length ? `, ${live.length} open ${live.length === 1 ? "item" : "items"}` : ""}. Open ${isOp ? "the Operation" : "details"}`}
        >
          <Avatar glyph={identity.glyph} tone={identity.tone} photo={identity.photo} size={40} online={online} />
          <span className={`${styles.tcName} ${styles.glass}`}>
            <span>{chat.kind === "dm" ? firstName : identity.label}</span>
            {live.length > 0 && <i className={styles.openDot} aria-hidden="true" />}
            <IconChevron />
          </span>
          <span className={`${styles.tcPresence} ${typing.length ? styles.isTyping : ""}`}>{quiet && !typing.length && <IconBellOff size={11} />} {presence}</span>
        </button>
        <div className={`${styles.headerSide} ${styles.headerEnd}`}>
          <button
            className={`${styles.circleBtn} ${styles.glass}`}
            aria-label={opsBoardMessage ? "Open the Ops board" : boards.length ? `Open boards (${boards.length})` : "Start a board"}
            onClick={() => openBoard()}
          >
            <IconBoard />
          </button>
          {/* An Operation talks on the radio instead. */}
          {o ? <RadioButton groupId={o.group.id} onOpen={openRadio} /> : (
            <button
              className={`${styles.circleBtn} ${styles.glass}`}
              aria-label="Call"
              onClick={() => flash("Calls are coming soon")}
            >
              <IconPhone />
            </button>
          )}
        </div>
      </header>

      {showChannels && group && (
        <ChannelBar
          group={group}
          current={chat.id}
          unread={channelUnread}
          onSwitch={switchChannel}
          onAdd={manageChannels ? () => setOverlaySheet(<ChannelSheet groupId={group.id} onClose={closeSheet} onCreated={setPendingChannel} onToast={flash} />) : undefined}
        />
      )}

      {o && showChannels && (
        // An Operation's chat: a call on air, where I am and what to read (on #general), or the zone this channel is.
        <div ref={stripsRef} className={ps.strips}>
          {onAir && (
            <button className={`${ps.stripPill} ${ps.onAir}`} onClick={openRadio} aria-label={`${userById(onAir.by).name} is on air. Open the radio`}>
              <i className={ps.liveDot} aria-hidden="true" />
              <b>{userById(onAir.by).name}{onAirZone ? ` · ${onAirZone.code}` : ""}</b>
              <span>on air</span>
              {onAir.text && <span>“{onAir.text.length > 44 ? `…${onAir.text.slice(-44)}` : onAir.text}”</span>}
            </button>
          )}
          {onGeneral && !opCommand && (myZone ? (
            <button className={ps.stripPill} onClick={() => openZone(myZone.id)}>
              <IconLocation size={14} />
              <span>You’re in <b>{myZone.code} · {myZone.name}</b></span>
              <IconChevron size={12} />
            </button>
          ) : (
            <button className={ps.stripPill} onClick={() => setOverlaySheet(<ScanSheet groupId={o.group.id} onClose={closeSheet} />)}>
              <IconQr size={14} />
              <span>Not checked in · <b>Scan</b></span>
            </button>
          ))}
          {unreadNormal.map((b) => <BroadcastBanner key={b.id} o={o} b={b} className={ps.stripBanner} />)}
          {chatZone && (() => {
            const st = staffing(o.live, chatZone);
            const tasks = openTasks(o, chatZone.id).length;
            return (
              <button className={ps.stripPill} onClick={() => openZone(chatZone.id)} aria-label={`${chatZone.code} ${chatZone.name}: ${st.n} of ${st.target} here, ${tasks} tasks. Open the zone`}>
                <Code z={chatZone} />
                <span>{chatZone.name} · <b>{st.n}/{st.target}</b> here · {tasks} {tasks === 1 ? "task" : "tasks"}</span>
                <IconChevron size={12} />
              </button>
            );
          })()}
        </div>
      )}

      <MessageList
        chatId={chat.id}
        messages={messages}
        meId={me}
        isGroupChat={chat.kind === "group"}
        intro={{
          title: showChannels && channel ? `#${channel.name}` : identity.label,
          subtitle: showChannels && channel?.topic
            ? channel.topic
            : chat.kind === "group"
              ? chat.memberIds.map((id) => (id === me ? "You" : userById(id).name)).join(", ")
              : `You and ${firstName} are connected on NOD`,
          glyph: identity.glyph,
          tone: identity.tone,
          photo: identity.photo,
        }}
        firstUnreadId={firstUnreadId}
        typingUsers={typing}
        hasEarlier={hasEarlier(chat.id)}
        onLoadEarlier={() => loadEarlier(chat.id)}
      >
        {(row) => (
          <MessageRow
            {...row}
            highlighted={highlighted === row.message.id}
            saved={saved === row.message.id}
            focused={menu?.message.id === row.message.id}
            meId={me}
            onReply={onReply}
            onMenu={openMenu}
            onToggleReaction={toggleReaction}
            onShowReactions={onShowReactions}
            onShowReceipts={onShowReceipts}
            isGroup={chat.kind === "group"}
            onRetry={retry}
            onJumpTo={jumpTo}
          />
        )}
      </MessageList>

      <div className={styles.edgeBottom} />

      <div ref={composerRef}>
        {!canWrite && gInfo && channel ? (
          <div className={styles.readOnlyBar}>
            <span className={ps.readOnlyText}><IconMegaphone size={15} />Only {roleNames(gInfo, channel.postRoles)} can post in #{channel.name}</span>
          </div>
        ) : (
        <Composer
          chatId={chat.id}
          meId={me}
          members={members}
          placeholder={onBroadcasts ? "Broadcast to everyone" : chat.kind === "group" ? `Message ${showChannels && channel ? `#${channel.name}` : identity.label}` : `Message ${firstName}`}
          replyTo={replyTo}
          editing={editing}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onSend={(body, attachments) => {
            // "/task Hero copy @Reema fri" goes to the board instead of the thread.
            const task = attachments.length ? null : parseTaskCommand(body, allPeople().filter((u) => chat.memberIds.includes(u.id)));
            if (task) { addTask(task); setReplyTo(null); return; }
            // In an Operation's #broadcasts every message is a broadcast (to everyone; + › Broadcast picks who, or Critical).
            if (o && onBroadcasts && !attachments.length && body.trim()) {
              o.act.sendBroadcast(body.trim(), "normal", { all: true });
              setReplyTo(null);
              return;
            }
            send(chat.id, body, { replyToId: replyTo?.id ?? null, attachments });
            setReplyTo(null);
          }}
          onSaveEdit={(body) => {
            if (editing) editMessage(editing, body);
            setEditing(null);
          }}
          onTyping={(isTyping) => setTyping(chat.id, isTyping)}
          onHint={flash}
          onOpenAdd={() => setOverlaySheet(
            <AddSheet onClose={closeSheet} onPick={(k) => void startFlow(k)} operation={o ? { canBroadcast: canBroadcast(o.info, me) } : undefined} />,
          )}
          onQuick={(k) => void startFlow(k)}
          incoming={incoming}
        />
        )}
      </div>

      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />

      {toast && (
        <div key={toast.id} className={`${styles.toast} ${styles.glassStrong} ${toast.actions ? styles.toastActions : ""} ${toast.leaving ? styles.toastLeaving : ""}`} role="status">
          {toast.mind ? <MindMark /> : <IconCheck />}
          <span className={styles.toastText}>{emojify(toast.text)}</span>
          {toast.actions?.map((a) => (
            <button key={a.label} className={styles.toastBtn} onClick={() => { dismissToast(); a.run(); }}>{a.label}</button>
          ))}
        </div>
      )}

      {menu && menuMessage && (
        <MessageOverlay
          message={menuMessage}
          isMine={menuMessage.authorId === me}
          pos={menu.pos}
          rect={menu.rect}
          bounds={menu.bounds}
          armed={menu.armed}
          meId={me}
          onClose={() => setMenu(null)}
          onReact={(emoji) => toggleReaction(menuMessage, emoji)}
          onReply={() => { setReplyTo(menuMessage); setEditing(null); }}
          onEdit={() => { setEditing(menuMessage); setReplyTo(null); }}
          onDelete={() => { deleteMessage(menuMessage); flash("Message deleted"); }}
          onPin={() => { togglePin(menuMessage); flash(menuMessage.pinned ? "Unpinned" : "Pinned"); }}
          onSave={() => {
            const m = menuMessage;
            const c = m.card;
            // Every card names itself the same way the Live tab does.
            const cardTitle = c && (c.type === "wheel" ? c.question : c.type === "sketch" ? c.prompt : c.type === "location" ? c.place
              : openState(m, me)?.title ?? (c.type === "payment" ? c.note : undefined));
            const title = cardTitle || stripFormatting(m.body).split(/\n/)[0].slice(0, 80) || m.attachments[0]?.name || "Saved message";
            const result = saveToMind(me, { chatId: chat.id, messageId: m.id, title });
            if (result.status === "saved") {
              // It lands in Mind the next time it's opened (and the Mind tab gives a nudge on the way back).
              land(result.blockId, "tab:mind");
              // Here, a copy of it flies down into Mind's mark on the toast, the way a saved post drops into its
              // collection, and the bubble itself catches the light once the menu has closed.
              const screen = screenRef.current;
              const row = screen?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(m.id)}"]`);
              const bubble = row?.querySelector<HTMLElement>("[data-bubble]");
              if (screen && row && bubble) fly({ el: bubble, host: screen, wrap: row.className, target: () => screen.querySelector<HTMLElement>("[data-mind-target]") });
              setTimeout(() => setSaved(m.id), 240);
              setTimeout(() => setSaved((s) => (s === m.id ? null : s)), 1700);
            }
            const where = result.collection ? `${result.collection.emoji} ${result.collection.name}` : "Mind";
            const choose = () => setOverlaySheet(
              <MoveSheet me={me} id={result.blockId} title="Save to" onClose={closeSheet} onMoved={(t) => flash(t)} />,
            );
            // Unassigned is where a save waits for a place: sorting it now is the obvious next step.
            // Short labels, so where it went is never cut off on a phone.
            const waiting = result.collection?.id === UNASSIGNED;
            flash(result.status === "saved" ? `Saved to ${where}` : `Already in ${where}`, [
              { label: waiting ? "Sort" : "Move", run: choose },
              { label: "Done", run: () => {} },
            ], { mind: true });
          }}
          onCopy={() => {
            void navigator.clipboard?.writeText(stripFormatting(menuMessage.body));
            flash("Copied");
          }}
          onTask={() => setOverlaySheet(<TaskFromMessage message={menuMessage} chat={chat} onClose={closeSheet} />)}
        />
      )}

      {sheetMessage && (
        <ReactionSheet
          message={sheetMessage}
          meId={me}
          onRemove={(emoji) => toggleReaction(sheetMessage, emoji)}
          onClose={() => setSheetFor(null)}
        />
      )}

      {contact && (
        <ContactPage
          chat={chat}
          startTab={contact}
          onClose={() => setContact(null)}
          onJump={(id) => { setContact(null); setTimeout(() => jumpTo(id), 260); }}
          onSwitchChannel={group ? switchFromLayer : undefined}
          onInvite={group ? () => setOverlaySheet(<InvitePeopleSheet groupId={group.id} onClose={closeSheet} onToast={flash} />) : undefined}
          onSettings={group ? () => setGroupSettings({ leaving: false }) : undefined}
        />
      )}
      {groupSettings && group && (
        <GroupSettings
          groupId={group.id}
          leaving={groupSettings.leaving}
          onBack={closeGroupSettings}
          onToast={flash}
          onLeft={() => { setGroupSettings(null); setContact(null); setOpPage(false); onBack(); }}
        />
      )}
      {openBoardMessage && (
        <ProjectBoard
          message={openBoardMessage}
          boards={boards}
          onSwitch={showBoard}
          onNew={newBoard}
          onClose={() => setBoardId(null)}
        />
      )}
      {/* An Operation's screens, bottom to top: its page, the Ops board, a zone, the radio. */}
      {o && opPage && (
        <OperationPage
          groupId={o.group.id}
          onClose={() => setOpPage(false)}
          onSettings={() => setGroupSettings({ leaving: false })}
          onSwitchChannel={switchFromLayer}
        />
      )}
      {showOpsBoard && opsBoardMessage && (
        <ProjectBoard
          message={opsBoardMessage}
          boards={[opsBoardMessage]}
          onSwitch={() => {}}
          onNew={() => afterLayers(newBoard)}
          onClose={() => setOpsBoard(null)}
          initialZone={opsBoard?.zone ?? null}
        />
      )}
      {o && zonePage !== null && <ZonePage groupId={o.group.id} zoneId={zonePage} onClose={() => setZonePage(null)} />}
      {o && radio && <RadioScreen groupId={o.group.id} onClose={() => setRadio(false)} />}
      {overlaySheet}
      {viewer && <MediaViewer message={viewer.message} start={viewer.index} onClose={() => setViewer(null)} />}
      {alert && <PermissionAlert kind={alert.kind} onResolve={alert.resolve} />}
    </div>
    </ChatUiProvider>
  );
}
