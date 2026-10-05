"use client";

import { useCallback, useState } from "react";
import { initials, TONES } from "@/lib/chat/avatar";
import { Emoji, emojify } from "@/lib/chat/emoji";
import {
  addCollection, addedFrom, asBlock, friendActivity, publicCollection, publicItem, rankCollections, rankGroups, rankItems,
  saveItem, STRANGERS, suggestCollection, TOPIC_LABEL, type Activity, type PublicCollection, type PublicItem, type Ranked, type Topic,
} from "@/lib/chat/explore";
import { addMember, groupInfo, landingChannel } from "@/lib/chat/groups";
import { makeCollection, useMind } from "@/lib/chat/mind";
import { useChat, userById } from "@/lib/chat/store";
import type { AvatarTone, Chat } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { DragScroll } from "./Composer";
import { GroupBanner } from "./Groups";
import { IconBack, IconCheck, IconClose, IconPlus, IconSparkles, IconUserGroup } from "./Icons";
import Logo from "./Logo";
import { BlockView, KIND_LABEL } from "./MindBlocks";
import { Sheet, useNow } from "./ui";
import styles from "./chat.module.css";
import x from "./explore.module.css";

/**
 * Explore: public things on NOD, ranked for you (see lib/chat/explore.ts).
 * A top pick, what friends have been saving and joining, groups that fit,
 * collections to add, and single things for the collections you already
 * keep. Anything here can go into Mind: one item with +, or a whole
 * collection with Add to Mind. Groups join straight away.
 */

type Filter = "foryou" | "collections" | "groups" | "friends";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "foryou", label: "For you" },
  { id: "collections", label: "Collections" },
  { id: "groups", label: "Groups" },
  { id: "friends", label: "Friends" },
];

