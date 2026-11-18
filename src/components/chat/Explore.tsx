"use client";

import { useCallback, useEffect, useState } from "react";
import { netFailureText } from "@/lib/chat/api";
import { initials, TONES } from "@/lib/chat/avatar";
import { Emoji, emojify } from "@/lib/chat/emoji";
import {
  addCollection, addedFrom, allPublic, asBlock, friendActivity, friendsOf, hasPicture, peopleLine, publicCollection, publicItem, rankGroups,
  saveItem, suggestCollection, TOPIC_LABEL, topicsOnExplore, wallFor, type Activity, type PublicCollection, type PublicItem, type Ranked, type Topic,
  type WallEntry, type WallThing,
} from "@/lib/chat/explore";
import { OPEN_EXPLORE, takePendingExplore, toggleFollow, updateExploreFlags, useExploreFlags } from "@/lib/chat/exploreFlags";
import { addMember, groupInfo, landingChannel } from "@/lib/chat/groups";
import { isUnassigned, makeCollection, MIND_FAILED, place, useMind } from "@/lib/chat/mind";
import { useChat, userById } from "@/lib/chat/store";
import type { Chat } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { DragScroll } from "./Composer";
import {
  CollectionPage, CollectionStrip, creator, CreatorPage, InterestsSheet, ThingPage, Wall, type ExploreNav,
} from "./ExplorePages";
import { GroupBanner } from "./Groups";
import { IconBookmark, IconCheck, IconClose, IconFolder, IconOpen, IconSparkles, IconUserGroup } from "./Icons";
import { ExploreSkeleton, LoadFailed, RowSkeleton, useFirstLoad, useSettled } from "./Loading";
import Logo from "./Logo";
import { BlockView, KIND_LABEL } from "./MindBlocks";
import { HoldMenu, useHoldMenu, type HoldAction } from "./MindHold";
import { Sheet, useNow } from "./ui";
import styles from "./chat.module.css";
import x from "./explore.module.css";

/**
 * Explore, after Pinterest and Cosmos: one wall of things from public
 * collections, with a collection across the width every few rows (see
 * lib/chat/explore.ts, wallFor). Topic chips narrow it; groups and what
 * friends have been saving have chips of their own, out of the wall.
 * Anything opens as a page (ExplorePages.tsx) without saving it; saving is
 * one tap, into the collection Mind suggests, with Change on the toast.
 */

type Chip = "foryou" | Topic | "groups" | "friends";
type PageRef = { key: number; kind: "collection" | "thing" | "creator"; id: string; from?: string; leaving?: boolean };

