"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { chatIdentity } from "@/lib/chat/avatar";
import { stripFormatting } from "@/lib/chat/markdown";
import { USERS } from "@/lib/chat/seed";
import { useChat, userById } from "@/lib/chat/store";
import { TONES } from "@/lib/chat/avatar";
import type { Card, Chat, Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import {
  AddSheet, ChecklistBuilder, EventBuilder, LocationBuilder, PaymentBuilder, PollBuilder, ReminderBuilder, type AddKind,
} from "./CardBuilders";
import Composer from "./Composer";
import { IconBack, IconBoard, IconCheck, IconChevron, IconPhone } from "./Icons";
import MessageList from "./MessageList";
import MessageOverlay from "./MessageOverlay";
import MessageRow, { type BubblePos } from "./MessageRow";
import { ArtifactGallery, SketchBuilder, WheelBuilder } from "./Artifacts";
import { BillFlow } from "./Bill";
import ContactPage, { type ContactTab } from "./ContactPage";
import { PlanBuilder } from "./Plans";
import { ProjectBoard, ProjectBuilder, TaskFromMessage } from "./Project";
import { openItems, openState } from "@/lib/chat/open";
import { newProject, newTask, parseTaskCommand, projectOf } from "@/lib/chat/project";
import { emojify } from "@/lib/chat/emoji";
import { saveToMind } from "@/lib/chat/mind";
import { MoveSheet } from "./Mind";
import { MediaGrid, MediaViewer, ReceiptSheet } from "./MediaViewer";
import ReactionSheet from "./ReactionSheet";
import StatusBar from "./StatusBar";
import { ChatUiProvider, getPermission, PermissionAlert, setPermission, smooth, useBackLayer, type PermissionKind } from "./ui";
import styles from "./chat.module.css";

interface MenuState {
  message: Message;
  pos: BubblePos;
  rect: { top: number; left: number; width: number; height: number };
  bounds: { width: number; height: number };
  armed: boolean;
}

const EDGE = 24;

export default function ChatView({ chat, leaving, onBack }: {
  chat: Chat;
  leaving: boolean;
  /** `immediate` when a swipe-back already animated the screen away. */
  onBack: (immediate?: boolean) => void;
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
  const [toast, setToast] = useState<{ text: string; id: number; leaving?: boolean; actions?: { label: string; run: () => void }[] } | null>(null);
  const [viewer, setViewer] = useState<{ message: Message; index: number } | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [overlaySheet, setOverlaySheet] = useState<ReactNode>(null);
  const [alert, setAlert] = useState<{ kind: PermissionKind; resolve: (ok: boolean) => void } | null>(null);
  const [incoming, setIncoming] = useState<{ files: File[]; id: number } | null>(null);
  const [contact, setContact] = useState<ContactTab | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const messages = useMemo(() => state.data.messages[chat.id] ?? [], [state.data.messages, chat.id]);
  const typing = typingUsers(chat.id).filter((id) => id !== me);
  const identity = chatIdentity(chat, me, userById);
  const other = chat.kind === "dm" ? chat.memberIds.find((id) => id !== me) : undefined;
  const online = !!other && isOnline(other);
  const members = useMemo(() => USERS.filter((u) => chat.memberIds.includes(u.id) && u.id !== me), [chat, me]);
  // Anything unfinished in this chat puts a blue dot after the name.
  const live = useMemo(() => openItems(messages, me), [messages, me]);
  const board = projectOf(messages);
  useBackLayer("nodContact", contact !== null, () => setContact(null));
  useBackLayer("nodBoard", boardOpen && !!board, () => setBoardOpen(false));

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

  const flash = useCallback((text: string, actions?: { label: string; run: () => void }[]) => {
    const id = Date.now();
    setToast({ text, id, actions });
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
    // A layer over the chat (contact page, board) handles its own edge swipe.
    if (!el || menu || viewer || overlaySheet || alert || contact || boardOpen) return;
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

  // The board is found fresh each time: it's the latest project card in the thread.
  const boardRef = useRef(board);
  useEffect(() => { boardRef.current = board; }, [board]);
  const openBoard = useCallback(() => {
    if (boardRef.current) { setBoardOpen(true); return; }
    setOverlaySheet(<ProjectBuilder onSend={(card, summary) => { sendCard(chat.id, card, summary); closeSheet(); setBoardOpen(true); }} onClose={closeSheet} />);
  }, [chat.id, closeSheet, sendCard]);

  const addTask = useCallback((fields: { title: string; assignee: string | null; due: number | null; fromMessageId?: string }) => {
    const existing = boardRef.current;
    const task = newTask({ ...fields, column: existing?.card.columns[0]?.id ?? "todo" }, me);
    if (existing) {
      cardOp(existing, { kind: "task.add", task });
    } else {
      const card = newProject(chat.kind === "group" ? chat.name : "Our board");
      card.tasks[task.id] = task;
      sendCard(chat.id, card, `Board: ${card.name}`);
    }
    flash(`Added “${task.title}”`, [{ label: "Open board", run: () => setBoardOpen(true) }]);
  }, [cardOp, chat, flash, me, sendCard]);

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

  const ui = useMemo(
    () => ({ chat, members, openSheet: setOverlaySheet, closeSheet, toast: flash, ask, openMedia, openBoard, addTask, jumpTo }),
    [chat, members, closeSheet, flash, ask, openMedia, openBoard, addTask, jumpTo],
  );
  const firstName = identity.label.split(" ")[0];
  const presence = typing.length
    ? chat.kind === "group" ? `${userById(typing[0]).name} is typing…` : "typing…"
    : chat.kind === "group"
      ? `${chat.memberIds.length} members`
      : online ? "Active now" : "Active recently";

  const sheetMessage = sheetFor ? messages.find((m) => m.id === sheetFor) : undefined;
  const menuMessage = menu ? messages.find((m) => m.id === menu.message.id) ?? menu.message : null;

  return (
    <ChatUiProvider value={ui}>
    <div
      ref={screenRef}
      className={`${styles.screen} ${styles.chatScreen} ${leaving ? styles.leaving : ""}`}
      data-chat-screen
      onPointerDownCapture={onEdgeDown}
      onPointerMove={onEdgeMove}
      onPointerUp={onEdgeUp}
      onPointerCancel={onEdgeUp}
      style={{ ["--chat-tone" as string]: TONES[identity.tone] }}
    >
      <StatusBar />
      <div className={styles.edgeTop} />

      <header className={styles.chatHeader}>
        <div className={styles.headerSide}>
          <button className={`${styles.circleBtn} ${styles.glass}`} onClick={() => onBack()} aria-label="Back to messages">
            <IconBack />
          </button>
        </div>
        {/* The name opens the contact page; a blue dot means something here is still open. */}
        <button
          className={`${styles.titleCapsule} ${styles.titleButton}`}
          onClick={() => setContact(live.length ? "live" : "media")}
          aria-label={`${chat.kind === "dm" ? firstName : identity.label}${live.length ? `, ${live.length} open ${live.length === 1 ? "item" : "items"}` : ""}. Open details`}
        >
          <Avatar glyph={identity.glyph} tone={identity.tone} size={40} online={online} />
          <span className={`${styles.tcName} ${styles.glass}`}>
            <span>{chat.kind === "dm" ? firstName : identity.label}</span>
            {live.length > 0 && <i className={styles.liveDot} key={live.length} aria-hidden="true" />}
            <IconChevron />
          </span>
          <span className={`${styles.tcPresence} ${typing.length ? styles.isTyping : ""}`}>{presence}</span>
        </button>
        <div className={`${styles.headerSide} ${styles.headerEnd}`}>
          <button className={`${styles.circleBtn} ${styles.glass}`} aria-label={board ? "Open board" : "Start a board"} onClick={openBoard}>
            <IconBoard />
          </button>
          <button
            className={`${styles.circleBtn} ${styles.glass}`}
            aria-label="Call"
            onClick={() => flash("Calls are coming soon")}
          >
            <IconPhone />
          </button>
        </div>
      </header>

      <MessageList
        chatId={chat.id}
        messages={messages}
        meId={me}
        isGroupChat={chat.kind === "group"}
        intro={{
          title: identity.label,
          subtitle: chat.kind === "group"
            ? chat.memberIds.map((id) => (id === me ? "You" : userById(id).name)).join(", ")
            : `You and ${firstName} are connected on NOD`,
          glyph: identity.glyph,
          tone: identity.tone,
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
        <Composer
          chatId={chat.id}
          meId={me}
          members={members}
          placeholder={chat.kind === "group" ? `Message ${identity.label}` : `Message ${firstName}`}
          replyTo={replyTo}
          editing={editing}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onSend={(body, attachments) => {
            // "/task Hero copy @Reema fri" goes to the board instead of the thread.
            const task = attachments.length ? null : parseTaskCommand(body, USERS.filter((u) => chat.memberIds.includes(u.id)));
            if (task) { addTask(task); setReplyTo(null); return; }
            send(chat.id, body, { replyToId: replyTo?.id ?? null, attachments });
            setReplyTo(null);
          }}
          onSaveEdit={(body) => {
            if (editing) editMessage(editing, body);
            setEditing(null);
          }}
          onTyping={(isTyping) => setTyping(chat.id, isTyping)}
          onHint={flash}
          onOpenAdd={() => setOverlaySheet(<AddSheet onClose={closeSheet} onPick={(k) => void startFlow(k)} />)}
          onQuick={(k) => void startFlow(k)}
          incoming={incoming}
        />
      </div>

      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />

      {toast && (
        <div key={toast.id} className={`${styles.toast} ${styles.glassStrong} ${toast.actions ? styles.toastActions : ""} ${toast.leaving ? styles.toastLeaving : ""}`} role="status">
          <IconCheck />
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
            const cardTitle = c && (c.type === "wheel" ? c.question : c.type === "sketch" ? c.prompt
              : openState(m, me)?.title ?? (c.type === "payment" ? c.note : undefined));
            const title = cardTitle || stripFormatting(m.body).split(/\n/)[0].slice(0, 80) || m.attachments[0]?.name || "Saved message";
            const photos = m.attachments.some((x) => x.kind === "image");
            const result = saveToMind(me, {
              chatId: chat.id, messageId: m.id, title, chatName: chat.name,
              text: [
                m.body, c && "question" in c ? c.question : "", c && "title" in c ? c.title : "",
                ...(c?.type === "checklist" ? c.items.map((i) => i.label) : []),
                ...(c?.type === "plan" ? c.days.flatMap((d) => d.stops.map((st) => st.title)) : []),
                ...(c?.type === "bill" ? [c.merchant, ...c.items.map((i) => i.name)] : []),
                ...(c?.type === "project" ? [c.name, ...Object.values(c.tasks).filter((t) => !t.deleted).map((t) => t.title)] : []),
              ].filter(Boolean).join(" "),
              kind: c ? "card" : photos ? "photos" : m.attachments.length ? "file" : "text",
              cardType: c?.type,
            });
            if (result.status === "no-collection") {
              flash("Make a collection in Mind first");
              return;
            }
            const where = result.collection ? `${result.collection.emoji} ${result.collection.name}` : "Mind";
            const editLocation = () => setOverlaySheet(
              <MoveSheet me={me} id={result.blockId!} title="Save to" onClose={closeSheet} onMoved={(t) => flash(t)} />,
            );
            flash(result.status === "saved" ? `Saved to ${where}` : `Already in ${where}`, [
              { label: "Edit location", run: editLocation },
              { label: "Done", run: () => {} },
            ]);
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
        />
      )}
      {boardOpen && board && <ProjectBoard message={board} onClose={() => setBoardOpen(false)} />}
      {overlaySheet}
      {viewer && <MediaViewer message={viewer.message} start={viewer.index} onClose={() => setViewer(null)} />}
      {alert && <PermissionAlert kind={alert.kind} onResolve={alert.resolve} />}
    </div>
    </ChatUiProvider>
  );
}