/** Whoever made something: someone in the demo, or a stranger on NOD. */
function creator(id: string): { name: string; tone: AvatarTone; photo?: string; username?: string } {
  const s = STRANGERS.find((p) => p.id === id);
  if (s) return { name: s.name, tone: s.tone, username: s.username };
  const u = userById(id);
  return { name: u.fullName, tone: u.tone, photo: u.photo, username: u.username };
}
const short = (id: string) => creator(id).name.split(" ")[0];
const KIND_ICON: Partial<Record<PublicItem["kind"], string>> = { link: "🔗", note: "📝", flashcard: "🃏", todo: "✅", book: "📚", video: "🎬", quote: "💬" };
const count = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n));
function ago(ts: number, now: number) {
  const h = Math.max(1, Math.round((now - ts) / 3_600_000));
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

export default function ExploreTab({ onOpenChat, onSettings }: { onOpenChat: (chat: Chat) => void; onSettings: () => void }) {
  const { state, me, updateGroup } = useChat();
  const { mind, update } = useMind(me);
  const meUser = userById(me);
  const now = useNow(60_000);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("foryou");
  const [sheet, setSheet] = useState<React.ReactNode>(null);
  const [page, setPage] = useState<{ id: string; leaving: boolean } | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number; leaving?: boolean; action?: { label: string; run: () => void } } | null>(null);
  const chats = state.data.chats;
  // Picks are worked out once per visit, so what you save stays on screen (with a tick) instead of vanishing.
  const [items] = useState(() => rankItems(mind, chats, me).slice(0, 10));
  const [saved, setSaved] = useState<Record<string, string>>({});

  const flash = useCallback((text: string, action?: { label: string; run: () => void }) => {
    const id = Date.now();
    setToast({ text, id, action });
    const stay = action ? 3600 : 2000;
    setTimeout(() => setToast((t) => (t?.id === id ? { ...t, leaving: true } : t)), stay);
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), stay + 220);
  }, [setToast]);
  const closeSheet = () => setSheet(null);
  const openPage = (id: string) => setPage({ id, leaving: false });
  const closePage = () => {
    setPage((p) => (p ? { ...p, leaving: true } : p));
    setTimeout(() => setPage((p) => (p?.leaving ? null : p)), 220);
  };

  const collections = rankCollections(mind, chats, me, short);
  // Groups and the top pick are also held for the visit: joining or adding marks them done instead of swapping them out.
  const [groupPicks] = useState(() => rankGroups(mind, chats, me, short).map((r) => ({ id: r.value.id, score: r.score, reason: r.reason })));
  const groups: Ranked<Chat>[] = groupPicks
    .map((p) => ({ ...p, value: chats.find((c) => c.id === p.id) }))
    .filter((p): p is Ranked<Chat> & { id: string } => !!p.value && !p.value.removedAt);
  const [heroId] = useState(() => (collections.find((r) => !addedFrom(mind, r.value.id)) ?? collections[0])?.value.id);
  const activity = friendActivity(chats, me);

  /* ---- actions ---- */
  const saveTo = (item: PublicItem, colId: string) => {
    const col = mind?.collections.find((c) => c.id === colId);
    update((m) => saveItem(m, item, colId).mind);
    setSaved((s) => ({ ...s, [item.id]: colId }));
    if (col) flash(`Saved to ${col.emoji} ${col.name}`);
  };
  const askSave = (item: PublicItem, from: PublicCollection) => setSheet(
    <SaveSheet item={item} from={from} onClose={closeSheet} onPick={(colId) => saveTo(item, colId)} onNew={() => {
      // No collection yet: start one named after where it came from.
      const col = makeCollection(from.name, from.emoji, from.tone);
      update((m) => saveItem({ ...m, collections: [...m.collections, col] }, item, col.id).mind);
      setSaved((s) => ({ ...s, [item.id]: col.id }));
      flash(`Saved to ${from.emoji} ${from.name}`);
    }} />,
  );
  const add = (pc: PublicCollection) => {
    if (addedFrom(mind, pc.id)) return;
    update((m) => addCollection(m, pc).mind);
    flash(`${pc.emoji} ${pc.name} is in your Mind`);
  };
  const join = (group: Chat) => {
    updateGroup(group.id, (g) => addMember(g, me));
    flash(`You joined ${group.name}`, { label: "Open", run: () => onOpenChat(landingChannel(chats, group, me)) });
  };
  const showGroup = (group: Chat, reason?: string) => setSheet(
    <GroupSheet groupId={group.id} reason={reason} onClose={closeSheet} onJoin={join} onOpen={(g) => onOpenChat(landingChannel(chats, g, me))} />,
  );
  const showItem = (item: PublicItem, from: PublicCollection) => setSheet(
    <ItemSheet item={item} from={from} saved={saved[item.id]} onClose={closeSheet} onSave={() => askSave(item, from)} onOpenCollection={() => { closeSheet(); openPage(from.id); }} />,
  );

  /* ---- search ---- */
  const q = query.trim().toLowerCase();
  const found = q ? {
    collections: collections.filter((r) => [r.value.name, r.value.description, creator(r.value.by).name, ...r.value.topics].some((s) => s.toLowerCase().includes(q))),
    groups: groups.filter((r) => [r.value.name, groupInfo(r.value).description, ...(groupInfo(r.value).discover?.topics ?? [])].some((s) => s.toLowerCase().includes(q))),
    items: rankItems(mind, chats, me).filter((r) => r.value.item.title.toLowerCase().includes(q)).slice(0, 8),
  } : null;

  const tile = (r: Ranked<{ item: PublicItem; collection: PublicCollection }>) => (
    <ItemTile key={r.value.item.id} item={r.value.item} reason={r.reason} saved={!!saved[r.value.item.id]} onOpen={() => showItem(r.value.item, r.value.collection)} onSave={() => askSave(r.value.item, r.value.collection)} />
  );
  const colCards = (list: Ranked<PublicCollection>[]) => (
    <div className={x.colGrid}>
      {list.map((r, i) => <CollectionCard key={r.value.id} r={r} i={i} added={!!addedFrom(mind, r.value.id)} onOpen={() => openPage(r.value.id)} onAdd={() => add(r.value)} />)}
    </div>
  );
  const groupCards = (list: Ranked<Chat>[]) => (
    <DragScroll className={x.rail}>
      {list.map((r) => <GroupCard key={r.value.id} r={r} joined={r.value.memberIds.includes(me)} onOpen={() => showGroup(r.value, r.reason)} onJoin={() => join(r.value)} />)}
    </DragScroll>
  );
  const feed = (list: Activity[]) => (
    <div className={x.feed}>
      {list.map((a) => <ActivityRow key={a.id} a={a} now={now} saved={saved} chats={chats} onItem={showItem} onSave={askSave} onCollection={openPage} onGroup={(g) => showGroup(g)} />)}
    </div>
  );

  const hero = collections.find((r) => r.value.id === heroId);

  return (
    <>
      <header className={styles.profile}>
        <div className={styles.profileRow}>
          <div className={styles.profileId}>
            <button className={`${styles.profileAvatar} ${styles.avatarBtn}`} onClick={onSettings} aria-label="Settings">
              <Avatar glyph={initials(meUser.fullName)} tone={meUser.tone} photo={meUser.photo} size={40} shape="circle" />
              <span className={styles.orgBadge}><Logo size={12} /></span>
            </button>
            <div className={styles.profileText}>
              <b>Explore</b>
              <span>Picked for you, from what you keep</span>
            </div>
          </div>
        </div>
        <label className={styles.searchBar}>
          <span className={styles.maskIcon} style={{ width: 16, height: 16, ["--src" as string]: "url(/nod/search.svg)" }} aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search collections, groups and people" />
          {query && <button className={styles.mindClear} onClick={() => setQuery("")} aria-label="Clear search"><IconClose size={14} /></button>}
        </label>
      </header>

      <div className={styles.inboxBody}>
        <div className={styles.inboxScroll}>
          {!q && (
            <div className={styles.chips} role="tablist">
              {FILTERS.map((f) => (
                <button key={f.id} role="tab" aria-selected={filter === f.id} className={`${styles.chip} ${filter === f.id ? styles.chipOn : ""}`} onClick={() => setFilter(f.id)}>{f.label}</button>
              ))}
            </div>
          )}

          {found ? (
            <div className={x.stack}>
              {found.collections.length > 0 && <Section title="Collections">{colCards(found.collections)}</Section>}
              {found.groups.length > 0 && <Section title="Groups">{groupCards(found.groups)}</Section>}
              {found.items.length > 0 && <Section title="Things to save"><div className={x.masonry}>{found.items.map(tile)}</div></Section>}
              {!found.collections.length && !found.groups.length && !found.items.length && <p className={styles.emptyInbox}>Nothing on Explore matches “{query}”.</p>}
            </div>
          ) : filter === "foryou" ? (
            <div className={x.stack} key="foryou">
              {hero && <Hero r={hero} added={!!addedFrom(mind, hero.value.id)} onOpen={() => openPage(hero.value.id)} onAdd={() => add(hero.value)} />}
              {activity.length > 0 && <Section title="Your friends lately" more={activity.length > 3 ? () => setFilter("friends") : undefined}>{feed(activity.slice(0, 3))}</Section>}
              {groups.length > 0 && <Section title="Groups for you" more={() => setFilter("groups")}>{groupCards(groups.slice(0, 6))}</Section>}
              <Section title="Collections to add" more={() => setFilter("collections")}>{colCards(collections.filter((r) => r !== hero).slice(0, 4))}</Section>
              {items.length > 0 && <Section title="For your collections" note="Single things, saved with +"><div className={x.masonry}>{items.map(tile)}</div></Section>}
            </div>
          ) : filter === "collections" ? (
            <div className={x.stack} key="collections">{colCards(collections)}</div>
          ) : filter === "groups" ? (
            <div className={x.stack} key="groups">
              <div className={x.groupList}>
                {groups.map((r) => <GroupRow key={r.value.id} r={r} joined={r.value.memberIds.includes(me)} onOpen={() => showGroup(r.value, r.reason)} onJoin={() => join(r.value)} />)}
                {!groups.length && <p className={styles.emptyInbox}>You’re in every group on Explore.</p>}
              </div>
            </div>
          ) : (
            <div className={x.stack} key="friends">
              {activity.length ? feed(activity) : <p className={styles.emptyInbox}>When people you chat with save or join something public, it shows here.</p>}
            </div>
          )}
        </div>
      </div>

      {page && (() => {
        const pc = publicCollection(page.id);
        return pc ? (
          <CollectionPage pc={pc} leaving={page.leaving} added={!!addedFrom(mind, pc.id)} saved={saved} onBack={closePage} onAdd={() => add(pc)} onItem={(item) => showItem(item, pc)} onSave={(item) => askSave(item, pc)} />
        ) : null;
      })()}
      {sheet}
      {toast && (
        <div key={toast.id} className={`${styles.toast} ${styles.glassStrong} ${styles.mindToast} ${toast.action ? styles.toastActions : ""} ${toast.leaving ? styles.toastLeaving : ""}`} role="status">
          <span className={styles.toastText}>{emojify(toast.text)}</span>
          {toast.action && <button className={styles.toastBtn} onClick={() => { setToast(null); toast.action!.run(); }}>{toast.action.label}</button>}
        </div>
      )}
    </>
  );
}

