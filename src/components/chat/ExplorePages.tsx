"use client";

import { useRef, useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { Emoji } from "@/lib/chat/emoji";
import {
  asBlock, collectionsBy, followersOf, hasPicture, moreLike, publicCollection, relatedCollections, savesOf, shapeOf,
  STRANGERS, TOPIC_GROUPS, TOPIC_LABEL, type Geo, type PublicCollection, type PublicItem, type Topic, type WallEntry, type WallThing,
} from "@/lib/chat/explore";
import { userById } from "@/lib/chat/store";
import type { AvatarTone } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconBack, IconBook, IconCheck, IconChevron, IconLink, IconLocation, IconMore, IconPlay, IconPlus, IconRetry, IconShare, IconSparkles } from "./Icons";
import { BlockView, KIND_LABEL } from "./MindBlocks";
import { Sheet } from "./ui";
import { useGlide } from "./useGlide";
import styles from "./chat.module.css";
import x from "./explore.module.css";

/**
 * Explore's screens, after Pinterest and Cosmos: one wall of things with
 * collections in it, a collection as its own page (its name is the brand: no
 * banner), a thing up close with more like it underneath, and the person who
 * made them. Everything can be looked at without saving it; saving is one tap.
 */

/* ===========================================================================
   Shared bits
   =========================================================================== */

/** Whoever made something: someone in the demo, or a stranger on NOD. */
export function creator(id: string): { name: string; tone: AvatarTone; photo?: string; username?: string } {
  const s = STRANGERS.find((p) => p.id === id);
  if (s) return { name: s.name, tone: s.tone, username: s.username };
  const u = userById(id);
  return { name: u.fullName, tone: u.tone, photo: u.photo, username: u.username };
}
export const count = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n));
const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;
const pictureOf = (item: PublicItem) => item.image ?? item.attachment?.url ?? item.attachment?.dataUrl ?? null;

/** What a page can do: Explore holds the state and the stack of pages. */
export interface ExploreNav {
  me: string;
  openCollection: (id: string) => void;
  openThing: (item: PublicItem, from: PublicCollection) => void;
  openCreator: (id: string) => void;
  back: () => void;
  /** Saved this visit: the Mind collection it went into. */
  savedTo: (itemId: string) => { colName: string; colEmoji: string } | null;
  save: (item: PublicItem, from: PublicCollection) => void;
  change: (item: PublicItem, from: PublicCollection) => void;
  added: (pcId: string) => boolean;
  saveCollection: (pc: PublicCollection) => void;
  following: (who: string) => boolean;
  follow: (who: string) => void;
  share: (what: string) => void;
}

function Face({ id, size }: { id: string; size: number }) {
  const c = creator(id);
  return <Avatar glyph={initials(c.name)} tone={c.tone} photo={c.photo} size={size} shape="circle" />;
}

/* ===========================================================================
   The wall
   =========================================================================== */

/* ---- what a thing looks like: each kind its own way, so a book reads as a book and a link as a link ---- */

/** A map around a place, from OpenStreetMap's tiles, with a pin on it. */
export function MapPreview({ geo, big }: { geo: Geo; big?: boolean }) {
  // One zoom step closer, each tile at half size: sharp on a phone's screen.
  const z = (geo.zoom ?? 15) + 1;
  const T = 128;
  const n = 2 ** z;
  const rad = (geo.lat * Math.PI) / 180;
  const fx = ((geo.lng + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx);
  const ty = Math.floor(fy);
  // The 5 x 5 tiles around the place, moved so the place sits in the middle.
  const left = 2 * T + (fx - tx) * T;
  const top = 2 * T + (fy - ty) * T;
  const steps = [-2, -1, 0, 1, 2];
  return (
    <span className={`${x.map} ${big ? x.mapBig : ""}`} aria-hidden="true">
      <span className={x.mapTiles} style={{ left: `calc(50% - ${left}px)`, top: `calc(50% - ${top}px)` }}>
        {steps.flatMap((dy) => steps.map((dx) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${dx},${dy}`} src={`https://tile.openstreetmap.org/${z}/${tx + dx}/${ty + dy}.png`} alt="" loading="lazy" draggable={false} style={{ left: (dx + 2) * T, top: (dy + 2) * T }} />
        )))}
      </span>
      <span className={x.mapPin}><IconLocation size={big ? 20 : 15} /></span>
      <small className={x.mapCredit}>© OpenStreetMap</small>
    </span>
  );
}

