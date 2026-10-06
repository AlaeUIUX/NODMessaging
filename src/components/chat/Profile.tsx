"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chatIdentity, initials } from "@/lib/chat/avatar";
import { Emoji } from "@/lib/chat/emoji";
import {
  collectionItemCount, mindOf, toggleSaveExploreItem, useMindVersion, type Block, type Collection,
} from "@/lib/chat/mind";
import { readFavouriteChats, readFavouriteMessages, toggleFavouriteChat } from "@/lib/chat/favourites";
import { stripFormatting } from "@/lib/chat/markdown";
import { useChat, userById } from "@/lib/chat/store";
import type { Chat, Message } from "@/lib/chat/types";
import { cardIcon, KIND_LABEL, Row } from "./Analytics";
import Avatar from "./Avatar";
import { CollectionViewSheet } from "./Explore";
import { IconBack, IconHeart } from "./Icons";
import { BlockView } from "./MindBlocks";
import StatusBar from "./StatusBar";
import { relative, useDialog, useNow } from "./ui";
import styles from "./chat.module.css";
import s from "./activity.module.css";
import w from "./widget.module.css";
import p from "./profile.module.css";

function findMessage(list: Message[] | undefined, archive: Message[] | undefined, id: string): Message | null {
  return [...(archive ?? []), ...(list ?? [])].find((m) => m.id === id) ?? null;
}