/* ===========================================================================
   Pieces
   =========================================================================== */

function Section({ title, note, more, children }: { title: string; note?: string; more?: () => void; children: React.ReactNode }) {
  return (
    <section className={x.section}>
      <div className={x.sectionHead}>
        <span><b>{title}</b>{note && <small>{note}</small>}</span>
        {more && <button className={x.more} onClick={more}>See all</button>}
      </div>
      {children}
    </section>
  );
}

function Byline({ id, extra }: { id: string; extra?: string }) {
  const c = creator(id);
  return (
    <span className={x.byline}>
      <Avatar glyph={initials(c.name)} tone={c.tone} photo={c.photo} size={18} shape="circle" />
      <span>{c.name}{extra ? ` · ${extra}` : ""}</span>
    </span>
  );
}

function Hero({ r, added, onOpen, onAdd }: { r: Ranked<PublicCollection>; added: boolean; onOpen: () => void; onAdd: () => void }) {
  const pc = r.value;
  const total = pc.stacks.reduce((n, s) => n + s.items.length, 0);
  return (
    <article className={x.hero} style={{ ["--tone" as string]: pc.tone }}>
      <button className={x.heroCover} style={{ backgroundImage: `url(${pc.cover})` }} onClick={onOpen} aria-label={`Open ${pc.name}`}>
        <span className={x.reason}><IconSparkles size={12} /> {emojify(r.reason)}</span>
      </button>
      <div className={x.heroBody}>
        <span className={x.heroEmoji}><Emoji char={pc.emoji} /></span>
        <b className={x.heroName}>{pc.name}</b>
        <p className={x.heroDesc}>{pc.description}</p>
        <Byline id={pc.by} extra={`${count(pc.saves)} saves · ${total} things`} />
        <div className={x.heroActions}>
          <button className={`${styles.primaryWide} ${x.btn}`} onClick={onAdd} disabled={added}>
            {added ? <><IconCheck size={15} /> In your Mind</> : <><IconPlus size={15} /> Add to Mind</>}
          </button>
          <button className={`${styles.secondaryWide} ${x.btn}`} onClick={onOpen}>Look inside</button>
        </div>
      </div>
    </article>
  );
}

