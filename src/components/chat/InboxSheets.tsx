"use client";

import { useState, type ReactNode } from "react";
import { chatIdentity, TONES } from "@/lib/chat/avatar";
import { type ChatList } from "@/lib/chat/chatFlags";
import { userById } from "@/lib/chat/store";
import type { Chat } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconCheck, IconHeart, IconListView, IconPlus } from "./Icons";
import Logo from "./Logo";
import { Sheet } from "./ui";
import styles from "./chat.module.css";
import inbox from "./inbox.module.css";

export interface SheetAction {
  id: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  run: () => void;
}

/** Swipe left › More: everything else you can do to a chat, under its name. */
export function MoreSheet({ title, actions, onClose }: { title: string; actions: SheetAction[]; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      {(close) => (
        <div className={inbox.sheetList}>
          {actions.map((a) => (
            <button key={a.id} className={inbox.sheetItem} data-danger={a.danger || undefined} onClick={() => close(a.run)}>
              <span className={inbox.sheetIcon}>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** A small round picture for a chat, as in the list. */
function ChatThumb({ chat, me }: { chat: Chat; me: string }) {
  const id = chatIdentity(chat, me, userById);
  if (chat.kind === "group") {
    return id.photo
      // eslint-disable-next-line @next/next/no-img-element
      ? <img className={inbox.pickAvatar} src={id.photo} alt="" />
      : <span className={inbox.pickAvatar} style={{ background: TONES[id.tone] }}><Logo size={22} /></span>;
  }
  return <Avatar glyph={id.glyph} tone={id.tone} photo={id.photo} size={36} shape="circle" />;
}

/**
 * Add one chat to Favourites or any of your lists, or start a new list with
 * it. Each tick saves straight away.
 */
export function AddToListSheet({ chatName, inFavourites, lists, chatId, onToggleFavourite, onToggleList, onNewList, onClose }: {
  chatName: string;
  chatId: string;
  inFavourites: boolean;
  lists: ChatList[];
  onToggleFavourite: (on: boolean) => void;
  onToggleList: (listId: string, on: boolean) => void;
  onNewList: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={`Add ${chatName} to…`} onClose={onClose} action={{ label: "Done", onClick: () => {} }}>
      {(close) => (
        <div className={inbox.sheetList}>
          <button className={inbox.sheetItem} role="checkbox" aria-checked={inFavourites} onClick={() => onToggleFavourite(!inFavourites)}>
            <span className={inbox.sheetIcon}><IconHeart /></span>
            Favourites
            <span className={inbox.check}><IconCheck /></span>
          </button>
          {lists.map((l) => {
            const on = l.chatIds.includes(chatId);
            return (
              <button key={l.id} className={inbox.sheetItem} role="checkbox" aria-checked={on} onClick={() => onToggleList(l.id, !on)}>
                <span className={inbox.sheetIcon}><IconListView /></span>
                {l.name}
                <span className={inbox.check}><IconCheck /></span>
              </button>
            );
          })}
          <button className={inbox.sheetItem} onClick={() => close(onNewList)}>
            <span className={inbox.sheetIcon}><IconPlus /></span>
            New list
          </button>
        </div>
      )}
    </Sheet>
  );
}

/**
 * Favourites, a new list, or an existing one: a name (lists only) and the
 * chats in it. Saved with Done; a list can be deleted from here.
 */
export function ListSheet({ mode, chats, me, onSave, onDelete, onClose }: {
  mode: { kind: "favourites"; chatIds: string[] } | { kind: "list"; list?: ChatList; chatIds: string[] };
  /** Every chat you could add, newest first. */
  chats: Chat[];
  me: string;
  onSave: (name: string, chatIds: string[]) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const isList = mode.kind === "list";
  const existing = mode.kind === "list" ? mode.list : undefined;
  const [name, setName] = useState(existing?.name ?? "");
  const [picked, setPicked] = useState<string[]>(mode.chatIds);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const title = !isList ? "Favourites" : existing ? "Edit list" : "New list";
  const ready = !isList || name.trim().length > 0;
  return (
    <Sheet
      title={title}
      onClose={onClose}
      action={{ label: isList && !existing ? "Create" : "Done", disabled: !ready, onClick: () => onSave(name.trim(), picked) }}
    >
      {(close) => (
        <>
          {isList && (
            <div className={inbox.nameRow}>
              <p className={styles.sheetLabel}>Name</p>
              <input
                className={styles.plainInput}
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 30))}
                placeholder="Work, Family, Clients…"
                aria-label="List name"
                data-autofocus
              />
            </div>
          )}
          <p className={styles.sheetLabel}>{isList ? "Chats in this list" : "Your favourites show under their own chip"}</p>
          <div className={inbox.pickList}>
            {chats.map((c) => {
              const on = picked.includes(c.id);
              return (
                <button key={c.id} className={inbox.pickRow} role="checkbox" aria-checked={on} onClick={() => toggle(c.id)}>
                  <ChatThumb chat={c} me={me} />
                  <b>{chatIdentity(c, me, userById).label}</b>
                  <span className={inbox.check}><IconCheck /></span>
                </button>
              );
            })}
          </div>
          {existing && onDelete && (
            <button className={inbox.deleteList} onClick={() => close(onDelete)}>Delete list</button>
          )}
        </>
      )}
    </Sheet>
  );
}
