"use client";

import { useState, type ReactNode } from "react";
import { chatIdentity, initials } from "@/lib/chat/avatar";
import { Emoji } from "@/lib/chat/emoji";
import { patchBlock, rootItems, sharedItems, startShareDraft, useMind, type Block, type ShareRole, type Sharing } from "@/lib/chat/mind";
import { allPeople, usePeopleVersion } from "@/lib/chat/people";
import {
  accessOf, answerRequest, audienceLabel, cloneCollection, copyAllowed, copyIn, copyItem, grant, refOf, requestAccess, setRole as setPersonRole,
  resolveShare, sharedWithYou, shareLink, sharingOf, updateSharing, withdrawRequest,
  type Access, type Shared, type ShareRef,
} from "@/lib/chat/share";
import { useChat, userById } from "@/lib/chat/store";
import type { Card, Chat, Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconBack, IconCheck, IconClose, IconCopy, IconEdit, IconFilter, IconGlobe, IconLink, IconMail, IconPadlock, IconMessage, IconSearch, IconShare } from "./Icons";
import { BlockEditor, KIND_EMOJI, MindEditor, toggleItem } from "./Mind";
import { BlockView, KIND_LABEL, toneFor } from "./MindBlocks";
import { FilterBar, FilterMenu, isFiltering, NO_FILTER, passes, type MindFilter } from "./MindFilter";
import { Segmented, Sheet, Toggle, useChatUi } from "./ui";
import styles from "./chat.module.css";
import x from "./explore.module.css";
import sh from "./share.module.css";

/**
 * Sharing from Mind, Drive-style: the share sheet (people, each who can view
 * or edit, or anyone with the link, and whether they may make a copy), the
 * send sheet that puts it in a chat, the card it becomes there, and what the
 * people it's shared with open: the collection's page or the item's sheet.
 */

type MindCard = Extract<Card, { type: "mind" }>;

const ROLES: { id: ShareRole; label: string }[] = [{ id: "view", label: "Can view" }, { id: "edit", label: "Can edit" }];
const roleLabel = (a: Access) => (a === "owner" ? "Yours" : a === "edit" ? "Can edit" : a === "view" ? "Can view" : "No access");
/** "Alae’s", or "your" for your own. */
const possessive = (owner: string, me: string) => (owner === me ? "your" : `${userById(owner).name}’s`);
const nameOf = (id: string) => userById(id).name;

/** What a share is: its icon, its name, its kind, what's in it. */
function describe(s: Shared) {
  if (s.block) return { emoji: KIND_EMOJI[s.block.kind] ?? "📌", title: s.block.title || KIND_LABEL[s.block.kind], kind: KIND_LABEL[s.block.kind], meta: `In ${s.collection.emoji} ${s.collection.name}` };
  const items = sharedItems(s.mind, s.collection).length;
    return {
    emoji: s.collection.emoji, title: s.collection.name, kind: "Collection",
    meta: `${items} ${items === 1 ? "item" : "items"}`,
  };
}

/** Two choices in a pill, small enough to sit at the end of a row. */
function MiniRole({ value, onChange, label }: { value: ShareRole; onChange: (r: ShareRole) => void; label: string }) {
  return (
    <span className={sh.mini} role="radiogroup" aria-label={label}>
      {(["view", "edit"] as const).map((r) => (
        <button key={r} type="button" role="radio" aria-checked={value === r} className={value === r ? sh.miniOn : undefined} onClick={() => onChange(r)}>
          {r === "view" ? "View" : "Edit"}
        </button>
      ))}
    </span>
  );
}

/* ===========================================================================
   The share sheet: who has access, and how
   =========================================================================== */

/**
 * Like Drive's share dialog. Add people by name, @username, number or email,
 * each able to view or edit; or open it to anyone with the link. Requests
 * from people who asked for access wait at the top. Then copy the link, or
 * send it in a chat.
 */