function CollectionCard({ r, i, added, onOpen, onAdd }: { r: Ranked<PublicCollection>; i: number; added: boolean; onOpen: () => void; onAdd: () => void }) {
  const pc = r.value;
  return (
    <div className={`${x.colCard} ${styles.rowEnter}`} style={{ ["--tone" as string]: pc.tone, ["--i" as string]: i }}>
      <button className={x.colMain} onClick={onOpen}>
        <span className={x.colCover} style={{ backgroundImage: `url(${pc.cover})` }}>
          <span className={x.colEmoji}><Emoji char={pc.emoji} /></span>
        </span>
        <b className={x.colName}>{pc.name}</b>
        <Byline id={pc.by} extra={count(pc.saves)} />
        <small className={x.colReason}>{emojify(r.reason)}</small>
      </button>
      <button className={`${x.plus} ${added ? x.plusDone : ""}`} onClick={onAdd} disabled={added} aria-label={added ? "In your Mind" : `Add ${pc.name} to Mind`}>
        {added ? <IconCheck size={14} /> : <IconPlus size={15} />}
      </button>
    </div>
  );
}

function ItemTile({ item, reason, saved, onOpen, onSave }: { item: PublicItem; reason?: string; saved: boolean; onOpen: () => void; onSave: () => void }) {
  return (
    <div className={x.item}>
      <div role="button" tabIndex={0} className={x.itemMain} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
        <BlockView block={asBlock(item)} shape="tile" />
      </div>
      <button className={`${x.plus} ${x.itemPlus} ${saved ? x.plusDone : ""}`} onClick={onSave} disabled={saved} aria-label={saved ? "Saved" : `Save ${item.title} to Mind`}>
        {saved ? <IconCheck size={14} /> : <IconPlus size={15} />}
      </button>
      {reason && <small className={x.itemReason}>{emojify(reason)}</small>}
    </div>
  );
}

