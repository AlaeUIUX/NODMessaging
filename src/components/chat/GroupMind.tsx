"use client";

import { useState } from "react";
import { chatIdentity, TONES } from "@/lib/chat/avatar";
import { Emoji } from "@/lib/chat/emoji";
import { can, groupInfo } from "@/lib/chat/groups";
import {
  blankPage, childrenOf, groupMindId, makeCollection, newId, pageItems, place, rootItems, startDraft, updateMind, useMind,
  type Block, type Collection, type Mind, type Page,
} from "@/lib/chat/mind";
import { useChat, userById } from "@/lib/chat/store";
import type { Attachment, Chat, Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { DragScroll } from "./Composer";
import { IconCheck, IconEdit, IconFile, IconLink, IconPlus } from "./Icons";
import { MindEditor } from "./Mind";
import { BlockView, KIND_LABEL } from "./MindBlocks";
import { Sheet, useChatUi } from "./ui";
import styles from "./chat.module.css";
import gm from "./groupmind.module.css";

/**
 * A group's own Mind, on its page: a few shelves of things kept for everyone
 * (files, links, notes, pictures), to look through and save to your own Mind.
 * People with "Edit the group's Mind" tap Edit: the Mind opens full screen,
 * like a board, with everything your own Mind can do, and Save shares the
 * result. Kept small here on purpose: shelves and what's on them.
 *
 * Underneath, "From the chat" lists the files and links shared in this
 * channel, so nothing the Files and Links tabs used to show goes missing.
 */

export interface ChatFile { message: Message; a: Attachment }
export interface ChatLink { id: string; message: Message; url: string; domain: string; label: string }

/** The group's collection, made the first time someone keeps or edits something. */
function sharedOf(m: Mind | null) {
  return m?.collections[0] ?? null;
}
function ensureShared(m: Mind, group: Chat): { mind: Mind; col: Collection } {
  const existing = m.collections[0];
  if (existing) return { mind: m, col: existing };
  const col = makeCollection(group.name, "🗂️", TONES[group.tone ?? "graphite"]);
  col.pages = [blankPage("Shared", "📌", col.tone, "link")];
  return { mind: { ...m, collections: [col], current: col.id }, col };
}

/** A shelf's things, with whatever sits in stacks inside it. */
function shelfItems(mind: Mind, col: Collection, p: Page): Block[] {
  return [...pageItems(mind, p), ...childrenOf(col, p.id).flatMap((c) => shelfItems(mind, col, c))];
}

export default function GroupMind({ group, files, links, onJump, onToast }: {
  group: Chat;
  files: ChatFile[];
  links: ChatLink[];
  onJump: (messageId: string) => void;
  onToast: (t: string) => void;
}) {
  const { me } = useChat();
  const ui = useChatUi();
  const id = groupMindId(group.id);
  const { mind, update } = useMind(id);
  const editor = can(groupInfo(group), me, "editMind");
  const [shelf, setShelf] = useState<string>("all");
  const [sheet, setSheet] = useState<React.ReactNode>(null);
  const col = sharedOf(mind);
  const shelves = col?.pages.filter((p) => !p.parentId) ?? [];
  const loose = mind && col ? rootItems(mind, col) : [];
  const total = loose.length + shelves.reduce((n, p) => n + shelfItems(mind!, col!, p).length, 0);
  const shown = shelf === "all" ? shelves : shelves.filter((p) => p.id === shelf);
  const close = () => setSheet(null);
  const title = `${group.name}’s Mind`;
  const who = chatIdentity(group, me, userById);

  const edit = () => {
    updateMind(id, (m) => ensureShared(m, group).mind);
    startDraft(id);
    ui.openSheet(
      <MindEditor
        source={id}
        title={title}
        onClose={ui.closeSheet}
        onSaved={() => onToast(`Saved ${title} for everyone`)}
        onOpenChat={() => {}}
      />,
    );
  };

  const kept = new Set(Object.values(mind?.blocks ?? {}).flatMap((b) => [b.url, b.attachment?.id].filter(Boolean) as string[]));
  type FromChat = { key: string; kept: boolean; at: number; file?: ChatFile; link?: ChatLink };
  const fromChat: FromChat[] = [
    ...files.map((f) => ({ key: `f:${f.a.id}`, kept: kept.has(f.a.id), at: f.message.createdAt, file: f })),
    ...links.map((l) => ({ key: `l:${l.id}`, kept: kept.has(l.url), at: l.message.createdAt, link: l })),
  ].sort((a, b) => b.at - a.at).slice(0, 6);

  /** "Keep" from the chat: straight onto the first shelf (sorting it happens in Edit). */
  const keep = (block: Omit<Block, "id" | "createdAt" | "tags">) => {
    update((m0) => {
      const { mind: m, col: c } = ensureShared(m0, group);
      const page = c.pages.find((p) => !p.parentId);
      const bid = newId();
      return place({ ...m, blocks: { ...m.blocks, [bid]: { ...block, id: bid, tags: [], createdAt: Date.now() } } }, bid, { collectionId: c.id, pageId: page?.id, sectionId: page?.sections[0]?.id, root: !page });
    });
  };

  const openItem = (b: Block) => setSheet(<ItemSheet groupId={group.id} id={b.id} onClose={close} onToast={onToast} />);
  const masonry = (items: Block[]) => (
    <div className={gm.masonry}>
      {items.map((b) => (
        <div key={b.id} role="button" tabIndex={0} className={gm.item} onClick={() => openItem(b)} onKeyDown={(e) => { if (e.key === "Enter") openItem(b); }}>
          <BlockView block={b} shape="tile" />
        </div>
      ))}
    </div>
  );

  return (
    <div className={gm.wrap} style={{ ["--tone" as string]: TONES[group.tone ?? "graphite"] }}>
      {/* The group's own space: its picture and name on top, its shelves and what's on them inside. */}
      <section className={gm.card} aria-label={title}>
        <div className={gm.head}>
          <Avatar glyph={who.glyph} tone={who.tone} photo={who.photo} size={40} />
          <span className={gm.title}>
            <b>{title}</b>
            <small>{total ? `${total} ${total === 1 ? "thing" : "things"} kept for everyone` : "Nothing kept yet"}{editor ? "" : " · Admins keep it"}</small>
          </span>
          {editor && (
            <button className={gm.add} onClick={edit}>
              <IconEdit size={15} /> Edit
            </button>
          )}
        </div>

        {shelves.length > 1 && (
          <DragScroll className={gm.shelves}>
            <button className={`${gm.shelf} ${shelf === "all" ? gm.shelfOn : ""}`} onClick={() => setShelf("all")}>All <em>{total}</em></button>
            {shelves.map((p) => (
              <button key={p.id} className={`${gm.shelf} ${shelf === p.id ? gm.shelfOn : ""}`} onClick={() => setShelf(p.id)}>
                <Emoji char={p.emoji} /> {p.title} <em>{shelfItems(mind!, col!, p).length}</em>
              </button>
            ))}
          </DragScroll>
        )}

        {total === 0 ? (
          <div className={gm.empty}>
            <b>Keep things here for the whole group</b>
            <p>{editor ? "Brand files, the links everyone asks for, the docs that explain how you work. Tap Edit, or keep something from the chat below." : "When an admin keeps files, links or notes for the group, they show up here."}</p>
          </div>
        ) : (
          <>
            {shelf === "all" && loose.length > 0 && <section className={gm.section}>{masonry(loose)}</section>}
            {shown.map((p) => {
              const items = shelfItems(mind!, col!, p);
              if (!items.length && shelf === "all") return null;
              return (
                <section key={p.id} className={gm.section}>
                  {shelf === "all" && <p className={gm.sectionHead}><Emoji char={p.emoji} /> <b>{p.title}</b> <em>{items.length}</em></p>}
                  {items.length ? masonry(items) : <p className={gm.none}>Nothing on this shelf yet.</p>}
                </section>
              );
            })}
          </>
        )}
      </section>

      {fromChat.length > 0 && (
        <section className={gm.section}>
          <p className={gm.sectionHead}><b>From the chat</b> <small>files and links shared here</small></p>
          <div className={gm.chatList}>
            {fromChat.map((x) => (
              <div key={x.key} className={gm.chatRow}>
                <span className={gm.chatIcon}>{x.file ? <IconFile size={16} /> : <IconLink size={16} />}</span>
                <button className={gm.chatText} onClick={() => onJump((x.file ?? x.link)!.message.id)}>
                  <b>{x.file ? x.file.a.name : x.link!.label}</b>
                  <small>{x.file ? "File" : x.link!.domain} · Show in chat</small>
                </button>
                {editor && (
                  x.kept ? <span className={gm.kept}><IconCheck size={12} /> Kept</span> : (
                    <button
                      className={gm.keep}
                      onClick={() => {
                        if (x.file) keep({ kind: "file", title: x.file.a.name, size: x.file.a.size, attachment: x.file.a });
                        else keep({ kind: "link", title: x.link!.label, source: x.link!.domain, url: x.link!.url });
                        onToast(`Kept in ${title}`);
                      }}
                    >
                      Keep
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {sheet}
    </div>
  );
}

/** One kept thing: open it, or save a copy to your own Mind. Changing it happens in Edit. */
function ItemSheet({ groupId, id, onClose, onToast }: { groupId: string; id: string; onClose: () => void; onToast: (t: string) => void }) {
  const { me } = useChat();
  const { mind } = useMind(groupMindId(groupId));
  const mine = useMind(me);
  const [picking, setPicking] = useState(false);
  const b = mind?.blocks[id];
  if (!b) return null;
  const saveMine = (colId: string) => {
    const target = mine.mind?.collections.find((c) => c.id === colId);
    const copy = newId();
    mine.update((m) => place({ ...m, blocks: { ...m.blocks, [copy]: { ...b, id: copy, tags: [], createdAt: Date.now() } } }, copy, { collectionId: colId, root: true }));
    onToast(`Saved to ${target ? `${target.emoji} ${target.name}` : "your Mind"}`);
  };
  return (
    <Sheet title={KIND_LABEL[b.kind]} onClose={onClose}>
      {(close) => (
        <>
          <div className={styles.mindDetail}><BlockView block={b} shape="detail" /></div>
          {picking ? (
            <>
              <p className={styles.sheetLabel}>Save a copy to</p>
              <div className={styles.listGroup}>
                {(mine.mind?.collections ?? []).map((c) => (
                  <button key={c.id} className={styles.actionRow} onClick={() => close(() => saveMine(c.id))}>
                    <span className={styles.mindEmoji} style={{ background: `color-mix(in srgb, ${c.tone} 16%, transparent)` }}><Emoji char={c.emoji} /></span>
                    <span className={styles.contactText}><b>{c.name}</b><small>Your Mind</small></span>
                  </button>
                ))}
                {!mine.mind?.collections.length && <p className={styles.sheetNote}>Make a collection in Mind first.</p>}
              </div>
            </>
          ) : (
            <button className={`${styles.primaryWide} ${gm.rowBtn}`} onClick={() => setPicking(true)}><IconPlus size={16} /> Save to my Mind</button>
          )}
        </>
      )}
    </Sheet>
  );
}