const KIND_ICON: Partial<Record<PublicItem["kind"], string>> = { link: "🔗", note: "📝", flashcard: "🃏", todo: "✅", book: "📚", video: "🎬", quote: "💬" };
const count = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n));
/** "just now", then minutes, hours and days, so something done a moment ago doesn't look an hour old. */
function ago(ts: number, now: number) {
  const m = Math.floor((now - ts) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
const short = (id: string) => creator(id).name.split(" ")[0];

export default function ExploreTab({ onOpenChat, onSettings }: { onOpenChat: (chat: Chat) => void; onSettings: () => void }) {
  const { state, me, updateGroup } = useChat();
  const { mind, update } = useMind(me);
  const flags = useExploreFlags(me);
  const meUser = userById(me);
  const now = useNow(60_000);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<Chip>("foryou");
  const [sheet, setSheet] = useState<React.ReactNode>(null);
  const [pages, setPages] = useState<PageRef[]>([]);
  const [toast, setToast] = useState<{ text: string; id: number; leaving?: boolean; action?: { label: string; run: () => void } } | null>(null);
  /** Saved this visit: which Mind collection, and the new item's id there (so Change can move it). */
  const [saved, setSaved] = useState<Record<string, { col: string; block: string }>>({});
  /** The interests question, put off for this visit only. */
  const [notNow, setNotNow] = useState(false);
  const chats = state.data.chats;

  const flash = useCallback((text: string, action?: { label: string; run: () => void }) => {
    const id = Date.now();
    setToast({ text, id, action });
    const stay = action ? 4000 : 2200;
    setTimeout(() => setToast((t) => (t?.id === id ? { ...t, leaving: true } : t)), stay);
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), stay + 220);
  }, [setToast]);
  // Explore comes from the server in the real app: the first visit this session waits for it, and may not get it.
  const load = useFirstLoad(`explore:${me}`, { canFail: true });
  useEffect(() => {
    const failed = (e: Event) => {
      if ((e as CustomEvent<{ userId: string }>).detail.userId === me) flash(`${netFailureText()}. It wasn't saved to your Mind.`);
    };
    window.addEventListener(MIND_FAILED, failed);
    return () => window.removeEventListener(MIND_FAILED, failed);
  }, [me, flash]);
  const closeSheet = () => setSheet(null);

  /* ---- pages: a stack, each sliding in over the last ---- */
  const push = useCallback((p: Omit<PageRef, "key">) => setPages((s) => [...s.filter((q) => !q.leaving), { ...p, key: Date.now() + Math.random() }]), []);
  const back = () => {
    setPages((s) => s.map((p, i) => (i === s.length - 1 ? { ...p, leaving: true } : p)));
    setTimeout(() => setPages((s) => s.filter((p) => !p.leaving)), 220);
  };
  // Mind's "Related on Explore" (or a shared link) opens a collection here.
  useEffect(() => {
    const take = () => { const id = takePendingExplore(); if (id) push({ kind: "collection", id }); };
    take();
    window.addEventListener(OPEN_EXPLORE, take);
    return () => window.removeEventListener(OPEN_EXPLORE, take);
  }, [push]);

  /* ---- saving ---- */
  const saveTo = (item: PublicItem, colId: string, label: string) => {
    let block = "";
    update((m) => { const r = saveItem(m, item, colId); block = r.id; return r.mind; });
    setSaved((s) => ({ ...s, [item.id]: { col: colId, block } }));
    return label;
  };
  /** Into the collection that fits, at once; Change on the toast picks another. */
  const quickSave = (item: PublicItem, from: PublicCollection) => {
    const target = suggestCollection(mind, from.topics as Topic[]);
    if (target) {
      saveTo(item, target.id, "");
      flash(`Saved to ${target.emoji} ${target.name}`, { label: "Change", run: () => change(item, from) });
    } else {
      const col = makeCollection(from.name, from.emoji, from.tone);
      update((m) => ({ ...m, collections: [...m.collections, col] }));
      saveTo(item, col.id, "");
      flash(`Saved to a new ${from.emoji} ${from.name}`, { label: "Change", run: () => change(item, from) });
    }
  };
  /** Pick the collection: moves it if it's already saved, saves it if not. */
  const change = (item: PublicItem, from: PublicCollection) => setSheet(
    <SaveSheet
      item={item}
      from={from}
      current={saved[item.id]?.col}
      onClose={closeSheet}
      onPick={(colId) => {
        const col = mind?.collections.find((c) => c.id === colId);
        const was = saved[item.id];
        if (was) {
          update((m) => place(m, was.block, { collectionId: colId }));
          setSaved((s) => ({ ...s, [item.id]: { ...was, col: colId } }));
          if (col) flash(`Moved to ${col.emoji} ${col.name}`);
        } else {
          saveTo(item, colId, "");
          if (col) flash(`Saved to ${col.emoji} ${col.name}`);
        }
      }}
      onNew={() => {
        const col = makeCollection(from.name, from.emoji, from.tone);
        update((m) => saveItem({ ...m, collections: [...m.collections, col] }, item, col.id).mind);
        setSaved((s) => ({ ...s, [item.id]: { col: col.id, block: "" } }));
        flash(`Saved to ${from.emoji} ${from.name}`);
      }}
    />,
  );
  const add = (pc: PublicCollection) => {
    if (addedFrom(mind, pc.id)) return;
    update((m) => addCollection(m, pc).mind);
    flash(`Added ${pc.emoji} ${pc.name} to your Mind`);
  };
  const join = (group: Chat) => {
    updateGroup(group.id, (g) => addMember(g, me));
    flash(`You joined ${group.name}`, { label: "Open", run: () => onOpenChat(landingChannel(chats, group, me)) });
  };
  const showGroup = (group: Chat, reason?: string) => setSheet(
    <GroupSheet groupId={group.id} reason={reason} onClose={closeSheet} onJoin={join} onOpen={(g) => onOpenChat(landingChannel(chats, g, me))} />,
  );

  const nav: ExploreNav = {
    me,
    openCollection: (id) => push({ kind: "collection", id }),
    openThing: (item, from) => push({ kind: "thing", id: item.id, from: from.id }),
    openCreator: (id) => push({ kind: "creator", id }),
    back,
    savedTo: (id) => {
      const s = saved[id];
      const col = s && mind?.collections.find((c) => c.id === s.col);
      return col ? { colName: col.name, colEmoji: col.emoji } : null;
    },
    save: quickSave,
    change,
    added: (pcId) => !!addedFrom(mind, pcId),
    saveCollection: add,
    following: (who) => flags.follows.includes(who),
    follow: (who) => {
      const was = flags.follows.includes(who);
      toggleFollow(me, who);
      flash(was ? `You unfollowed ${short(who)}` : `Following ${short(who)}: their collections come first`);
    },
    share: (what) => {
      const top = pages[pages.length - 1];
      const id = top?.kind === "collection" ? top.id : top?.from ?? "";
      const link = `${window.location.origin}/?explore=${encodeURIComponent(id)}`;
      void navigator.clipboard?.writeText(link).catch(() => {});
      flash(`Link to ${what} copied`);
    },
  };

  /* ---- hold for a menu, like a message ---- */
  const hold = useHoldMenu();
  const menu = (el: HTMLElement, title: React.ReactNode, actions: HoldAction[]) => setSheet(<HoldMenu anchor={el} title={title} actions={actions} onClose={closeSheet} />);
  const holdThing = (t: WallThing) => hold((el) => menu(el, t.item.title || KIND_LABEL[t.item.kind], [
    { id: "open", label: "Open", icon: <IconOpen />, run: () => nav.openThing(t.item, t.collection) },
    ...(t.collection.by === me ? [] : [
      { id: "save", label: saved[t.item.id] ? "Move to…" : "Save", icon: <IconBookmark />, run: () => (saved[t.item.id] ? change(t.item, t.collection) : quickSave(t.item, t.collection)) },
      { id: "saveTo", label: "Save to…", icon: <IconFolder />, run: () => change(t.item, t.collection) },
    ]),
    { id: "from", label: `See ${t.collection.name}`, icon: <IconSparkles />, run: () => nav.openCollection(t.collection.id) },
  ]));
  const holdCollection = (pc: PublicCollection) => hold((el) => menu(el, emojify(`${pc.emoji} ${pc.name}`), [
    { id: "open", label: "Look inside", icon: <IconOpen />, run: () => nav.openCollection(pc.id) },
    ...(pc.by === me || addedFrom(mind, pc.id) ? [] : [{ id: "add", label: "Save collection", icon: <IconBookmark />, run: () => add(pc) }]),
    { id: "who", label: `More from ${short(pc.by)}`, icon: <IconUserGroup />, run: () => nav.openCreator(pc.by) },
  ]));

  /* ---- the wall, worked out once per chip per visit, so what you save stays put ---- */
  const picks = flags.topics ?? [];
  const computeWall = (c: Chip, p: string[] = picks) => wallFor(mind, chats, me, { topic: c === "foryou" ? null : (c as Topic), picks: p, follows: flags.follows });
  const [walls, setWalls] = useState<Partial<Record<Chip, WallEntry[]>>>(() => ({ foryou: computeWall("foryou") }));
  const selectChip = (c: Chip) => {
    setChip(c);
    if (c !== "groups" && c !== "friends" && !walls[c]) setWalls((w) => ({ ...w, [c]: computeWall(c) }));
  };
  const wall = chip === "groups" || chip === "friends" ? null : walls[chip] ?? null;
  const topics = topicsOnExplore(picks);

  // Groups are held for the visit too: joining marks one joined instead of swapping it out.
  const [groupPicks] = useState(() => rankGroups(mind, chats, me, short).map((r) => ({ id: r.value.id, score: r.score, reason: r.reason })));
  const groups: Ranked<Chat>[] = groupPicks
    .map((p) => ({ ...p, value: chats.find((c) => c.id === p.id) }))
    .filter((p): p is Ranked<Chat> & { id: string } => !!p.value && !p.value.removedAt);
  const activity = friendActivity(chats, me);

  /* ---- search: collections, then things, then groups ---- */
  const q = query.trim().toLowerCase();
  const found = q ? (() => {
    const cols = allPublic().filter((c) => c.by !== me && [c.name, c.description, creator(c.by).name, ...c.topics.map((t) => TOPIC_LABEL[t])].some((s) => s.toLowerCase().includes(q)));
    const things: WallEntry[] = allPublic().filter((c) => c.by !== me).flatMap((c) => c.items
      // A thing matches on its words, or on its collection's topics ("cinematography" finds film).
      .filter((i) => i.kind !== "todo" && `${i.title} ${i.body ?? ""} ${i.note ?? ""} ${(i.tags ?? []).join(" ")} ${c.topics.map((t) => TOPIC_LABEL[t]).join(" ")}`.toLowerCase().includes(q))
      .map((item) => ({ kind: "thing" as const, item, collection: c })))
      .sort((a, b) => Number(hasPicture(b.item)) - Number(hasPicture(a.item)))
      .slice(0, 24);
    const gs = groups.filter((r) => [r.value.name, groupInfo(r.value).description, ...(groupInfo(r.value).discover?.topics ?? [])].some((s) => s.toLowerCase().includes(q)));
    return { cols, things, groups: gs };
  })() : null;
  const searching = useSettled(q);

  const top = pages[pages.length - 1];

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
              <span>Collections to look through and keep</span>
            </div>
          </div>
        </div>
        <label className={styles.searchBar}>
          <span className={styles.maskIcon} style={{ width: 16, height: 16, ["--src" as string]: "url(/nod/search.svg)" }} aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search collections, people and ideas" />
          {query && <button className={styles.mindClear} onClick={() => setQuery("")} aria-label="Clear search"><IconClose size={14} /></button>}
        </label>
      </header>

      <div className={styles.inboxBody}>
        <div className={styles.inboxScroll}>
          {load.state === "loading" ? <ExploreSkeleton />
            : load.state === "failed" ? <LoadFailed what="Explore" onRetry={load.retry} />
            : <>
          {!q && (
            <DragScroll className={`${styles.chips} ${x.topicChips}`} sideWheel={false} glide role="tablist" aria-label="Topics">
              <button role="tab" aria-selected={chip === "foryou"} className={`${styles.chip} ${chip === "foryou" ? styles.chipOn : ""}`} onClick={() => selectChip("foryou")}>For you</button>
              {topics.map((t) => (
                <button key={t} role="tab" aria-selected={chip === t} className={`${styles.chip} ${chip === t ? styles.chipOn : ""}`} onClick={() => selectChip(t)}>{TOPIC_LABEL[t]}</button>
              ))}
              <span className={x.chipRule} aria-hidden="true" />
              <button role="tab" aria-selected={chip === "groups"} className={`${styles.chip} ${chip === "groups" ? styles.chipOn : ""}`} onClick={() => selectChip("groups")}>Groups</button>
              <button role="tab" aria-selected={chip === "friends"} className={`${styles.chip} ${chip === "friends" ? styles.chipOn : ""}`} onClick={() => selectChip("friends")}>Friends</button>
            </DragScroll>
          )}

          {found && searching.state === "loading" ? <RowSkeleton />
          : found && searching.state === "failed" ? <LoadFailed what="search results" onRetry={searching.retry} />
          : found ? (
            <div className={x.stack}>
              {found.cols.length > 0 && (
                <div className={x.wallStack}>
                  {found.cols.map((pc) => <CollectionStrip key={pc.id} pc={pc} added={nav.added(pc.id)} onOpen={() => nav.openCollection(pc.id)} onCreator={() => nav.openCreator(pc.by)} holdProps={holdCollection(pc)} />)}
                </div>
              )}
              {found.things.length > 0 && <Wall entries={found.things} nav={nav} holdThing={holdThing} />}
              {found.groups.length > 0 && <div className={x.groupList}>{found.groups.map((r) => <GroupRow key={r.value.id} r={r} joined={r.value.memberIds.includes(me)} onOpen={() => showGroup(r.value, r.reason)} onJoin={() => join(r.value)} />)}</div>}
              {!found.cols.length && !found.things.length && !found.groups.length && <p className={styles.emptyInbox}>Nothing on Explore matches “{query}”.</p>}
            </div>
          ) : chip === "groups" ? (
            <div className={x.groupList} key="groups">
              {groups.map((r) => <GroupRow key={r.value.id} r={r} joined={r.value.memberIds.includes(me)} onOpen={() => showGroup(r.value, r.reason)} onJoin={() => join(r.value)} />)}
              {!groups.length && <p className={styles.emptyInbox}>You’re in every group on Explore.</p>}
            </div>
          ) : chip === "friends" ? (
            <div className={x.feed} key="friends">
              {activity.length ? activity.map((a) => (
                <ActivityRow key={a.id} a={a} now={now} saved={saved} chats={chats} onItem={nav.openThing} holdItem={(item, pc) => holdThing({ kind: "thing", item, collection: pc })} onCollection={nav.openCollection} onGroup={(g) => showGroup(g)} />
              )) : <p className={styles.emptyInbox}>When people you chat with save or join something public, it shows here.</p>}
            </div>
          ) : wall ? (
            wall.length ? <Wall key={chip} entries={wall} nav={nav} holdThing={holdThing} holdCollection={holdCollection} />
              : <p className={styles.emptyInbox}>Nothing about {chip === "foryou" ? "this" : TOPIC_LABEL[chip]} yet.</p>
          ) : <ExploreSkeleton />}
          </>}
        </div>
      </div>

      {pages.map((p) => {
        if (p.kind === "collection") {
          const pc = publicCollection(p.id);
          return pc ? <CollectionPage key={p.key} pc={pc} nav={nav} leaving={!!p.leaving} holdThing={holdThing} /> : null;
        }
        if (p.kind === "thing") {
          const found = publicItem(p.id);
          return found ? <ThingPage key={p.key} item={found.item} from={found.collection} nav={nav} leaving={!!p.leaving} holdThing={holdThing} /> : null;
        }
        return <CreatorPage key={p.key} who={p.id} nav={nav} leaving={!!p.leaving} />;
      })}

      {/* The first visit asks what you're into (once you've seen it load). */}
      {load.state === "ready" && flags.topics === null && !notNow && !top && !sheet && (
        <InterestsSheet
          initial={[]}
          onClose={() => setNotNow(true)}
          onDone={(t) => {
            updateExploreFlags(me, (f) => ({ ...f, topics: t }));
            // The wall starts again from what was picked.
            setWalls({ foryou: computeWall("foryou", t) });
            setChip("foryou");
            if (t.length) flash(`Explore starts from ${t.map((x) => TOPIC_LABEL[x as Topic]).join(", ")}`);
          }}
        />
      )}
      {sheet}
      {toast && (
        <div key={toast.id} className={`${styles.toast} ${styles.glassStrong} ${styles.mindToast} ${toast.action ? styles.toastActions : ""} ${toast.leaving ? styles.toastLeaving : ""} ${x.exToast}`} role="status">
          <span className={styles.toastText}>{emojify(toast.text)}</span>
          {toast.action && <button className={styles.toastBtn} onClick={() => { setToast(null); toast.action!.run(); }}>{toast.action.label}</button>}
        </div>
      )}
    </>
  );
}