function GroupCard({ r, joined, onOpen, onJoin }: { r: Ranked<Chat>; joined: boolean; onOpen: () => void; onJoin: () => void }) {
  const g = r.value;
  const info = groupInfo(g);
  const tone = g.tone ?? "graphite";
  return (
    <div className={x.groupCard} style={{ ["--tone" as string]: TONES[tone] }}>
      <button className={x.groupMain} onClick={onOpen}>
        <span className={x.groupCover} style={info.cover ? { backgroundImage: `url(${info.cover})` } : undefined} />
        <span className={x.groupAvatar}><Avatar glyph={initials(g.name)} tone={tone} photo={g.photo} size={44} /></span>
        <b className={x.groupName}>{g.name}</b>
        <small className={x.groupMeta}>{count(info.discover?.members ?? g.memberIds.length)} members</small>
        <small className={x.groupReason}>{r.reason}</small>
      </button>
      <button className={`${styles.secondaryWide} ${x.join} ${joined ? x.joined : ""}`} onClick={onJoin} disabled={joined}>
        {joined ? <><IconCheck size={14} /> Joined</> : "Join"}
      </button>
    </div>
  );
}

function GroupRow({ r, joined, onOpen, onJoin }: { r: Ranked<Chat>; joined: boolean; onOpen: () => void; onJoin: () => void }) {
  const g = r.value;
  const info = groupInfo(g);
  return (
    <div className={x.groupRow} style={{ ["--tone" as string]: TONES[g.tone ?? "graphite"] }}>
      <button className={x.groupRowMain} onClick={onOpen}>
        <span className={x.groupThumb} style={info.cover ? { backgroundImage: `url(${info.cover})` } : undefined} />
        <span className={x.groupRowText}>
          <b>{g.name}</b>
          <small>{info.description}</small>
          <em>{count(info.discover?.members ?? g.memberIds.length)} members · {r.reason}</em>
        </span>
      </button>
      <button className={`${x.joinPill} ${joined ? x.joined : ""}`} onClick={onJoin} disabled={joined}>{joined ? "Joined" : "Join"}</button>
    </div>
  );
}

function ActivityRow({ a, now, saved, chats, onItem, onSave, onCollection, onGroup }: {
  a: Activity;
  now: number;
  saved: Record<string, string>;
  chats: Chat[];
  onItem: (item: PublicItem, from: PublicCollection) => void;
  onSave: (item: PublicItem, from: PublicCollection) => void;
  onCollection: (id: string) => void;
  onGroup: (g: Chat) => void;
}) {
  const who = creator(a.by);
  const pc = a.collectionId ? publicCollection(a.collectionId) : null;
  const group = a.groupId ? chats.find((c) => c.id === a.groupId) : null;
  const things = (a.itemIds ?? []).map((id) => publicItem(id)?.item).filter(Boolean) as PublicItem[];
  const verb = a.kind === "joined" ? "joined" : a.kind === "made" ? "made" : `saved ${things.length} ${things.length === 1 ? "thing" : "things"} to`;
  return (
    <div className={x.activity}>
      <div className={x.activityHead}>
        <Avatar glyph={initials(who.name)} tone={who.tone} photo={who.photo} size={32} shape="circle" />
        <span className={x.activityText}>
          <b>{who.name.split(" ")[0]}</b> {verb}{" "}
          {pc && <button className={x.inline} onClick={() => onCollection(pc.id)}>{emojify(`${pc.emoji} ${pc.name}`)}</button>}
          {group && <button className={x.inline} onClick={() => onGroup(group)}>{group.name}</button>}
          <small> · {ago(a.at, now)}</small>
        </span>
      </div>
      {pc && things.length > 0 && (
        <DragScroll className={x.strip} style={{ ["--tone" as string]: pc.tone }}>
          {things.map((item) => (
            <div key={item.id} className={x.mini}>
              <button className={x.miniMain} onClick={() => onItem(item, pc)}>
                {item.kind === "image" && item.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={item.image} alt="" />
                  : <span className={x.miniCard}><i aria-hidden="true"><Emoji char={KIND_ICON[item.kind] ?? "✨"} /></i><em>{KIND_LABEL[item.kind]}</em>{item.title}</span>}
              </button>
              <button className={`${x.plus} ${x.miniPlus} ${saved[item.id] ? x.plusDone : ""}`} onClick={() => onSave(item, pc)} disabled={!!saved[item.id]} aria-label={`Save ${item.title}`}>
                {saved[item.id] ? <IconCheck size={12} /> : <IconPlus size={13} />}
              </button>
            </div>
          ))}
        </DragScroll>
      )}
      {group && (
        <button className={x.activityGroup} onClick={() => onGroup(group)} style={{ ["--tone" as string]: TONES[group.tone ?? "graphite"] }}>
          <span className={x.groupThumb} style={groupInfo(group).cover ? { backgroundImage: `url(${groupInfo(group).cover})` } : undefined} />
          <span className={x.groupRowText}><b>{group.name}</b><small>{groupInfo(group).description}</small></span>
        </button>
      )}
    </div>
  );
}