export default function ProfilePage({ leaving, onClose, onOpenChat }: {
  leaving: boolean;
  onClose: () => void;
  onOpenChat: (chat: Chat, messageId?: string) => void;
}) {
  const { state, me } = useChat();
  const rootRef = useRef<HTMLDivElement>(null);
  const meUser = userById(me);
  const now = useNow(60_000);
  const mindVersion = useMindVersion();

  const [favChats, setFavChats] = useState(() => readFavouriteChats(me));
  const [favMessages, setFavMessages] = useState(() => readFavouriteMessages(me));
  const [openCollection, setOpenCollection] = useState<Collection | null>(null);

  useDialog(rootRef, onClose);

  useEffect(() => {
    const reread = () => { setFavChats(readFavouriteChats(me)); setFavMessages(readFavouriteMessages(me)); };
    window.addEventListener("nod:favourites", reread);
    return () => window.removeEventListener("nod:favourites", reread);
  }, [me]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- mindVersion bumps on every Mind write; mindOf itself reads mutable module state
  const mind = useMemo(() => mindOf(me), [me, mindVersion]);
  const savedCollections = useMemo(() => mind.collections.filter((c) => c.savedFrom), [mind]);
  const savedBlocks = useMemo(() => Object.values(mind.blocks).filter((b) => b.savedFrom), [mind]);

  const favChatList = useMemo(
    () => [...favChats].map((id) => state.data.chats.find((c) => c.id === id)).filter((c): c is Chat => !!c),
    [favChats, state.data.chats],
  );
  const favMessageList = useMemo(() => {
    const out: { key: string; chat: Chat; message: Message }[] = [];
    for (const key of favMessages) {
      const [chatId, messageId] = key.split(":");
      const chat = state.data.chats.find((c) => c.id === chatId);
      const message = chat ? findMessage(state.data.messages[chatId], state.data.archive[chatId], messageId) : null;
      if (chat && message) out.push({ key, chat, message });
    }
    return out.sort((a, b) => b.message.createdAt - a.message.createdAt);
  }, [favMessages, state.data.chats, state.data.messages, state.data.archive]);

  const unsaveBlock = (b: Block) => {
    if (!b.savedFrom) return;
    toggleSaveExploreItem(me, b.savedFrom.userId, b.savedFrom.blockId);
  };

  const nothingSaved = savedCollections.length === 0 && savedBlocks.length === 0;

  return (
    <div ref={rootRef} className={`${w.page} ${leaving ? w.leaving : ""}`} role="dialog" aria-modal="true" aria-label="Your profile" tabIndex={-1}>
      <StatusBar />
      <header className={w.head}>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={onClose} aria-label="Back">
          <IconBack />
        </button>
        <div className={w.headTitle}>
          <div className={w.headText}><b>Your profile</b></div>
        </div>
        <span className={w.headSpacer} aria-hidden="true" />
      </header>

      <div className={w.body}>
        <div className={p.header}>
          <Avatar glyph={initials(meUser.fullName)} tone={meUser.tone} size={64} shape="circle" />
          <div className={p.headerText}>
            <b>{meUser.fullName}</b>
            <small>{[meUser.city, meUser.language].filter(Boolean).join(" · ") || "NOD"}</small>
          </div>
        </div>

        <section className={`${s.panel} ${s.bare}`}>
          <div className={s.ph}><h2>Saved from Explore</h2></div>
          {nothingSaved ? (
            <p className={s.empty}>Nothing saved yet. Items and folders you save from Explore show up here.</p>
          ) : (
            <>
              {savedCollections.length > 0 && (
                <div className={s.list}>
                  {savedCollections.map((c) => (
                    <Row
                      key={c.id}
                      icon={<Emoji char={c.emoji} />}
                      title={c.name}
                      detail={`${collectionItemCount(mind, c)} item${collectionItemCount(mind, c) === 1 ? "" : "s"}`}
                      onOpen={() => setOpenCollection(c)}
                    />
                  ))}
                </div>
              )}
              {savedBlocks.length > 0 && (
                <div className={styles.mindRows} style={{ marginTop: savedCollections.length > 0 ? 12 : 0 }}>
                  {savedBlocks.map((b) => (
                    <div key={b.id} className={styles.mindInboxItem}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <BlockView block={b} shape={b.kind === "chat" ? "tile" : "row"} />
                      </div>
                      <button className={styles.mindSort} onClick={() => unsaveBlock(b)}>Unsave</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className={`${s.panel} ${s.bare}`}>
          <div className={s.ph}><h2>Favourite chats</h2></div>
          {favChatList.length === 0 ? (
            <p className={s.empty}>Swipe a chat left and tap the heart to favourite it.</p>
          ) : (
            <div>
              {favChatList.map((chat) => {
                const identity = chatIdentity(chat, me, userById);
                const messages = state.data.messages[chat.id] ?? [];
                const last = messages[messages.length - 1];
                return (
                  <div key={chat.id} className={p.chatRow}>
                    <button className={p.chatTap} onClick={() => onOpenChat(chat)}>
                      <Avatar glyph={identity.glyph} tone={identity.tone} size={40} shape="circle" />
                      <span className={p.chatText}>
                        <b>{identity.label}</b>
                        <small>{last ? stripFormatting(last.body) || "No messages yet" : "No messages yet"}</small>
                      </span>
                    </button>
                    <button className={p.unfav} aria-label="Unfavourite" onClick={() => setFavChats(toggleFavouriteChat(me, chat.id))}>
                      <IconHeart size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className={`${s.panel} ${s.bare}`}>
          <div className={s.ph}><h2>Favourite messages</h2></div>
          {favMessageList.length === 0 ? (
            <p className={s.empty}>Hold a message and choose Favourite to keep it here.</p>
          ) : (
            <div className={s.list}>
              {favMessageList.map(({ key, chat, message }) => {
                const identity = chatIdentity(chat, me, userById);
                const title = (message.card ? KIND_LABEL[message.card.type] : null)
                  || stripFormatting(message.body).split("\n")[0].slice(0, 80)
                  || message.attachments[0]?.name
                  || "Message";
                return (
                  <Row
                    key={key}
                    icon={message.card ? cardIcon(message.card) : undefined}
                    title={title}
                    detail={`${identity.label} · ${relative(now - message.createdAt)} ago`}
                    onOpen={() => onOpenChat(chat, message.id)}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>

      {openCollection && (
        <CollectionViewSheet
          userId={me}
          collection={openCollection}
          me={me}
          following={false}
          onClose={() => setOpenCollection(null)}
          onToggleFollow={() => {}}
          onCopy={() => {}}
        />
      )}
    </div>
  );
}