/* ===========================================================================
   Groups, friends, and the sheet that picks a collection
   =========================================================================== */

type HoldProps = ReturnType<ReturnType<typeof useHoldMenu>>;

function GroupRow({ r, joined, onOpen, onJoin }: { r: Ranked<Chat>; joined: boolean; onOpen: () => void; onJoin: () => void }) {
  const g = r.value;
  const info = groupInfo(g);
  return (
    <div className={x.groupRow} style={{ ["--tone" as string]: TONES[g.tone ?? "graphite"] }}>
      <button className={x.groupRowMain} onClick={onOpen}>
        <span className={x.groupThumb}><Avatar glyph={initials(g.name)} tone={g.tone ?? "graphite"} photo={g.photo} size={64} /></span>
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

function ActivityRow({ a, now, saved, chats, onItem, holdItem, onCollection, onGroup }: {
  a: Activity;
  now: number;
  saved: Record<string, unknown>;
  chats: Chat[];
  onItem: (item: PublicItem, from: PublicCollection) => void;
  holdItem: (item: PublicItem, from: PublicCollection) => HoldProps;
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
        <DragScroll className={x.strip} sideWheel={false} glide style={{ ["--tone" as string]: pc.tone }}>
          {things.map((item) => (
            <div key={item.id} className={`${x.mini} ${x.holdable}`} {...holdItem(item, pc)}>
              <button className={x.miniMain} onClick={() => onItem(item, pc)}>
                {item.kind === "image" && item.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={item.image} alt="" />
                  : <span className={x.miniCard}><i aria-hidden="true"><Emoji char={KIND_ICON[item.kind] ?? "✨"} /></i><em>{KIND_LABEL[item.kind]}</em>{item.title}</span>}
              </button>
              {!!saved[item.id] && <span className={x.miniSaved} aria-label="Saved"><IconCheck size={11} /></span>}
            </div>
          ))}
        </DragScroll>
      )}
      {group && (
        <button className={x.activityGroup} onClick={() => onGroup(group)} style={{ ["--tone" as string]: TONES[group.tone ?? "graphite"] }}>
          <span className={x.groupThumb}><Avatar glyph={initials(group.name)} tone={group.tone ?? "graphite"} photo={group.photo} size={48} /></span>
          <span className={x.groupRowText}><b>{group.name}</b><small>{groupInfo(group).description}</small></span>
        </button>
      )}
    </div>
  );
}