/* ===========================================================================
   Sheets and the collection page
   =========================================================================== */

function SaveSheet({ item, from, onClose, onPick, onNew }: { item: PublicItem; from: PublicCollection; onClose: () => void; onPick: (colId: string) => void; onNew: () => void }) {
  const { me } = useChat();
  const { mind } = useMind(me);
  const suggested = suggestCollection(mind, from.topics as Topic[]);
  const list = [...(mind?.collections ?? [])].sort((a, b) => (a.id === suggested?.id ? -1 : b.id === suggested?.id ? 1 : 0));
  return (
    <Sheet title="Save to Mind" onClose={onClose}>
      {(close) => (
        <>
          <div className={styles.mindDetail}><BlockView block={asBlock(item)} shape="row" /></div>
          {list.length ? (
            <>
              <p className={styles.sheetLabel}>Into</p>
              <div className={styles.listGroup}>
                {list.map((c) => (
                  <button key={c.id} className={styles.actionRow} onClick={() => close(() => onPick(c.id))}>
                    <span className={styles.mindEmoji} style={{ background: `color-mix(in srgb, ${c.tone} 16%, transparent)` }}><Emoji char={c.emoji} /></span>
                    <span className={styles.contactText}><b>{c.name}</b><small>{c.id === suggested?.id ? "Suggested: it fits what’s in here" : `${c.pages.length} ${c.pages.length === 1 ? "stack" : "stacks"}`}</small></span>
                    {c.id === suggested?.id && <span className={x.suggested}>Suggested</span>}
                  </button>
                ))}
              </div>
              <p className={styles.sheetNote}>It lands at the top of the collection; move it into a stack any time.</p>
            </>
          ) : (
            <button className={`${styles.primaryWide} ${x.rowBtn}`} onClick={() => close(onNew)}><IconPlus size={16} /> Start “{from.name}” in your Mind</button>
          )}
        </>
      )}
    </Sheet>
  );
}

function ItemSheet({ item, from, saved, onClose, onSave, onOpenCollection }: { item: PublicItem; from: PublicCollection; saved?: string; onClose: () => void; onSave: () => void; onOpenCollection: () => void }) {
  return (
    <Sheet title={KIND_LABEL[item.kind]} onClose={onClose}>
      {(close) => (
        <>
          <div className={styles.mindDetail}><BlockView block={asBlock(item)} shape="detail" /></div>
          <button className={x.fromRow} onClick={onOpenCollection}>
            <span className={styles.mindEmoji} style={{ background: `color-mix(in srgb, ${from.tone} 16%, transparent)` }}><Emoji char={from.emoji} /></span>
            <span className={styles.contactText}><b>From {from.name}</b><small>by {creator(from.by).name} · {count(from.saves)} saves</small></span>
          </button>
          <button className={`${styles.primaryWide} ${x.rowBtn}`} disabled={!!saved} onClick={() => close(onSave)}>
            {saved ? <><IconCheck size={16} /> Saved</> : <><IconPlus size={16} /> Save to Mind</>}
          </button>
        </>
      )}
    </Sheet>
  );
}