export function ShareSheet({ share, onClose, onSend }: { share: ShareRef; onClose: () => void; onSend: () => void }) {
  usePeopleVersion();
  const { mind } = useMind(share.owner);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<ShareRole>("view");
  const [copied, setCopied] = useState(false);
  const s = resolveShare(mind, share);
  if (!s) return null;
  const sharing = sharingOf(s);
  const what = describe(s);
  const set = (fn: (v: Sharing) => Sharing) => updateSharing(share, fn);

  const query = q.trim().toLowerCase().replace(/^@/, "");
  const digits = (v: string) => v.replace(/\D/g, "");
  const found = query ? allPeople().filter((u) => u.id !== share.owner && !sharing.people[u.id] && (
    u.fullName.toLowerCase().includes(query) || (u.username ?? "").toLowerCase().includes(query)
    || (digits(query).length >= 3 && digits(u.phone ?? "").includes(digits(query)))
  )).slice(0, 5) : [];
  const email = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(q.trim()) && !sharing.emails[q.trim().toLowerCase()] ? q.trim().toLowerCase() : null;
  const setPerson = (id: string, r: ShareRole | null) => setPersonRole(share, id, r);
  const setEmail = (e: string, r: ShareRole | null) => set((v) => {
    const emails = { ...v.emails };
    if (r) emails[e] = r; else delete emails[e];
    return { ...v, emails };
  });
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink(share)); } catch { return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const people = Object.entries(sharing.people).sort(([a], [b]) => nameOf(a).localeCompare(nameOf(b)));
  const emails = Object.entries(sharing.emails);
  const owner = userById(share.owner);

  return (
    <Sheet title="Share" onClose={onClose} action={{ label: "Done", onClick: () => {} }}>
      {(close) => (
        <>
          <div className={sh.what}>
            <span className={sh.whatIcon} style={{ ["--tone" as string]: s.collection.tone }}><Emoji char={what.emoji} /></span>
            <span className={sh.whatText}><b>{what.title}</b><small>{what.kind} · {what.meta}</small></span>
          </div>

          <div className={sh.field}>
            <IconSearch size={18} />
            <input
              data-autofocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && email) { setEmail(email, role); setQ(""); } }}
              placeholder="Name, @username or email"
              aria-label="Add people"
              autoComplete="off"
            />
            {q && <button type="button" className={sh.clear} onClick={() => setQ("")} aria-label="Clear"><IconClose size={12} /></button>}
          </div>
          {(found.length > 0 || email) && (
            <div className={sh.list}>
              {found.map((u) => (
                <button key={u.id} type="button" className={sh.row} onClick={() => { setPerson(u.id, role); setQ(""); }}>
                  <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={34} shape="circle" />
                  <span className={sh.rowText}><b>{u.fullName}</b><small>{u.username ? `@${u.username}` : "On NOD"}</small></span>
                  <span className={sh.addPill}>Add</span>
                </button>
              ))}
              {email && (
                <button type="button" className={sh.row} onClick={() => { setEmail(email, role); setQ(""); }}>
                  <span className={sh.mailIcon}><IconMail size={17} /></span>
                  <span className={sh.rowText}><b>{email}</b><small>Not on NOD yet: they get access when they join</small></span>
                  <span className={sh.addPill}>Invite</span>
                </button>
              )}
              <div className={sh.addAs}><span>They can</span><Segmented value={role} options={ROLES} onChange={setRole} /></div>
            </div>
          )}

          {sharing.requests.length > 0 && (
            <>
              <p className={styles.sheetLabel}>Asking for access</p>
              <div className={sh.list}>
                {sharing.requests.map((r) => {
                  const u = userById(r.userId);
                  return (
                    <div key={r.userId} className={sh.row}>
                      <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={34} shape="circle" />
                      <span className={sh.rowText}><b>{u.fullName}</b><small>Wants to {r.role === "edit" ? "edit" : "view"}</small></span>
                      <button type="button" className={sh.quiet} onClick={() => answerRequest(share, r.userId, false)}>Decline</button>
                      <button type="button" className={sh.addPill} onClick={() => answerRequest(share, r.userId, true)}>Allow</button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <p className={styles.sheetLabel}>People with access</p>
          <div className={sh.list}>
            <div className={sh.row}>
              <Avatar glyph={initials(owner.fullName)} tone={owner.tone} photo={owner.photo} size={34} shape="circle" />
              <span className={sh.rowText}><b>{owner.fullName} (you)</b><small>{owner.username ? `@${owner.username}` : "Owner"}</small></span>
              <span className={sh.ownerTag}>Owner</span>
            </div>
            {people.map(([id, r]) => {
              const u = userById(id);
              return (
                <div key={id} className={sh.row}>
                  <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={34} shape="circle" />
                  <span className={sh.rowText}><b>{u.fullName}</b><small>{r === "edit" ? "Can edit" : "Can view"}</small></span>
                  <MiniRole value={r} onChange={(v) => setPerson(id, v)} label={`What ${u.name} can do`} />
                  <button type="button" className={sh.remove} onClick={() => setPerson(id, null)} aria-label={`Remove ${u.name}`}><IconClose size={12} /></button>
                </div>
              );
            })}
            {emails.map(([e, r]) => (
              <div key={e} className={sh.row}>
                <span className={sh.mailIcon}><IconMail size={17} /></span>
                <span className={sh.rowText}><b>{e}</b><small>Invited · not on NOD yet</small></span>
                <MiniRole value={r} onChange={(v) => setEmail(e, v)} label={`What ${e} can do`} />
                <button type="button" className={sh.remove} onClick={() => setEmail(e, null)} aria-label={`Remove ${e}`}><IconClose size={12} /></button>
              </div>
            ))}
          </div>

          <p className={styles.sheetLabel}>General access</p>
          <div className={sh.access}>
            <Segmented
              value={sharing.link === "off" ? "off" : "on"}
              options={[{ id: "off", label: "Restricted" }, { id: "on", label: "Anyone with the link" }]}
              onChange={(v) => set((s0) => ({ ...s0, link: v === "off" ? "off" : s0.link === "off" ? "view" : s0.link }))}
            />
            <div className={sh.accessLine}>
              <span className={sh.accessIcon}>{sharing.link === "off" ? <IconPadlock size={17} /> : <IconGlobe size={17} />}</span>
              <span className={sh.rowText}>
                <b>{sharing.link === "off" ? "Only people with access" : "Anyone on NOD with the link"}</b>
                <small>{sharing.link === "off" ? "Others who get the link can ask you for access." : "That includes everyone in a chat you send it to."}</small>
              </span>
              {sharing.link !== "off" && <MiniRole value={sharing.link} onChange={(v) => set((s0) => ({ ...s0, link: v }))} label="What anyone with the link can do" />}
            </div>
          </div>
          <div className={styles.mindField}>
            <span>{s.block ? "Let people save a copy" : "Let people make a copy"}</span>
            <Toggle on={sharing.copy} onChange={(v) => set((s0) => ({ ...s0, copy: v }))} label="Let people make a copy" />
          </div>

          <div className={sh.buttons}>
            <button type="button" className={sh.btn} onClick={() => { void copyLink(); }}>
              {copied ? <IconCheck size={17} /> : <IconLink size={17} />}{copied ? "Link copied" : "Copy link"}
            </button>
            <button type="button" className={`${sh.btn} ${sh.btnPrimary}`} onClick={() => close(onSend)}>
              <IconMessage size={17} />Send in a chat
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/* ===========================================================================
   Sending it into a chat
   =========================================================================== */

/**
 * Pick a chat (most recent first), add a line if you like, and send. Anyone
 * in that chat who couldn't open it yet gets access as you choose, the way
 * Drive asks "give access?" when you share a link with someone who has none.
 */
export function SendSheet({ share, onClose, onSent }: { share: ShareRef; onClose: () => void; onSent: (text: string) => void }) {
  const { me, state, send, sendCard } = useChat();
  const { mind } = useMind(share.owner);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [role, setRole] = useState<ShareRole>("view");
  const s = resolveShare(mind, share);
  if (!s) return null;
  const what = describe(s);
  const lastAt = (c: Chat) => state.data.messages[c.id]?.at(-1)?.createdAt ?? 0;
  const label = (c: Chat) => chatIdentity(c, me, userById).label;
  // Your DMs and groups (a group's own chat, not each channel), most recent first.
  const chats = state.data.chats
    .filter((c) => c.memberIds.includes(me) && c.memberIds.length > 1 && !c.removedAt && !c.groupId)
    .sort((a, b) => lastAt(b) - lastAt(a));
  const shown = chats.filter((c) => !q.trim() || label(c).toLowerCase().includes(q.trim().toLowerCase()));
  const chat = chats.find((c) => c.id === pick) ?? null;
  const lacking = chat ? chat.memberIds.filter((id) => id !== me && !accessOf(share, s, id)) : [];
  const who = chat?.kind === "dm" ? label(chat).split(" ")[0] : `${lacking.length} ${lacking.length === 1 ? "person" : "people"} in ${chat?.name}`;

  const go = () => {
    if (!chat) return;
    if (lacking.length) grant(share, lacking, role);
    if (text.trim()) send(chat.id, text.trim());
    const card: MindCard = { type: "mind", owner: share.owner, collectionId: s.collection.id, blockId: s.block?.id, title: what.title, emoji: what.emoji };
    sendCard(chat.id, card, `${what.kind}: ${what.title}`);
    onSent(`Sent to ${label(chat)}`);
  };

  return (
    <Sheet title="Send in a chat" onClose={onClose} action={{ label: "Send", disabled: !chat, onClick: go }}>
      <div className={sh.what}>
        <span className={sh.whatIcon} style={{ ["--tone" as string]: s.collection.tone }}><Emoji char={what.emoji} /></span>
        <span className={sh.whatText}><b>{what.title}</b><small>{what.kind} · {what.meta}</small></span>
      </div>
      <div className={sh.field}>
        <IconSearch size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" autoComplete="off" />
      </div>
      <div className={sh.list} role="radiogroup" aria-label="Chats">
        {shown.map((c) => {
          const id = chatIdentity(c, me, userById);
          const on = c.id === pick;
          return (
            <button key={c.id} type="button" role="radio" aria-checked={on} className={`${sh.row} ${on ? sh.rowOn : ""}`} onClick={() => setPick(on ? null : c.id)}>
              <Avatar glyph={id.glyph} tone={id.tone} photo={id.photo} size={36} shape={c.kind === "dm" ? "circle" : "square"} />
              <span className={sh.rowText}><b>{id.label}</b><small>{c.kind === "dm" ? "Direct message" : `${c.memberIds.length} members`}</small></span>
              <span className={`${sh.check} ${on ? sh.checkOn : ""}`} aria-hidden="true">{on && <IconCheck size={12} />}</span>
            </button>
          );
        })}
        {!shown.length && <p className={sh.note}>No chats match “{q.trim()}”.</p>}
      </div>
      {chat && (
        <>
          <input className={styles.plainInput} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a message (optional)" aria-label="Add a message" />
          {lacking.length > 0 ? (
            <div className={sh.access}>
              <div className={sh.accessLine}>
                <span className={sh.accessIcon}><IconPadlock size={17} /></span>
                <span className={sh.rowText}><b>Give {who} access</b><small>Without it, they’d only see a request button.</small></span>
              </div>
              <Segmented value={role} options={ROLES} onChange={setRole} />
            </div>
          ) : (
            <p className={sh.note}>{chat.kind === "dm" ? `${label(chat).split(" ")[0]} can already open it.` : "Everyone in this chat can already open it."}</p>
          )}
        </>
      )}
    </Sheet>
  );
}

/* ===========================================================================
   The card in a chat
   =========================================================================== */

/** Items that read best wide in a card (a photo, a video, a palette, words); the rest sit in a row. */
const WIDE: Block["kind"][] = ["image", "video", "palette", "quote", "note", "flashcard"];

const pictured = (b: Block) => !!b.image && (b.kind === "image" || b.kind === "book" || b.kind === "video");

/** Four things from a collection: pictures first (covers, photos, stills), then one of each other kind. */
function Peek({ s }: { s: Shared }) {
  const all = sharedItems(s.mind, s.collection).filter((b) => b.kind !== "chat").sort((a, b) => b.createdAt - a.createdAt);
  const kinds = new Set<string>();
  const others = all.filter((b) => !pictured(b) && !kinds.has(b.kind) && kinds.add(b.kind));
  const items = [...all.filter(pictured), ...others].slice(0, 4);
  if (!items.length) return null;
  return (
    <span className={sh.peek} aria-hidden="true">
      {items.map((b) => (
        <span key={b.id} className={sh.peekTile} style={{ ["--c" as string]: toneFor(b.title) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {pictured(b) ? <img src={b.image} alt="" loading="lazy" /> : <Emoji char={KIND_EMOJI[b.kind] ?? "📌"} />}
        </span>
      ))}
    </span>
  );
}

/**
 * A collection or an item shared from someone's Mind. It reads the original
 * live: changes show here, and so does access being given or taken away.
 * Without access it says so and offers to ask; once it's gone it says that.
 */
export function MindShareCard({ card, interactive }: { message: Message; card: MindCard; interactive: boolean }) {
  const { me } = useChat();
  const ui = useChatUi();
  const { mind } = useMind(card.owner);
  const { mind: mine } = useMind(me);
  const ref = refOf(card);
  const s = resolveShare(mind, ref);
  const access = s ? accessOf(ref, s, me) : null;
  const sharing = s ? sharingOf(s) : null;
  const requested = !!sharing?.requests.some((r) => r.userId === me);
  const whose = possessive(card.owner, me);
  const kind = card.blockId ? (s?.block ? KIND_LABEL[s.block.kind] : "Item") : "Collection";
  const kicker = <p className={styles.cardKicker}><span><Emoji char={card.blockId ? KIND_EMOJI[s?.block?.kind ?? "note"] ?? "📌" : "🗂️"} /> {kind}</span><span>From {whose} Mind</span></p>;
  const open = (saving = false) => ui.openSheet(card.blockId
    ? <SharedItemSheet share={ref} onClose={ui.closeSheet} onToast={ui.toast} saving={saving} />
    : <SharedPage share={ref} onClose={ui.closeSheet} onToast={ui.toast} />);
  const head = (sub: ReactNode, tone?: string) => (
    <div className={sh.head}>
      <span className={sh.icon} style={tone ? { ["--tone" as string]: tone } : undefined}><Emoji char={card.emoji} /></span>
      <span className={sh.headText}><b className={styles.cardTitle}>{card.title}</b><span className={styles.cardSub}>{sub}</span></span>
    </div>
  );

  if (!s) {
    return <div className={`${styles.card} ${sh.card} ${sh.cardGone}`}>{kicker}{head(`No longer in ${whose} Mind`)}</div>;
  }
  if (!access) {
    return (
      <div className={`${styles.card} ${sh.card}`}>
        {kicker}
        {head(<><IconPadlock size={13} /> {userById(card.owner).name} hasn’t given you access</>)}
        {interactive && (
          <div className={sh.actions}>
            {requested ? (
              <>
                <span className={sh.waiting}>Request sent</span>
                <button className={styles.pillBtn} onClick={() => withdrawRequest(ref, me)}>Withdraw</button>
              </>
            ) : <button className={`${styles.pillBtn} ${sh.primary}`} onClick={() => requestAccess(ref, me, "view")}>Request access</button>}
          </div>
        )}
      </div>
    );
  }

  const what = describe(s);
  const copied = !card.blockId && copyIn(mine, ref);
  const canCopy = access !== "owner" && copyAllowed(s);
  const owner = access === "owner";
  const settings = () => ui.openSheet(
    <ShareSheet share={ref} onClose={ui.closeSheet} onSend={() => ui.openSheet(<SendSheet share={ref} onClose={ui.closeSheet} onSent={ui.toast} />)} />,
  );
  const edit = () => {
    const key = startShareDraft(card.owner, s.collection.id, me);
    ui.openSheet(
      <MindEditor
        source={key}
        title={s.collection.name}
        note={`Editing ${userById(card.owner).name}’s collection`}
        shared={{ owner: card.owner, collectionId: s.collection.id }}
        onClose={ui.closeSheet}
        onSaved={() => ui.toast(`Saved for ${userById(card.owner).name}`)}
      />,
    );
  };

  return (
    <div className={`${styles.card} ${sh.card}`}>
      {kicker}
      {s.block ? (
        <div role="button" tabIndex={interactive ? 0 : -1} className={sh.itemFrame} onClick={() => interactive && open()} onKeyDown={(e) => { if (interactive && e.key === "Enter") open(); }} aria-label={`Open ${what.title}`}>
          <BlockView block={s.block} shape={WIDE.includes(s.block.kind) ? "tile" : "row"} />
        </div>
      ) : (
        <>
          {head(what.meta, s.collection.tone)}
          <Peek s={s} />
        </>
      )}
      <div className={sh.foot}>
        <span className={`${sh.role} ${access === "edit" || owner ? sh.roleEdit : ""}`}>{owner ? audienceLabel(sharingOf(s), nameOf) : roleLabel(access)}</span>
      </div>
      {interactive && (
        <div className={sh.actions}>
          <button className={`${styles.pillBtn} ${sh.primary}`} onClick={() => open()}>Open</button>
          {access === "edit" && !s.block && <button className={styles.pillBtn} onClick={edit}><IconEdit size={14} /> Edit</button>}
          {canCopy && (s.block
            ? <button className={styles.pillBtn} onClick={() => open(true)}><IconCopy size={14} /> Save a copy</button>
            : copied ? <span className={sh.waiting}><IconCheck size={13} /> In your Mind</span>
            : <button className={styles.pillBtn} onClick={() => { const c = cloneCollection(ref, me); if (c) ui.toast(`A copy is in your Mind: ${c.emoji} ${c.name}`); }}><IconCopy size={14} /> Make a copy</button>)}
          {owner && <button className={styles.pillBtn} onClick={settings}><IconShare size={14} /> Sharing</button>}
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
   What people it's shared with open: a collection's page, an item's sheet
   =========================================================================== */

/** Asking for access, or waiting for it: the same block wherever access is missing. */
function NoAccess({ share, me }: { share: ShareRef; me: string }) {
  const { mind } = useMind(share.owner);
  const s = resolveShare(mind, share);
  const requested = s ? sharingOf(s).requests.find((r) => r.userId === me) : undefined;
  const owner = userById(share.owner).name;
  if (!s) {
    return (
      <div className={styles.accessSheet}>
        <span className={styles.accessIcon}><IconClose size={22} /></span>
        <b>It’s not there any more</b>
        <p>{owner} removed it from their Mind, or moved it somewhere you can’t see.</p>
      </div>
    );
  }
  return (
    <div className={styles.accessSheet}>
      <span className={styles.accessIcon}><IconPadlock size={22} /></span>
      <b>You need access</b>
      <p>{owner} hasn’t shared this with you. Ask, and you can open it once they say yes.</p>
      {requested ? (
        <>
          <p className={styles.pendingNote}>You asked to {requested.role === "edit" ? "edit" : "view"}. {owner} hasn’t answered yet.</p>
          <button className={styles.secondaryWide} onClick={() => withdrawRequest(share, me)}>Withdraw request</button>
        </>
      ) : (
        <>
          <button className={styles.primaryWide} onClick={() => requestAccess(share, me, "view")}>Ask to view</button>
          <button className={styles.secondaryWide} onClick={() => requestAccess(share, me, "edit")}>Ask to edit</button>
        </>
      )}
    </div>
  );
}

/**
 * A collection shared with you, read-only, laid out like a collection on
 * Explore: everything in it in one grid, with the same Filter (by tag, by
 * when it changed, by kind) as your own collections. Edit opens the full Mind
 * editor on a copy when you may edit; Make a copy puts your own copy in your
 * Mind when the owner allows it.
 */
export function SharedPage({ share, onClose, onToast }: { share: ShareRef; onClose: () => void; onToast: (t: string) => void }) {
  const { me } = useChat();
  const { mind } = useMind(share.owner);
  const { mind: mine } = useMind(me);
  const [sheet, setSheet] = useState<ReactNode>(null);
  const [leaving, setLeaving] = useState(false);
  const [filter, setFilter] = useState<MindFilter>(NO_FILTER);
  const s = resolveShare(mind, share);
  const access = s ? accessOf(share, s, me) : null;
  const owner = userById(share.owner);
  const back = () => { setLeaving(true); setTimeout(onClose, 220); };
  const closeSheet = () => setSheet(null);
  const tone = s?.collection.tone ?? "#3E67A6";

  const body = () => {
    if (!s || !access) return <NoAccess share={share} me={me} />;
    const col = s.collection;
    const sharing = sharingOf(s);
    const copied = copyIn(mine, share);
    const asked = sharing.requests.find((r) => r.userId === me && r.role === "edit");
    const shown = rootItems(s.mind, col).filter((b) => passes(filter, b));
    const openItem = (b: Block) => setSheet(<SharedItemSheet share={{ owner: share.owner, collectionId: col.id, blockId: b.id }} onClose={closeSheet} onToast={onToast} />);
    const edit = () => {
      const key = startShareDraft(share.owner, col.id, me);
      setSheet(
        <MindEditor
          source={key}
          title={col.name}
          note={`Editing ${owner.name}’s collection`}
          shared={{ owner: share.owner, collectionId: col.id }}
          onClose={closeSheet}
          onSaved={() => onToast(`Saved for ${owner.name}`)}
        />,
      );
    };
    const settings = () => setSheet(<ShareSheet share={share} onClose={closeSheet} onSend={() => setSheet(<SendSheet share={share} onClose={closeSheet} onSent={onToast} />)} />);
    // A save from a chat shows its message only to people in that chat (see LiveChatBlock).
    const tile = (b: Block) => (
      <div key={b.id} className={x.item}>
        <div role="button" tabIndex={0} className={`${x.itemMain} ${sh.itemFrame}`} onClick={() => openItem(b)} onKeyDown={(e) => { if (e.key === "Enter") openItem(b); }}>
          <BlockView block={b} shape="tile" />
        </div>
      </div>
    );
    const total = sharedItems(s.mind, col).length;
    return (
      <>
        <div className={x.pageCover} style={{ backgroundImage: `linear-gradient(160deg, color-mix(in srgb, ${tone} 62%, #fff), ${tone})` }} />
        <div className={x.pageHead}>
          <span className={x.pageEmoji}><Emoji char={col.emoji} /></span>
          <h2>{col.name}</h2>
          <span className={x.byline}>
            <Avatar glyph={initials(owner.fullName)} tone={owner.tone} photo={owner.photo} size={18} shape="circle" />
            <span>{access === "owner" ? "Your collection" : `${owner.name}’s collection`} · {total} {total === 1 ? "item" : "items"}</span>
          </span>
          <span className={sh.pageAccess}>
            <span className={`${sh.role} ${access === "view" ? "" : sh.roleEdit}`}>{access === "owner" ? audienceLabel(sharing, nameOf) : roleLabel(access)}</span>
            {access === "view" && (asked
              ? <span className={sh.note}>You asked to edit</span>
              : <button type="button" className={sh.link} onClick={() => requestAccess(share, me, "edit")}>Ask {owner.name} to edit</button>)}
          </span>
          <div className={sh.pageActions}>
            {access === "owner" && <button className={`${x.addPill} ${x.addPillBar}`} onClick={settings}><IconShare size={15} /> Sharing</button>}
            {access === "edit" && <button className={`${x.addPill} ${x.addPillBar}`} onClick={edit}><IconEdit size={15} /> Edit</button>}
            {access !== "owner" && copyAllowed(s) && (copied
              ? <button className={`${x.addPill} ${x.addPillBar}`} disabled><IconCheck size={13} /> In your Mind</button>
              : <button className={`${x.addPill} ${x.addPillBar} ${access === "edit" ? sh.second : ""}`} onClick={() => { const c = cloneCollection(share, me); if (c) onToast(`A copy is in your Mind: ${c.emoji} ${c.name}`); }}><IconCopy size={15} /> Make a copy</button>)}
          </div>
          {access !== "owner" && <small className={x.pageHint}>{access === "edit" ? `What you change shows for ${owner.name} and everyone it’s shared with.` : `It stays ${owner.name}’s: you’re seeing it as it is now.`}{copyAllowed(s) ? " A copy is yours to change." : ""}</small>}
        </div>
        <div className={sh.filterBar}><FilterBar filter={filter} onChange={setFilter} /></div>
        {shown.length > 0 && <div className={`${x.masonry} ${sh.flatGrid}`}>{shown.map(tile)}</div>}
        {total > 0 && !shown.length && <p className={sh.note}>Nothing in {col.name} matches the filter.</p>}
        {!total && <p className={sh.note}>Nothing in here yet.</p>}
      </>
    );
  };

  return (
    <div className={`${styles.screen} ${styles.chatScreen} ${x.page} ${leaving ? styles.leaving : ""}`} style={{ ["--tone" as string]: tone }}>
      <header className={x.pageBar}>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={back} aria-label="Back"><IconBack /></button>
        <b>{s && access ? s.collection.name : "Shared"}</b>
        {s && access ? (
          <button
            className={`${styles.circleBtn} ${styles.glass} ${isFiltering(filter) ? sh.filterOn : ""}`}
            onClick={(e) => setSheet(<FilterMenu anchor={e.currentTarget} items={rootItems(s.mind, s.collection)} filter={filter} onChange={setFilter} onClose={closeSheet} />)}
            aria-label={isFiltering(filter) ? "Filter, on" : "Filter"}
            aria-haspopup="menu"
          >
            <IconFilter />
          </button>
        ) : <span />}
      </header>
      <div className={x.pageScroll}>{body()}</div>
      {sheet}
    </div>
  );
}

/**
 * One shared item. People who may edit get the same controls as their own
 * items (a shelf, a status, the palette maker…), saved to the owner's Mind;
 * everyone else sees it in detail. Either can save a copy into one of their
 * collections when the owner allows it.
 */
export function SharedItemSheet({ share, onClose, onToast, saving: startSaving = false }: { share: ShareRef; onClose: () => void; onToast: (t: string) => void; saving?: boolean }) {
  const { me } = useChat();
  const { mind, update } = useMind(share.owner);
  const { mind: mine } = useMind(me);
  const [saving, setSaving] = useState(startSaving);
  const s = resolveShare(mind, share);
  const access = s ? accessOf(share, s, me) : null;
  const b = s?.block ?? null;
  const owner = userById(share.owner).name;
  const title = b ? `${KIND_LABEL[b.kind]} · ${share.owner === me ? "Yours" : `${owner}’s`}` : "Shared";
  const action = b?.url && access ? { label: "Open", href: b.url, onClick: () => {} } : undefined;
  const yours = (mine?.collections ?? []).filter((c) => c.from?.id !== "shared-with-you");

  return (
    <Sheet title={title} onClose={onClose} action={action}>
      {(close) => (!s || !b || !access ? <NoAccess share={share} me={me} /> : (
        <>
          {access === "edit" || access === "owner"
            ? <BlockEditor b={b} set={(patch) => update((m) => patchBlock(m, b.id, patch))} onToggle={() => toggleItem(update, b)} />
            : <div className={styles.mindDetail}><BlockView block={b} shape="detail" autoPlay /></div>}
          <p className={sh.note}>
            {access === "owner" ? "Yours. People you shared it with see it as it is now."
              : access === "edit" ? `You can edit this: what you change shows for ${owner} too.`
              : `You can view this. It stays ${owner}’s.`}
          </p>
          {access !== "owner" && copyAllowed(s) && (saving ? (
            <>
              <p className={styles.sheetLabel}>Save a copy to</p>
              <div className={styles.chipGrid}>
                {yours.map((c) => (
                  <button key={c.id} className={styles.choice} onClick={() => close(() => { copyItem(share, me, c.id); onToast(`Saved to ${c.emoji} ${c.name}`); })}>
                    <Emoji char={c.emoji} /> {c.name}
                  </button>
                ))}
                <button className={styles.choice} onClick={() => close(() => { copyItem(share, me, sharedWithYou(me)); onToast("Saved to 📥 Shared with you"); })}>
                  <Emoji char="📥" /> Shared with you
                </button>
              </div>
            </>
          ) : <button className={styles.secondaryWide} onClick={() => setSaving(true)}>Save a copy to my Mind</button>)}
        </>
      ))}
    </Sheet>
  );
}

/**
 * Opened from a link (?mind=…): the page or the item sheet over whatever is
 * on screen, with its own toast. It stays a moment after closing so a
 * "Saved to…" toast can finish.
 */
export function SharedLink({ share, onClose }: { share: ShareRef; onClose: () => void }) {
  const [shown, setShown] = useState(true);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const flash = (text: string) => {
    const id = Math.random();
    setToast({ text, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2200);
  };
  const done = () => { setShown(false); setTimeout(onClose, 2300); };
  return (
    <>
      {shown && (share.blockId
        ? <SharedItemSheet share={share} onClose={done} onToast={flash} />
        : <SharedPage share={share} onClose={done} onToast={flash} />)}
      {toast && <div key={toast.id} className={`${styles.toast} ${styles.glassStrong} ${sh.linkToast}`} role="status">{toast.text}</div>}
    </>
  );
}