/** A link: its picture on top (a place's photo, a page's image, or the site's own mark), then the title and where it goes. */
function LinkFace({ item, big }: { item: PublicItem; big?: boolean }) {
  const host = item.source ?? (item.url ? item.url.replace(/^https?:\/\//, "").split("/")[0] : "link");
  const shape = shapeOf(item);
  return (
    <span className={`${x.linkFace} ${big ? x.linkBig : ""}`}>
      <span className={`${x.linkPreview} ${item.image ? x.linkPhoto : ""}`} style={item.image && shape && !big ? { aspectRatio: `1 / ${Math.min(shape, 1.25)}` } : undefined}>
        {item.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.image} alt="" loading="lazy" draggable={false} />
          : item.geo ? <MapPreview geo={item.geo} big={big} />
            : (
              <span className={x.linkSite}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=128`} alt="" loading="lazy" draggable={false} onError={(e) => { e.currentTarget.hidden = true; }} />
                <b>{host}</b>
              </span>
            )}
      </span>
      {!big && (
        <span className={x.linkText}>
          <b>{item.title}</b>
          {item.note && <span>{item.note}</span>}
          <small>{item.geo ? <><IconLocation size={12} /> {item.geo.area ?? host}</> : <><IconLink size={12} /> {host}</>}</small>
        </span>
      )}
    </span>
  );
}

/** A book, the way Mind shows one: the cover stands on its own, a spine and a shadow, then the title and who wrote it. */
function BookFace({ item, big }: { item: PublicItem; big?: boolean }) {
  return (
    <span className={`${x.bookFace} ${big ? x.bookBig : ""}`}>
      <span className={x.bookCover}>
        <b>{item.title}</b>
        {item.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt={`${item.title}, the cover`} loading="lazy" draggable={false} onError={(e) => { e.currentTarget.hidden = true; }} />
        )}
      </span>
      {!big && (
        <span className={x.bookText}>
          <b>{item.title}</b>
          {item.source && <small>{item.source}</small>}
        </span>
      )}
    </span>
  );
}

/** A flashcard: the front, and a Flip that turns it over right there on the wall. */
function FlashFace({ item }: { item: PublicItem }) {
  const [over, setOver] = useState(false);
  return (
    <span className={`${x.flash} ${over ? x.flashOver : ""}`}>
      <span className={x.flashInner}>
        <span className={x.flashSide}><em>Flashcard</em><b>{item.title}</b></span>
        <span className={`${x.flashSide} ${x.flashBack}`}><em>Answer</em><b>{item.back}</b></span>
      </span>
      <button
        className={x.flashFlip}
        onClick={(e) => { e.stopPropagation(); setOver((o) => !o); }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-pressed={over}
      >
        <IconRetry size={13} /> {over ? "Front" : "Flip"}
      </button>
    </span>
  );
}

/** A note as a poster: its words big on the collection's colour, the way a quote reads on Pinterest. */
function NoteFace({ item }: { item: PublicItem }) {
  const body = item.body ?? item.note;
  return (
    <span className={x.note}>
      <b>{item.title}</b>
      {body && <span>{body}</span>}
      <small>{KIND_LABEL[item.kind]}</small>
    </span>
  );
}

/** A thing's face, the way its kind looks: on the wall, or big on its own page. */
export function ThingFace({ item, big }: { item: PublicItem; big?: boolean }) {
  if (item.kind === "book") return <BookFace item={item} big={big} />;
  if (item.kind === "link") return <LinkFace item={item} big={big} />;
  const src = hasPicture(item) ? pictureOf(item) : null;
  const shape = shapeOf(item);
  if (src) return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={big ? item.title : ""} loading="lazy" draggable={false} style={shape && !big ? { aspectRatio: `1 / ${shape}` } : undefined} />
      {item.kind === "video" && <span className={x.tilePlay}><IconPlay size={big ? 22 : 14} /></span>}
    </>
  );
  if (item.kind === "image") return <BlockView block={asBlock(item)} shape="tile" />;
  if (item.kind === "flashcard" && item.back) return <FlashFace item={item} />;
  return <NoteFace item={item} />;
}

/** Roughly how tall a thing stands on the wall, in column widths, so the two columns come out even. */
function heightOf(item: PublicItem) {
  if (item.kind === "book") return 1.72;
  if (item.kind === "link") return (item.image ? Math.min(shapeOf(item) ?? 0.75, 1.25) : 0.62) + (item.note ? 0.5 : 0.36);
  if (hasPicture(item)) return shapeOf(item) ?? 1.3;
  if (item.kind === "flashcard") return 0.8;
  return 0.95;
}

/** Things that can stretch to end a run flush: plain pictures, which crop. Cards keep their own size. */
const canGrow = (item: PublicItem) => hasPicture(item) && item.kind !== "book";

/** One thing on the wall, as its kind looks; under it, the collection it's in and who made it. */
export function ThingTile({ item, from, saved, showFrom = true, grow, onOpen, holdProps }: {
  item: PublicItem;
  from: PublicCollection;
  saved: boolean;
  /** Under it, the collection it's from (not inside that collection). */
  showFrom?: boolean;
  /** Takes the room left at the end of its column (a picture, cropped to fit). */
  grow?: boolean;
  onOpen: () => void;
  holdProps?: Record<string, unknown>;
}) {
  const kind = item.kind === "book" ? x.tileBook : item.kind === "link" ? x.tileCard : !hasPicture(item) && item.kind !== "image" ? x.tileWords : "";
  return (
    <div className={`${x.tile} ${grow ? x.tileGrow : ""}`} style={{ ["--tone" as string]: from.tone }}>
      <div role="button" tabIndex={0} className={`${x.tileMain} ${kind} ${x.holdable}`} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} aria-label={item.title || KIND_LABEL[item.kind]} {...holdProps}>
        <ThingFace item={item} />
        {saved && <span className={x.tileSaved} aria-label="Saved"><IconCheck size={12} /></span>}
      </div>
      {showFrom && (
        <span className={x.tileFrom}>
          <Face id={from.by} size={18} />
          <span>{from.name}</span>
        </span>
      )}
    </div>
  );
}

/**
 * A collection's cover: its best picture large, two more beside it, and how
 * many more there are, like a board on Pinterest. Words stand in where it has no pictures.
 */
export function Cover({ pc }: { pc: PublicCollection }) {
  const pics = pc.items.filter((i) => (hasPicture(i) && i.kind !== "book") || (i.kind === "link" && !!i.image));
  const books = pc.items.filter((i) => i.kind === "book");
  const rest = pc.items.filter((i) => !hasPicture(i) && i.kind !== "todo" && !(i.kind === "link" && i.image));
  const cells = [...pics, ...books, ...rest].slice(0, 3);
  const more = pc.items.length - cells.length;
  const cell = (i: PublicItem | undefined, k: number) => {
    if (!i) return <span key={k} className={x.coverBlank} />;
    if (i.kind === "book") return <span key={i.id} className={x.coverBook}><span className={x.bookCover}><b>{i.title}</b>{i.image && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={i.image} alt="" loading="lazy" draggable={false} onError={(e) => { e.currentTarget.hidden = true; }} />
    )}</span></span>;
    if (hasPicture(i) || (i.kind === "link" && i.image)) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={i.id} src={pictureOf(i)!} alt="" loading="lazy" draggable={false} />;
    }
    if (i.kind === "link" && i.geo) return <span key={i.id} className={x.coverMap}><MapPreview geo={i.geo} /></span>;
    return <span key={i.id} className={x.coverWord}><em>{KIND_LABEL[i.kind]}</em>{i.title}</span>;
  };
  return (
    <span className={x.cover} style={{ ["--tone" as string]: pc.tone }} aria-hidden="true">
      {cells.length ? (
        <>
          <span className={x.coverMain}>{cell(cells[0], 0)}</span>
          <span className={x.coverSide}>
            {cell(cells[1], 1)}
            <span className={x.coverLast}>
              {cell(cells[2], 2)}
              {more > 0 && <b className={x.coverMore}>+{more}</b>}
            </span>
          </span>
        </>
      ) : <span className={x.stripEmpty}><Emoji char={pc.emoji} /></span>}
    </span>
  );
}

/** A collection on the wall: its cover, its name, who made it. */
export function CollectionStrip({ pc, added, onOpen, onCreator, holdProps }: {
  pc: PublicCollection;
  added: boolean;
  onOpen: () => void;
  onCreator: () => void;
  holdProps?: Record<string, unknown>;
}) {
  const c = creator(pc.by);
  return (
    <article className={`${x.colStrip} ${x.holdable}`} {...holdProps}>
      <button className={x.colStripMain} onClick={onOpen} aria-label={`Look inside ${pc.name}`}>
        <Cover pc={pc} />
      </button>
      <div className={x.colStripText}>
        <button className={x.colStripName} onClick={onOpen}>{pc.name}</button>
        <span className={x.colStripMeta}>
          <button onClick={onCreator}><Face id={pc.by} size={18} /> {c.name}</button>
          <span>· {things(pc.items.length)}</span>
          {added && <span className={x.inMind}><IconCheck size={11} /> In your Mind</span>}
        </span>
      </div>
    </article>
  );
}

/**
 * Two columns, each thing into the shorter one, so the best matches read
 * left to right at the top. A picture's height comes from its shape; the rest are guessed.
 */
function columns(list: WallThing[], showFrom: boolean): [WallThing[], WallThing[]] {
  const cols: [WallThing[], WallThing[]] = [[], []];
  const h = [0, 0];
  for (const t of list) {
    const k = h[0] <= h[1] ? 0 : 1;
    cols[k].push(t);
    h[k] += heightOf(t.item) + (showFrom ? 0.2 : 0.06);
  }
  return cols;
}

/** The wall: things two by two at their own heights, a collection across the width every few rows. */
export function Wall({ entries, nav, showFrom = true, holdThing, holdCollection }: {
  entries: WallEntry[];
  /** Under each thing, the collection it's from: not inside that collection. */
  showFrom?: boolean;
  nav: ExploreNav;
  holdThing?: (t: WallThing) => Record<string, unknown>;
  holdCollection?: (pc: PublicCollection) => Record<string, unknown>;
}) {
  // Runs of things become a two-column wall; a collection breaks the run.
  const runs: (WallThing[] | PublicCollection)[] = [];
  for (const e of entries) {
    if (e.kind === "collection") runs.push(e.collection);
    else {
      const last = runs[runs.length - 1];
      if (Array.isArray(last)) last.push(e);
      else runs.push([e]);
    }
  }
  const tile = (t: WallThing, grow: boolean) => (
    <ThingTile key={t.item.id} item={t.item} from={t.collection} saved={!!nav.savedTo(t.item.id)} showFrom={showFrom} grow={grow} onOpen={() => nav.openThing(t.item, t.collection)} holdProps={holdThing?.(t)} />
  );
  return (
    <div className={x.wallStack}>
      {runs.map((r, i) => Array.isArray(r) ? (
        <div key={`run-${i}`} className={x.wall}>
          {columns(r, showFrom).map((col, k) => {
            const last = col.map((t) => canGrow(t.item)).lastIndexOf(true);
            return <div key={k} className={x.wallCol}>{col.map((t, i) => tile(t, i === last))}</div>;
          })}
        </div>
      ) : (
        <CollectionStrip key={r.id} pc={r} added={nav.added(r.id)} onOpen={() => nav.openCollection(r.id)} onCreator={() => nav.openCreator(r.by)} holdProps={holdCollection?.(r)} />
      ))}
    </div>
  );
}

/* ===========================================================================
   Pages
   =========================================================================== */

/** A page over Explore: back on the left, its own actions on the right; the title shows once you scroll. */
function Page({ title, leaving, onBack, right, floating, children }: {
  title: string;
  leaving: boolean;
  onBack: () => void;
  right?: React.ReactNode;
  floating?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  return (
    <div className={`${styles.screen} ${styles.chatScreen} ${x.exPage} ${leaving ? styles.leaving : ""}`}>
      <header className={`${x.exBar} ${scrolled ? x.exBarOn : ""}`}>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={onBack} aria-label="Back"><IconBack /></button>
        <b aria-hidden={!scrolled}>{title}</b>
        <span className={x.exBarRight}>{right}</span>
      </header>
      <div className={x.exScroll} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 90)}>
        {children}
      </div>
      {floating}
    </div>
  );
}

/** Related collections in a row you scroll sideways: a little mosaic, the name, how many things. */
function RelatedRow({ list, onOpen, className = "" }: { list: PublicCollection[]; onOpen: (id: string) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGlide(ref, [list.length]);
  if (!list.length) return null;
  return (
    <div ref={ref} className={`${x.related} ${className}`} role="list" aria-label="Related collections">
      {list.map((pc) => (
        <button key={pc.id} role="listitem" className={x.relatedCard} onClick={() => onOpen(pc.id)}>
          <Mosaic pc={pc} size="small" />
          <span><b>{pc.name}</b><small>{things(pc.items.length)}</small></span>
        </button>
      ))}
    </div>
  );
}

/** Under a collection of yours in Mind: public ones like it, a tap away on Explore. */
export function RelatedOnExplore({ list, onOpen }: { list: PublicCollection[]; onOpen: (id: string) => void }) {
  if (!list.length) return null;
  return (
    <section className={x.relatedMindSection} aria-label="Related on Explore">
      <p className={styles.sheetLabel}><IconSparkles size={13} /> Related on Explore</p>
      <RelatedRow list={list} onOpen={onOpen} className={x.relatedMind} />
    </section>
  );
}

/** Four pictures in a square: a collection's cover on a profile or in a row. */
export function Mosaic({ pc, size = "large" }: { pc: PublicCollection; size?: "small" | "large" }) {
  const pics = pc.items.filter(hasPicture).slice(0, 4);
  return (
    <span className={`${x.mosaic} ${size === "small" ? x.mosaicSmall : ""} ${pics.length < 2 ? x.mosaicOne : ""}`} style={{ ["--tone" as string]: pc.tone }} aria-hidden="true">
      {pics.length >= 2
        // eslint-disable-next-line @next/next/no-img-element
        ? pics.map((i) => <img key={i.id} src={pictureOf(i)!} alt="" loading="lazy" draggable={false} />)
        : pics[0]
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={pictureOf(pics[0])!} alt="" loading="lazy" draggable={false} />
          : <span className={x.mosaicEmoji}><Emoji char={pc.emoji} /></span>}
    </span>
  );
}

/**
 * A collection, opened: its name big and centred, who made it, what it's
 * about, Follow. Collections like it in a row, its tags to narrow it, then
 * everything in it as a wall. The bar at the bottom saves it whole, finds
 * similar ones, or shares it.
 */
export function CollectionPage({ pc, nav, leaving, holdThing }: { pc: PublicCollection; nav: ExploreNav; leaving: boolean; holdThing?: (t: WallThing) => Record<string, unknown> }) {
  const [tag, setTag] = useState<string | null>(null);
  const relatedRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  useGlide(tagsRef, [pc.id]);
  const c = creator(pc.by);
  const own = pc.by === nav.me;
  const added = nav.added(pc.id);
  const tags = [...new Set(pc.items.flatMap((i) => i.tags ?? []))];
  const shown = pc.items.filter((i) => i.kind !== "todo" || !tag).filter((i) => !tag || (i.tags ?? []).includes(tag));
  const todos = pc.items.filter((i) => i.kind === "todo");
  const related = relatedCollections(pc, 8);
  const entries: WallEntry[] = shown.filter((i) => i.kind !== "todo").map((item) => ({ kind: "thing", item, collection: pc }));
  return (
    <Page
      title={pc.name}
      leaving={leaving}
      onBack={nav.back}
      right={<button className={`${styles.circleBtn} ${styles.glass}`} onClick={() => nav.share(pc.name)} aria-label="Share"><IconShare size={18} /></button>}
      floating={(
        <div className={x.floatBar}>
          {own ? (
            <span className={x.floatNote}>Yours, on Explore</span>
          ) : (
            <button className={`${x.floatMain} ${added ? x.floatDone : ""}`} onClick={() => nav.saveCollection(pc)} disabled={added}>
              {added ? <><IconCheck size={16} /> In your Mind</> : <><IconPlus size={16} /> Save collection</>}
            </button>
          )}
          <button className={x.floatBtn} onClick={() => relatedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}><IconSparkles size={17} /><span>Similar</span></button>
          <button className={x.floatBtn} onClick={() => nav.share(pc.name)}><IconShare size={17} /><span>Share</span></button>
        </div>
      )}
    >
      <div className={x.colHead} style={{ ["--tone" as string]: pc.tone }}>
        <span className={x.colHeadEmoji}><Emoji char={pc.emoji} /></span>
        <h1>{pc.name}</h1>
        <button className={x.colHeadBy} onClick={() => nav.openCreator(pc.by)}>
          <Face id={pc.by} size={22} /> <b>{c.name}</b>
        </button>
        <span className={x.colHeadMeta}>{things(pc.items.length)} · {pc.saves ? `${count(pc.saves)} saves` : "New"}</span>
        {pc.description && <p>{pc.description}</p>}
        {!own && (
          <button className={`${x.followBtn} ${nav.following(pc.by) ? x.followOn : ""}`} onClick={() => nav.follow(pc.by)}>
            {nav.following(pc.by) ? <><IconCheck size={14} /> Following {c.name.split(" ")[0]}</> : `Follow ${c.name.split(" ")[0]}`}
          </button>
        )}
      </div>

      <div ref={relatedRef}>
        {related.length > 0 && <p className={x.label}>Like this</p>}
        <RelatedRow list={related} onOpen={nav.openCollection} />
      </div>

      {tags.length > 1 && (
        <div ref={tagsRef} className={x.tagRow} role="group" aria-label="Narrow it down">
          <button className={`${styles.chip} ${!tag ? styles.chipOn : ""}`} onClick={() => setTag(null)}>All {pc.items.length}</button>
          {tags.map((t) => (
            <button key={t} className={`${styles.chip} ${tag === t ? styles.chipOn : ""}`} onClick={() => setTag(tag === t ? null : t)}>{t.replace(/-/g, " ")}</button>
          ))}
        </div>
      )}

      <Wall entries={entries} nav={nav} showFrom={false} holdThing={holdThing} />
      {todos.length > 0 && !tag && (
        <div className={x.todoCard} style={{ ["--tone" as string]: pc.tone }}>
          <em>Checklist</em>
          {todos.map((t) => <span key={t.id}><i aria-hidden="true" />{t.title}</span>)}
        </div>
      )}
      <div className={x.floatSpace} />
    </Page>
  );
}

/**
 * A thing up close: as big as it gets, who's saved it, its words, one big
 * Save, where it comes from, and more like it underneath, so one leads to many.
 */
export function ThingPage({ item, from, nav, leaving, holdThing }: { item: PublicItem; from: PublicCollection; nav: ExploreNav; leaving: boolean; holdThing?: (t: WallThing) => Record<string, unknown> }) {
  const plain = !hasPicture(item) && item.kind !== "link";
  const saved = nav.savedTo(item.id);
  const own = from.by === nav.me;
  const fans = STRANGERS.filter((s) => s.id !== from.by).slice(0, 3);
  const words = item.kind === "flashcard" ? item.back : item.body ?? item.note;
  return (
    <Page
      title={item.title || KIND_LABEL[item.kind]}
      leaving={leaving}
      onBack={nav.back}
      right={<button className={`${styles.circleBtn} ${styles.glass}`} onClick={() => nav.openCollection(from.id)} aria-label={`Open ${from.name}`}><IconMore size={18} /></button>}
    >
      <div className={x.thingMedia} style={{ ["--tone" as string]: from.tone }}>
        {plain ? <div className={x.thingCard}><BlockView block={asBlock(item)} shape="detail" /></div> : <ThingFace item={item} big />}
      </div>
      {item.geo && item.image && <div className={x.thingMap}><MapPreview geo={item.geo} /></div>}

      <div className={x.thingActions}>
        <button className={`${styles.circleBtn} ${x.thingRound}`} onClick={() => nav.share(item.title || "This")} aria-label="Share"><IconShare size={18} /></button>
        {own ? <span className={x.thingOwn}>From your collection</span> : (
          <button className={`${x.saveBig} ${saved ? x.saveBigDone : ""}`} onClick={() => (saved ? nav.change(item, from) : nav.save(item, from))}>
            {saved ? <><IconCheck size={17} /> Saved to <Emoji char={saved.colEmoji} /> {saved.colName}</> : <><IconPlus size={18} /> Save</>}
          </button>
        )}
      </div>

      <div className={x.thingText}>
        {item.title && <b>{item.title}</b>}
        {words && <p>{words}</p>}
        {item.kind === "book" && item.source && <span className={x.thingMeta}><IconBook size={13} /> by {item.source}</span>}
        {item.kind === "link" && (
          <span className={x.thingMeta}>
            {item.geo ? <><IconLocation size={13} /> {item.geo.area ?? "A place"} · {item.source}</> : <><IconLink size={13} /> {item.source}</>}
          </span>
        )}
        {item.url && (
          <a className={x.thingLink} href={item.geo ? `https://www.openstreetmap.org/?mlat=${item.geo.lat}&mlon=${item.geo.lng}#map=17/${item.geo.lat}/${item.geo.lng}` : item.url} target="_blank" rel="noreferrer">
            {item.geo ? <><IconLocation size={15} /> Open the map</> : item.kind === "book" ? <><IconBook size={15} /> See the book</> : <><IconLink size={15} /> Open {item.source ?? "the link"}</>}
          </a>
        )}
        <span className={x.savedBy}>
          <span className={x.faces}>{fans.map((f) => <Face key={f.id} id={f.id} size={22} />)}</span>
          Saved by {count(savesOf(item, from))} people
        </span>
      </div>

      <button className={x.fromCard} onClick={() => nav.openCollection(from.id)}>
        <Mosaic pc={from} size="small" />
        <span><small>From</small><b>{from.name}</b><small>by {creator(from.by).name} · {things(from.items.length)}</small></span>
        <IconChevron size={16} />
      </button>

      <h2 className={x.moreTitle}>More like this</h2>
      <Wall entries={moreLike(item, from)} nav={nav} holdThing={holdThing} />
    </Page>
  );
}

/** Someone who publishes: their face, how many follow them, Follow, and everything they've made public. */
export function CreatorPage({ who, nav, leaving }: { who: string; nav: ExploreNav; leaving: boolean }) {
  const c = creator(who);
  const list = collectionsBy(who);
  const me = who === nav.me;
  return (
    <Page title={c.name} leaving={leaving} onBack={nav.back} right={<button className={`${styles.circleBtn} ${styles.glass}`} onClick={() => nav.share(c.name)} aria-label="Share"><IconShare size={18} /></button>}>
      <div className={x.creatorHead}>
        <Face id={who} size={88} />
        <h1>{c.name}</h1>
        {c.username && <span className={x.creatorHandle}>@{c.username}</span>}
        <span className={x.creatorMeta}>{count(followersOf(who) + (nav.following(who) ? 1 : 0))} followers · {list.length} {list.length === 1 ? "collection" : "collections"}</span>
        {!me && (
          <button className={`${x.followBtn} ${nav.following(who) ? x.followOn : ""}`} onClick={() => nav.follow(who)}>
            {nav.following(who) ? <><IconCheck size={14} /> Following</> : "Follow"}
          </button>
        )}
      </div>
      <p className={x.label}>Collections</p>
      <div className={x.creatorGrid}>
        {list.map((pc) => (
          <button key={pc.id} className={x.creatorCol} onClick={() => nav.openCollection(pc.id)}>
            <Mosaic pc={pc} />
            <b>{pc.name}</b>
            <small>{things(pc.items.length)}{pc.saves ? ` · ${count(pc.saves)} saves` : ""}</small>
          </button>
        ))}
        {!list.length && <p className={styles.emptyInbox}>Nothing public yet.</p>}
      </div>
    </Page>
  );
}

/**
 * The first visit: pick what you're into, and Explore starts there. It
 * learns from what you save after that; Skip leaves it to what you keep.
 */
export function InterestsSheet({ initial, onDone, onClose }: { initial: string[]; onDone: (topics: string[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>(initial);
  const toggle = (t: Topic) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  return (
    <Sheet title="What are you into?" onClose={onClose} action={{ label: "Show me", disabled: picked.length < 1, onClick: () => onDone(picked) }}>
      {(close) => (
        <>
          <p className={x.interestsLede}>Pick one or more. Explore starts there, and learns from what you save.</p>
          {TOPIC_GROUPS.map((g) => (
            <div key={g.title} className={x.interestGroup}>
              <p className={styles.sheetLabel}>{g.title}</p>
              <div className={x.interestChips}>
                {g.topics.map((t) => {
                  const on = picked.includes(t);
                  return (
                    <button key={t} className={`${x.interest} ${on ? x.interestOn : ""}`} onClick={() => toggle(t)} aria-pressed={on}>
                      {TOPIC_LABEL[t]} <span aria-hidden="true">{on ? <IconCheck size={13} /> : <IconPlus size={13} />}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button className={x.skip} onClick={() => close(() => onDone([]))}>Skip for now</button>
        </>
      )}
    </Sheet>
  );
}

/** A public collection by id, for pages that hold only the id. */
export const pcOf = (id: string) => publicCollection(id);