function GroupSheet({ groupId, reason, onClose, onJoin, onOpen }: { groupId: string; reason?: string; onClose: () => void; onJoin: (g: Chat) => void; onOpen: (g: Chat) => void }) {
  const { state, me } = useChat();
  const group = state.data.chats.find((c) => c.id === groupId);
  if (!group) return null;
  const info = groupInfo(group);
  const joined = group.memberIds.includes(me);
  const known = group.memberIds.filter((u) => u !== me);
  return (
    <Sheet title={group.name} onClose={onClose}>
      {(close) => (
        <>
          <GroupBanner look={{ name: group.name, description: info.description, tone: group.tone ?? "graphite", photo: group.photo, cover: info.cover }} compact />
          <div className={x.groupFacts}>
            <span><IconUserGroup size={15} /> {(info.discover?.members ?? group.memberIds.length).toLocaleString()} members</span>
            {reason && <span><IconSparkles size={14} /> {reason}</span>}
          </div>
          {info.discover && (
            <div className={styles.chipGrid}>
              {info.discover.topics.map((t) => <span key={t} className={`${styles.choice} ${x.topic}`}>{TOPIC_LABEL[t as Topic] ?? t}</span>)}
            </div>
          )}
          {known.length > 0 && (
            <div className={x.faces}>
              {known.slice(0, 5).map((u) => { const p = userById(u); return <Avatar key={u} glyph={initials(p.fullName)} tone={p.tone} photo={p.photo} size={28} shape="circle" />; })}
              <small>{known.map((u) => userById(u).name).slice(0, 3).join(", ")} {known.length === 1 ? "is" : "are"} in it</small>
            </div>
          )}
          <p className={styles.sheetLabel}>Channels</p>
          <div className={styles.chipGrid}>
            {info.channels.filter((c) => !c.roles.length).map((c) => <span key={c.id} className={`${styles.choice} ${x.topic}`}>#{c.name}</span>)}
          </div>
          {joined ? (
            <button className={styles.primaryWide} onClick={() => close(() => onOpen(group))}>Open {group.name}</button>
          ) : (
            <button className={styles.primaryWide} onClick={() => close(() => onJoin(group))}>Join group</button>
          )}
          <p className={styles.sheetNote}>Public group: anyone can join, and leave from its settings.</p>
        </>
      )}
    </Sheet>
  );
}

function CollectionPage({ pc, leaving, added, saved, onBack, onAdd, onItem, onSave }: {
  pc: PublicCollection;
  leaving: boolean;
  added: boolean;
  saved: Record<string, string>;
  onBack: () => void;
  onAdd: () => void;
  onItem: (item: PublicItem) => void;
  onSave: (item: PublicItem) => void;
}) {
  const total = pc.stacks.reduce((n, s) => n + s.items.length, 0);
  return (
    <div className={`${styles.screen} ${styles.chatScreen} ${x.page} ${leaving ? styles.leaving : ""}`} style={{ ["--tone" as string]: pc.tone }}>
      <header className={x.pageBar}>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={onBack} aria-label="Back to Explore"><IconBack /></button>
        <b>{pc.name}</b>
        <span />
      </header>
      <div className={x.pageScroll}>
        <div className={x.pageCover} style={{ backgroundImage: `url(${pc.cover})` }} />
        <div className={x.pageHead}>
          <span className={x.pageEmoji}><Emoji char={pc.emoji} /></span>
          <h2>{pc.name}</h2>
          <Byline id={pc.by} extra={`${count(pc.saves)} saves · ${pc.stacks.length} stacks · ${total} things`} />
          <p>{pc.description}</p>
          <div className={styles.chipGrid}>
            {pc.topics.map((t) => <span key={t} className={`${styles.choice} ${x.topic}`}>{TOPIC_LABEL[t]}</span>)}
          </div>
          <button className={`${styles.primaryWide} ${x.btn}`} onClick={onAdd} disabled={added}>
            {added ? <><IconCheck size={15} /> In your Mind</> : <><IconPlus size={15} /> Add to Mind</>}
          </button>
          <small className={x.hint}>{added ? "It’s yours now: change anything in it from Mind." : "Copies every stack into your Mind. Or save single things with +."}</small>
        </div>
        {pc.stacks.map((s) => (
          <section key={s.title} className={x.pageStack}>
            <p className={x.stackHead}><Emoji char={s.emoji} /> <b>{s.title}</b> <em>{s.items.length}</em></p>
            <div className={x.masonry}>
              {s.items.map((item) => <ItemTile key={item.id} item={item} saved={!!saved[item.id]} onOpen={() => onItem(item)} onSave={() => onSave(item)} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