/* ===========================================================================
   Sheets
   =========================================================================== */

function SaveSheet({ item, from, current, onClose, onPick, onNew }: { item: PublicItem; from: PublicCollection; /** Where it was just saved: picking another moves it. */ current?: string; onClose: () => void; onPick: (colId: string) => void; onNew: () => void }) {
  const { me } = useChat();
  const { mind } = useMind(me);
  const suggested = suggestCollection(mind, from.topics as Topic[]);
  const list = (mind?.collections ?? []).filter((c) => !isUnassigned(c)).sort((a, b) => (a.id === suggested?.id ? -1 : b.id === suggested?.id ? 1 : 0));
  return (
    <Sheet title={current ? "Move to" : "Save to Mind"} onClose={onClose}>
      {(close) => (
        <>
          {hasPicture(item) ? (
            // A picture as a small row, so the collections stay in view.
            <div className={x.savePreview}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image ?? item.attachment?.url ?? item.attachment?.dataUrl} alt="" draggable={false} />
              <span><b>{item.title || KIND_LABEL[item.kind]}</b><small>From {from.emoji} {from.name}</small></span>
            </div>
          ) : <div className={styles.mindDetail}><BlockView block={asBlock(item)} shape="row" /></div>}
          {list.length ? (
            <>
              <p className={styles.sheetLabel}>Into</p>
              <div className={styles.listGroup}>
                {list.map((c) => (
                  <button key={c.id} className={styles.actionRow} onClick={() => close(() => onPick(c.id))}>
                    <span className={styles.mindEmoji} style={{ background: `color-mix(in srgb, ${c.tone} 16%, transparent)` }}><Emoji char={c.emoji} /></span>
                    <span className={styles.contactText}><b>{c.name}</b><small>{c.id === suggested?.id ? "It fits what’s in here" : `${c.items.length} ${c.items.length === 1 ? "thing" : "things"}`}</small></span>
                    {c.id === current ? <span className={x.suggested}><IconCheck size={11} /> Saved here</span> : c.id === suggested?.id && <span className={x.suggested}>Suggested</span>}
                  </button>
                ))}
              </div>
              <p className={styles.sheetNote}>It goes in with its tags, so the collection’s filter finds it.</p>
            </>
          ) : (
            <button className={`${styles.primaryWide} ${x.rowBtn}`} onClick={() => close(onNew)}>Start “{from.name}” in your Mind</button>
          )}
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
  // Friends in it (people you share a chat with), not everyone.
  const friends = friendsOf(state.data.chats, me);
  const known = group.memberIds.filter((u) => u !== me && friends.has(u));
  const channels = info.channels.filter((c) => !c.roles.length);
  return (
    <Sheet title={group.name} onClose={onClose}>
      {(close) => (
        <>
          <GroupBanner look={{ name: group.name, description: info.description, tone: group.tone ?? "graphite", photo: group.photo }} compact />
          <div className={x.groupFacts}>
            <span><IconUserGroup size={15} /> {(info.discover?.members ?? group.memberIds.length).toLocaleString()} members</span>
            {/* Friends in it are named under their faces below; the reason is for groups with none. */}
            {reason && !known.length && <span><IconSparkles size={14} /> {reason}</span>}
          </div>
          {info.discover && (
            <div className={styles.chipGrid}>
              {info.discover.topics.map((t) => <span key={t} className={`${styles.choice} ${x.topic}`}>{TOPIC_LABEL[t as Topic] ?? t}</span>)}
            </div>
          )}
          {known.length > 0 && (
            <div className={x.faces}>
              {known.slice(0, 5).map((u) => { const p = userById(u); return <Avatar key={u} glyph={initials(p.fullName)} tone={p.tone} photo={p.photo} size={28} shape="circle" />; })}
              <small>{peopleLine(known.map((u) => userById(u).name), "in it")}</small>
            </div>
          )}
          <p className={styles.sheetLabel}>Channels</p>
          <ul className={x.channelList}>
            {channels.map((c, i) => (
              <li key={c.id}>
                <span className={x.channelName}>
                  <b>#{c.name}</b>
                  {i === 0 && <span className={x.opensHere}>Opens here</span>}
                </span>
                {c.topic && <small>{c.topic}</small>}
              </li>
            ))}
          </ul>
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
