"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { chatIdentity } from "@/lib/chat/avatar";
import type { BoardMessage } from "@/lib/chat/project";
import { USERS } from "@/lib/chat/seed";
import { useChat, userById } from "@/lib/chat/store";
import type { Chat, Message } from "@/lib/chat/types";
import { KIND_LABEL } from "./Analytics";
import Avatar from "./Avatar";
import CardView from "./CardView";
import { IconBack, IconCheck } from "./Icons";
import { MediaGrid, MediaViewer } from "./MediaViewer";
import { ProjectBoard } from "./Project";
import StatusBar from "./StatusBar";
import { ChatUiProvider, getPermission, PermissionAlert, setPermission, useDialog, type ChatUi, type PermissionKind } from "./ui";
import styles from "./chat.module.css";
import s from "./widget.module.css";

/**
 * Analytics v2: a card's own page, away from the thread. Reuses the exact
 * interactive card components (CardView, or ProjectBoard for a board) behind
 * a small stand-in for ChatView's ChatUiProvider — the same contract, scoped
 * to one message instead of a whole open chat.
 *
 * `leaving` is owned by the parent (exactly like ChatView's), not tracked
 * here — so the Inbox's own reveal animation starts the instant Back is
 * pressed instead of waiting for this page to finish closing first.
 */
export default function WidgetPage({ chat, message, leaving, onClose, onCloseInstant, onOpenChat }: {
  chat: Chat;
  message: Message;
  /** True while the close animation plays; the parent unmounts this page once it ends. */
  leaving: boolean;
  /** Starts the (parent-timed) close animation. */
  onClose: () => void;
  /** For the board branch only: ProjectBoard times its own close animation, so this skips straight to unmounting. */
  onCloseInstant: () => void;
  onOpenChat: (chat: Chat, messageId?: string) => void;
}) {
  const { me } = useChat();
  const rootRef = useRef<HTMLDivElement>(null);
  const [overlaySheet, setOverlaySheet] = useState<ReactNode>(null);
  const [alert, setAlert] = useState<{ kind: PermissionKind; resolve: (ok: boolean) => void } | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number; leaving?: boolean } | null>(null);
  const [viewer, setViewer] = useState<{ message: Message; index: number } | null>(null);

  // A no-op while the board branch renders below (rootRef is never attached to anything then).
  useDialog(rootRef, onClose);

  const closeSheet = useCallback(() => setOverlaySheet(null), []);
  const flash = useCallback((text: string) => {
    const id = Date.now();
    setToast({ text, id });
    setTimeout(() => setToast((t) => (t?.id === id ? { ...t, leaving: true } : t)), 1800);
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2020);
  }, []);
  const ask = useCallback((kind: PermissionKind) => new Promise<boolean>((resolve) => {
    const state = getPermission(kind);
    if (state === "granted") { resolve(true); return; }
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
  const openMedia = useCallback((msg: Message, index: number | "all") => {
    if (index === "all") setOverlaySheet(<MediaGrid message={msg} onClose={closeSheet} onPick={(i) => setViewer({ message: msg, index: i })} />);
    else setViewer({ message: msg, index });
  }, [closeSheet]);
  /** There's no thread here to jump within — "show in chat" means leaving this page for the real one. */
  const jumpToChat = useCallback((messageId: string) => onOpenChat(chat, messageId), [chat, onOpenChat]);

  const members = USERS.filter((u) => chat.memberIds.includes(u.id) && u.id !== me);
  const ui: ChatUi = {
    chat, members, openSheet: setOverlaySheet, closeSheet, toast: flash, ask, openMedia,
    openBoard: () => jumpToChat(message.id),
    addTask: () => jumpToChat(message.id),
    jumpTo: jumpToChat,
  };

  const card = message.card!;
  const identity = chatIdentity(chat, me, userById);
  const author = userById(message.authorId);

  const overlays = (
    <>
      {overlaySheet}
      {viewer && <MediaViewer message={viewer.message} start={viewer.index} onClose={() => setViewer(null)} />}
      {alert && <PermissionAlert kind={alert.kind} onResolve={alert.resolve} />}
    </>
  );

  // A board is already a full page of its own — let it be the whole page,
  // with its own back button, history entry and close animation.
  if (card.type === "project") {
    return (
      <ChatUiProvider value={ui}>
        <ProjectBoard
          message={message as BoardMessage}
          boards={[message as BoardMessage]}
          onSwitch={() => {}}
          onNew={() => flash("Start a new board from the chat")}
          onClose={onCloseInstant}
        />
        {overlays}
      </ChatUiProvider>
    );
  }

  return (
    <ChatUiProvider value={ui}>
      <div ref={rootRef} className={`${s.page} ${leaving ? s.leaving : ""}`} role="dialog" aria-modal="true" aria-label={`${KIND_LABEL[card.type]}: ${identity.label}`} tabIndex={-1}>
        <StatusBar />
        <header className={s.head}>
          <button className={`${styles.circleBtn} ${styles.glass}`} onClick={onClose} aria-label="Back to Analytics">
            <IconBack />
          </button>
          <div className={s.headTitle}>
            <Avatar glyph={identity.glyph} tone={identity.tone} size={32} shape="circle" />
            <div className={s.headText}>
              <b>{identity.label}</b>
              <span>{KIND_LABEL[card.type]} · by {message.authorId === me ? "You" : author.name}</span>
            </div>
          </div>
          <span className={s.headSpacer} aria-hidden="true" />
        </header>

        {/* A card's own page has no bubble to stay narrow for — let it fill the width. */}
        <div className={s.body} style={{ ["--bill-width" as string]: "100%" }}>
          <CardView message={message} interactive />
        </div>

        {toast && (
          <div key={toast.id} className={`${styles.toast} ${styles.glassStrong} ${toast.leaving ? styles.toastLeaving : ""}`} role="status">
            <IconCheck />
            <span className={styles.toastText}>{toast.text}</span>
          </div>
        )}
        {overlays}
      </div>
    </ChatUiProvider>
  );
}
