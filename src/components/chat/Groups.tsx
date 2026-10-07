"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { initials, TONES } from "@/lib/chat/avatar";
import { getPrefs } from "@/lib/chat/account";
import {
  ADMIN, can, canManage, cancelInvite, channelName, deleteChannel, deleteRole, groupInfo, isAdmin, MEMBER, moveChannel,
  newChannelId, newRoleId, PERMISSIONS, removeMember, ROLE_TONES, roleNames, rolesOf, setMemberRoles, upsertChannel,
  upsertRole,
} from "@/lib/chat/groups";
import { describe, isQuiet, ruleFor, useMutes } from "@/lib/chat/mutes";
import { allPeople } from "@/lib/chat/people";
import { useChat, userById } from "@/lib/chat/store";
import type { AvatarTone, Chat, GroupChannel, GroupPermission, GroupRole } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { DragScroll } from "./Composer";
import { MuteSheet } from "./Mute";
import {
  IconBack, IconBell, IconCamera, IconCheck, IconChevron, IconCopy, IconLock, IconLogout, IconPlus, IconSearch, IconTrash, IconUserAdd,
  IconUserGroup,
} from "./Icons";
import { QrPattern } from "./Invite";
import { squarePhoto } from "./Profile";
import { Group, Row, SubPage, Tile } from "./Settings";
import StatusBar from "./StatusBar";
import { Segmented, Sheet, Toggle, useNow } from "./ui";
import styles from "./chat.module.css";
import a from "./account.module.css";
import g from "./groups.module.css";

/**
 * Groups: making one, its channels (chips under the chat header), roles and
 * permissions, invitations, and its settings. The rules themselves live in
 * lib/chat/groups.ts; everything here reads the live group from the store.
 */

const TONE_NAMES: Record<AvatarTone, string> = { clay: "Clay", sage: "Sage", ochre: "Ochre", denim: "Denim", plum: "Plum", graphite: "Graphite" };
const COVERS = [
  "photo-1522071820081-009f0129c71c",
  "photo-1497366216548-37526070297c",
  "photo-1506905925346-21bda4d32df4",
  "photo-1516550893923-42d28e5677af",
].map((q) => `https://images.unsplash.com/${q}?w=900&q=70&fm=jpg`);

/** A photo cropped to a wide 5:2 band and shrunk, as a small JPEG data URL. */
async function coverPhoto(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const w = 900, h = 360;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / scale, sh = h / scale;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.78);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The live group (and its info) for an id, or null once it's gone. */
function useGroup(groupId: string) {
  const { state } = useChat();
  const group = state.data.chats.find((c) => c.id === groupId && !c.removedAt) ?? null;
  return group ? { group, info: groupInfo(group) } : null;
}

/* ===========================================================================
   The look: cover, picture, name, description, colour
   =========================================================================== */

export interface Look { name: string; description: string; tone: AvatarTone; photo?: string; cover?: string }

/** The group's header: its cover (or a wash of its colour), picture, name and description. */
export function GroupBanner({ look, compact, children }: { look: Look; compact?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`${g.banner} ${compact ? g.bannerCompact : ""}`} style={{ ["--tone" as string]: TONES[look.tone] }}>
      <div className={g.cover} style={look.cover ? { backgroundImage: `url(${look.cover})` } : undefined} />
      <div className={g.bannerBody}>
        <span className={g.bannerAvatar}>
          <Avatar glyph={initials(look.name || "Group")} tone={look.tone} photo={look.photo} size={compact ? 56 : 76} />
        </span>
        <b className={g.bannerName}>{look.name || "Group name"}</b>
        {look.description && <p className={g.bannerDesc}>{look.description}</p>}
        {children}
      </div>
    </div>
  );
}

function LookFields({ look, onChange }: { look: Look; onChange: (patch: Partial<Look>) => void }) {
  const photoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  return (
    <div className={g.look}>
      <div className={g.lookPreview}>
        <GroupBanner look={look} />
        <button className={g.coverBtn} onClick={() => coverRef.current?.click()}><IconCamera size={14} /> Cover</button>
        <button className={g.photoBtn} onClick={() => photoRef.current?.click()} aria-label={look.photo ? "Change picture" : "Add a picture"}>
          <IconCamera size={15} />
        </button>
      </div>
      <input ref={photoRef} type="file" accept="image/*" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) { const photo = await squarePhoto(f); if (photo) onChange({ photo }); }
      }} />
      <input ref={coverRef} type="file" accept="image/*" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) { const cover = await coverPhoto(f); if (cover) onChange({ cover }); }
      }} />
      {look.photo && <button className={`${a.textBtn} ${g.removePhoto}`} onClick={() => onChange({ photo: undefined })}>Remove picture</button>}

      <div className={a.fields}>
        <label className={a.field}>
          <span>Name</span>
          <input value={look.name} onChange={(e) => onChange({ name: e.target.value.slice(0, 40) })} placeholder="e.g. Launch crew" data-autofocus />
        </label>
        <label className={a.field}>
          <span>Description</span>
          <textarea value={look.description} onChange={(e) => onChange({ description: e.target.value.slice(0, 140) })} placeholder="What's this group for?" rows={2} />
          <em className={a.counter}>{140 - look.description.length}</em>
        </label>
      </div>

      <p className={styles.sheetLabel}>Colour</p>
      <div className={a.tones} role="radiogroup" aria-label="Colour">
        {(Object.keys(TONES) as AvatarTone[]).map((t) => (
          <button key={t} role="radio" aria-checked={look.tone === t} aria-label={TONE_NAMES[t]} className={look.tone === t ? a.toneOn : undefined} style={{ background: TONES[t] }} onClick={() => onChange({ tone: t })}>
            {look.tone === t && <IconCheck size={12} />}
          </button>
        ))}
      </div>

      <p className={styles.sheetLabel}>Cover</p>
      <div className={g.covers}>
        <button className={g.coverUpload} onClick={() => coverRef.current?.click()} aria-label="Upload a cover"><IconCamera size={18} /></button>
        <button className={`${g.coverPick} ${!look.cover ? g.coverOn : ""}`} style={{ background: TONES[look.tone] }} onClick={() => onChange({ cover: undefined })} aria-label="Just the colour" />
        {COVERS.map((c) => (
          <button key={c} className={`${g.coverPick} ${look.cover === c ? g.coverOn : ""}`} style={{ backgroundImage: `url(${c})` }} onClick={() => onChange({ cover: c })} aria-label="Sample cover" />
        ))}
        {look.cover && !COVERS.includes(look.cover) && <span className={`${g.coverPick} ${g.coverOn}`} style={{ backgroundImage: `url(${look.cover})` }} />}
      </div>
    </div>
  );
}

/* ===========================================================================
   Picking people (making a group, inviting more)
   =========================================================================== */

function PeoplePicker({ exclude, invited = [], selected, onToggle }: { exclude: string[]; invited?: string[]; selected: string[]; onToggle: (id: string) => void }) {
  const [q, setQ] = useState("");
  const people = allPeople()
    .filter((u) => !exclude.includes(u.id))
    .filter((u) => !q.trim() || u.fullName.toLowerCase().includes(q.trim().toLowerCase().replace(/^@/, "")) || (u.username ?? "").includes(q.trim().toLowerCase().replace(/^@/, "")))
    .sort((x, y) => x.fullName.localeCompare(y.fullName));
  return (
    <>
      <label className={styles.sheetSearch}>
        <IconSearch size={18} />
        <input placeholder="Search name or @username" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className={styles.listGroup}>
        {people.map((u) => {
          const closed = getPrefs(u.id).spaceInvites === "nobody";
          const already = invited.includes(u.id);
          const on = selected.includes(u.id);
          return (
            <button key={u.id} className={styles.contactRow} disabled={closed || already} onClick={() => onToggle(u.id)}>
              <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={40} shape="circle" />
              <span className={styles.contactText}>
                <b>{u.fullName}</b>
                <small>{closed ? "Doesn’t take group invites" : already ? "Invited, waiting for an answer" : u.username ? `@${u.username}` : "On NOD"}</small>
              </span>
              {!closed && !already && <span className={`${styles.pickCircle} ${on ? styles.pickOn : ""}`}>{on && <IconCheck size={12} />}</span>}
            </button>
          );
        })}
        {!people.length && <p className={styles.sheetNote}>{q ? `No one matches “${q}”.` : "Everyone you know is already here."}</p>}
      </div>
    </>
  );
}

/* ===========================================================================
   New group: the look, then who to invite
   =========================================================================== */

export function NewGroupSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (chat: Chat) => void }) {
  const { me, createGroup } = useChat();
  const [step, setStep] = useState<"look" | "people">("look");
  const [look, setLook] = useState<Look>({ name: "", description: "", tone: "denim" });
  const [selected, setSelected] = useState<string[]>([]);
  const ready = !!look.name.trim();
  const create = () => onCreated(createGroup({ ...look, invite: selected }));
  return (
    <Sheet
      title={step === "look" ? "New group" : "Invite people"}
      onClose={onClose}
      action={step === "look"
        ? { label: "Next", disabled: !ready, onClick: () => setStep("people"), keepOpen: true }
        : { label: "Create", onClick: create }}
    >
      {step === "look" ? (
        <>
          <LookFields look={look} onChange={(p) => setLook((l) => ({ ...l, ...p }))} />
          <p className={styles.sheetNote}>Every group starts with #general. Add channels and roles any time from its settings.</p>
        </>
      ) : (
        <>
          <button className={g.stepBack} onClick={() => setStep("look")}>‹ {look.name.trim()}</button>
          <p className={styles.sheetNote}>
            {selected.length
              ? `${selected.length} ${selected.length === 1 ? "person gets" : "people get"} an invitation to join.`
              : "Pick people to invite, or create the group and invite them later."}
          </p>
          <PeoplePicker exclude={[me]} selected={selected} onToggle={(id) => setSelected((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))} />
        </>
      )}
    </Sheet>
  );
}

/* ===========================================================================
   Channels: the chips under the header, and adding or editing one
   =========================================================================== */

export function ChannelBar({ group, current, unread, onSwitch, onAdd }: {
  group: Chat;
  current: string;
  /** Unread counts by channel id. */
  unread: Record<string, number>;
  onSwitch: (channelId: string) => void;
  onAdd?: () => void;
}) {
  const { me } = useChat();
  const info = groupInfo(group);
  const channels = info.channels.filter((c) => !c.roles.length || isAdmin(info, me) || rolesOf(info, me).some((r) => c.roles.includes(r)));
  const barRef = useRef<HTMLElement>(null);
  // The open channel is always in view, however far along the row it is.
  useEffect(() => {
    const row = barRef.current?.firstElementChild as HTMLElement | null;
    const chip = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !chip) return;
    const left = chip.offsetLeft - 16;
    const right = chip.offsetLeft + chip.offsetWidth + 16 - row.clientWidth;
    if (row.scrollLeft > left) row.scrollLeft = left;
    else if (row.scrollLeft < right) row.scrollLeft = right;
  }, [current]);
  return (
    <nav ref={barRef} className={g.channelBar} aria-label="Channels">
      {/* Swipes on touch; drag or scroll the wheel with a mouse. */}
      <DragScroll className={g.channelScroll}>
        {channels.map((c) => (
          <button key={c.id} className={`${g.chip} ${c.id === current ? g.chipOn : ""}`} onClick={() => onSwitch(c.id)} aria-current={c.id === current ? "page" : undefined}>
            <span className={g.hash}>#</span>{c.name}
            {c.roles.length > 0 && <IconLock size={11} />}
            {c.postRoles.length > 0 && <span className={g.chipNote} aria-label="Read-only">📣</span>}
            {c.id !== current && (unread[c.id] ?? 0) > 0 && <i className={g.chipDot} aria-label={`${unread[c.id]} unread`} />}
          </button>
        ))}
        {onAdd && <button className={`${g.chip} ${g.chipAdd}`} onClick={onAdd} aria-label="Add a channel"><IconPlus size={14} /></button>}
      </DragScroll>
    </nav>
  );
}

/** Role chips: Admin is always on (admins see and post everywhere); custom roles toggle. */
function RoleChips({ group, value, onChange, withMembers }: { group: Chat; value: string[]; onChange: (ids: string[]) => void; withMembers?: boolean }) {
  const info = groupInfo(group);
  const roles = info.roles.filter((r) => r.id !== ADMIN && (withMembers || r.id !== MEMBER));
  return (
    <div className={styles.chipGrid}>
      <span className={`${styles.choice} ${styles.choiceOn} ${g.lockedChoice}`}><IconLock size={11} /> Admins</span>
      {roles.map((r) => {
        const on = value.includes(r.id);
        return (
          <button key={r.id} className={`${styles.choice} ${on ? styles.choiceOn : ""}`} onClick={() => onChange(on ? value.filter((x) => x !== r.id) : [...value, r.id])}>
            <i className={g.roleDot} style={{ background: TONES[r.tone] }} /> {r.name}
          </button>
        );
      })}
      {!roles.length && <span className={g.hint}>Make roles in Settings › Roles to open it to more people.</span>}
    </div>
  );
}

export function ChannelSheet({ groupId, channelId, onClose, onCreated, onToast }: {
  groupId: string;
  channelId?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
  onToast?: (t: string) => void;
}) {
  const { updateGroup } = useChat();
  const live = useGroup(groupId);
  const existing = live?.info.channels.find((c) => c.id === channelId);
  const isDefault = channelId === groupId;
  const [name, setName] = useState(existing?.name ?? "");
  const [topic, setTopic] = useState(existing?.topic ?? "");
  const [seeMode, setSeeMode] = useState<"all" | "roles">(existing?.roles.length ? "roles" : "all");
  const [see, setSee] = useState<string[]>(existing?.roles.filter((r) => r !== ADMIN) ?? []);
  const [postMode, setPostMode] = useState<"all" | "roles">(existing?.postRoles.length ? "roles" : "all");
  const [post, setPost] = useState<string[]>(existing?.postRoles.filter((r) => r !== ADMIN) ?? []);
  const [confirm, setConfirm] = useState(false);
  if (!live) return null;
  const { group } = live;
  const slug = channelName(name);
  const taken = live.info.channels.some((c) => c.name === slug && c.id !== channelId);

  const save = () => {
    const id = existing?.id ?? newChannelId(groupId, slug);
    const channel: GroupChannel = {
      id,
      name: slug,
      ...(topic.trim() ? { topic: topic.trim() } : {}),
      roles: seeMode === "roles" ? [ADMIN, ...see] : [],
      postRoles: postMode === "roles" ? [ADMIN, ...post] : [],
    };
    updateGroup(groupId, (x) => upsertChannel(x, channel));
    onClose();
    if (!existing) { onCreated?.(id); onToast?.(`#${slug} added`); }
  };

  return (
    <Sheet title={existing ? `#${existing.name}` : "New channel"} onClose={onClose} action={{ label: existing ? "Save" : "Add", disabled: !slug || taken, onClick: save }}>
      <label className={g.channelField}>
        <span>#</span>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 32))} placeholder="channel-name" data-autofocus autoCapitalize="none" spellCheck={false} aria-label="Channel name" />
      </label>
      <p className={`${styles.sheetNote} ${taken ? g.bad : ""}`}>{taken ? `#${slug} already exists.` : name && slug !== name ? `Shows as #${slug}` : "Lowercase, with dashes instead of spaces."}</p>
      <input className={styles.plainInput} value={topic} onChange={(e) => setTopic(e.target.value.slice(0, 80))} placeholder="Topic (optional)" aria-label="Topic" />

      <p className={styles.sheetLabel}>Who can see it</p>
      {isDefault ? (
        <p className={styles.sheetNote}>#{existing?.name} is the group’s own channel: everyone in {group.name} sees it.</p>
      ) : (
        <>
          <Segmented value={seeMode} options={[{ id: "all", label: "Everyone" }, { id: "roles", label: "Some roles" }]} onChange={setSeeMode} />
          {seeMode === "roles" && <RoleChips group={group} value={see} onChange={setSee} />}
        </>
      )}

      <p className={styles.sheetLabel}>Who can post</p>
      {isDefault ? (
        <p className={styles.sheetNote}>Everyone in the group.</p>
      ) : (
        <>
          <Segmented value={postMode} options={[{ id: "all", label: "Everyone who sees it" }, { id: "roles", label: "Some roles" }]} onChange={setPostMode} />
          {postMode === "roles" && <RoleChips group={group} value={post} onChange={setPost} withMembers={false} />}
          {postMode === "roles" && <p className={styles.sheetNote}>Everyone else can read it: good for announcements.</p>}
        </>
      )}

      {existing && !isDefault && (
        <button
          className={styles.mindDanger}
          onClick={() => {
            if (!confirm) { setConfirm(true); return; }
            updateGroup(groupId, (x) => deleteChannel(x, existing.id));
            onClose();
            onToast?.(`#${existing.name} removed`);
          }}
        >
          {confirm ? `Tap again to remove #${existing.name}` : "Remove channel"}
        </button>
      )}
    </Sheet>
  );
}

/* ===========================================================================
   Invitations: inviting people, and answering one
   =========================================================================== */

const linkOf = (code: string) => `nod.app/g/${code}`;

export function InvitePeopleSheet({ groupId, onClose, onToast }: { groupId: string; onClose: () => void; onToast: (t: string) => void }) {
  const { inviteToGroup } = useChat();
  const live = useGroup(groupId);
  const [selected, setSelected] = useState<string[]>([]);
  if (!live) return null;
  const { group, info } = live;
  const link = linkOf(info.inviteCode);
  const copy = async () => {
    try { await navigator.clipboard.writeText(`https://${link}`); onToast("Invite link copied"); } catch { onToast(link); }
  };
  return (
    <Sheet
      title={`Invite to ${group.name}`}
      onClose={onClose}
      action={{
        label: selected.length ? `Invite ${selected.length}` : "Invite",
        disabled: !selected.length,
        onClick: () => {
          const n = inviteToGroup(groupId, selected);
          onClose();
          onToast(n === 1 ? `Invitation sent to ${userById(selected[0]).name}` : `${n} invitations sent`);
        },
      }}
    >
      <div className={a.linkRow}>
        <span>{link}</span>
        <button className={a.pill} onClick={copy}><IconCopy size={13} /> Copy</button>
      </div>
      <p className={styles.sheetNote}>Anyone with the link can join. People you pick below get an invitation to accept.</p>
      <PeoplePicker exclude={group.memberIds} invited={info.invites.map((i) => i.userId)} selected={selected} onToggle={(id) => setSelected((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))} />
    </Sheet>
  );
}

/** An invitation, in New chat's Invitations: who asked, the group in its colour, Ignore or Join. */
export function InvitationRow({ group, onJoin }: { group: Chat; onJoin: () => void }) {
  const { me, respondInvite } = useChat();
  const now = useNow(60_000);
  const info = groupInfo(group);
  const inv = info.invites.find((i) => i.userId === me);
  if (!inv) return null;
  const tone = group.tone ?? "graphite";
  const ago = Math.max(1, Math.round((now - inv.at) / 3_600_000));
  return (
    <div className={g.invitation} style={{ ["--tone" as string]: TONES[tone] }}>
      <Avatar glyph={initials(group.name)} tone={tone} photo={group.photo} size={40} />
      <span className={g.invitationText}>
        <span>{userById(inv.by).name} invited you to <b>{group.name}</b></span>
        <small>{group.memberIds.length} {group.memberIds.length === 1 ? "member" : "members"} · {ago < 24 ? `${ago}h ago` : `${Math.round(ago / 24)}d ago`}</small>
      </span>
      <span className={g.invitationActions}>
        <button className={g.ignore} onClick={() => respondInvite(group.id, false)}>Ignore</button>
        <button className={`${a.pill} ${a.pillAccent}`} onClick={() => { respondInvite(group.id, true); onJoin(); }}>Join</button>
      </span>
    </div>
  );
}

/* ===========================================================================
   Group settings (people who can manage something)
   =========================================================================== */

type SettingsPage = "overview" | "channels" | "roles" | "members" | "invites";

export function GroupSettings({ groupId, leaving, onBack, onToast, onLeft }: {
  groupId: string;
  leaving: boolean;
  onBack: () => void;
  onToast: (t: string) => void;
  /** You left (or deleted) the group: close everything that showed it. */
  onLeft: () => void;
}) {
  const { me, updateGroup } = useChat();
  const live = useGroup(groupId);
  const [page, setPage] = useState<{ id: SettingsPage; leaving: boolean } | null>(null);
  const [sheet, setSheet] = useState<React.ReactNode>(null);
  const { rules } = useMutes(me);
  const now = useNow(60_000);
  if (!live) return null;
  const { group, info } = live;
  const open = (id: SettingsPage) => setPage({ id, leaving: false });
  const close = () => {
    setPage((p) => (p ? { ...p, leaving: true } : p));
    setTimeout(() => setPage((p) => (p?.leaving ? null : p)), 220);
  };
  const closeSheet = () => setSheet(null);
  const look: Look = { name: group.name, description: info.description, tone: group.tone ?? "graphite", photo: group.photo, cover: info.cover };
  const admin = isAdmin(info, me);
  const customRoles = info.roles.filter((r) => r.id !== ADMIN && r.id !== MEMBER).length;

  const leave = () => setSheet(
    <Sheet title={`Leave ${group.name}`} onClose={closeSheet}>
      {(done) => (
        <div className={a.logout}>
          <Avatar glyph={initials(group.name)} tone={look.tone} photo={look.photo} size={56} />
          <b>Leave {group.name}?</b>
          <p>You won’t see its channels any more. Someone will need to invite you to come back.</p>
          <button className={`${styles.primaryWide} ${a.dangerBtn}`} onClick={() => done(() => { updateGroup(groupId, (x) => removeMember(x, me)); onToast(`You left ${group.name}`); onLeft(); })}>Leave group</button>
        </div>
      )}
    </Sheet>,
  );
  const remove = () => setSheet(
    <Sheet title={`Delete ${group.name}`} onClose={closeSheet}>
      {(done) => (
        <div className={a.logout}>
          <Avatar glyph={initials(group.name)} tone={look.tone} photo={look.photo} size={56} />
          <b>Delete {group.name} for everyone?</b>
          <p>All {info.channels.length} {info.channels.length === 1 ? "channel goes" : "channels go"} for all {group.memberIds.length} members. This can’t be undone.</p>
          <button className={`${styles.primaryWide} ${a.dangerBtn}`} onClick={() => done(() => { updateGroup(groupId, (x) => ({ ...x, removedAt: Date.now() })); onToast(`${group.name} deleted`); onLeft(); })}>Delete group</button>
        </div>
      )}
    </Sheet>,
  );

  return (
    <div className={`${styles.screen} ${styles.chatScreen} ${a.settings} ${g.settings} ${leaving ? styles.leaving : ""}`} role="dialog" aria-label="Group settings">
      <StatusBar />
      <header className={a.bar}>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={onBack} aria-label="Back"><IconBack /></button>
        <h2>{canManage(info, me) ? "Group settings" : "Group"}</h2>
        <span className={a.barAction} />
      </header>
      <div className={a.scroll}>
        <div className={g.settingsBanner}>
          <GroupBanner look={look} compact>
            {can(info, me, "manageGroup") && <button className={a.editPill} onClick={() => open("overview")}>Edit</button>}
          </GroupBanner>
        </div>

        {(() => {
          // The group, then each channel you can see: a channel follows the group unless set on its own.
          const groupRule = ruleFor(rules, groupId, now);
          const mine = info.channels.filter((c) => !c.roles.length || isAdmin(info, me) || rolesOf(info, me).some((r) => c.roles.includes(r)));
          const sheetFor = (id: string, name: string, channel: boolean) => setSheet(
            <MuteSheet me={me} chatId={id} name={name} group={channel ? { id: groupId, name: group.name } : undefined} onClose={closeSheet} onToast={onToast} />,
          );
          return (
            <Group label="Notifications" note={isQuiet(groupRule) ? "Channels follow the group unless you set them on their own, like keeping #announcements on." : "Mute the whole group, or just a noisy channel."}>
              <Row icon={<Tile tone="clay"><IconBell size={16} /></Tile>} title={group.name} value={describe(groupRule, now)} onClick={() => sheetFor(groupId, group.name, false)} />
              {mine.length > 1 && mine.map((c) => {
                const own = ruleFor(rules, c.id, now);
                return (
                  <Row
                    key={c.id}
                    icon={<span className={g.muteHash}>#</span>}
                    title={`#${c.name}`}
                    value={own ? describe(own, now) : "Same as group"}
                    onClick={() => sheetFor(c.id, `#${c.name}`, c.id !== groupId)}
                  />
                );
              })}
            </Group>
          );
        })()}

        <Group label={canManage(info, me) ? "Organise" : "People"}>
          {can(info, me, "manageChannels") && <Row icon={<Tile tone="denim"><b className={g.tileHash}>#</b></Tile>} title="Channels" value={String(info.channels.length)} onClick={() => open("channels")} />}
          {can(info, me, "manageRoles") && <Row icon={<Tile tone="plum"><IconLock size={15} /></Tile>} title="Roles & permissions" value={customRoles ? `${customRoles + 2}` : "2"} onClick={() => open("roles")} />}
          <Row icon={<Tile tone="sage"><IconUserGroup size={16} /></Tile>} title="Members" value={String(group.memberIds.length)} onClick={() => open("members")} />
          {can(info, me, "invite") && <Row icon={<Tile tone="accent"><IconUserAdd size={16} /></Tile>} title="Invitations" value={info.invites.length ? `${info.invites.length} waiting` : undefined} onClick={() => open("invites")} />}
        </Group>

        <Group note={admin ? "Admins can see every channel and change everything here." : undefined}>
          <Row icon={<Tile tone="danger"><IconLogout size={16} /></Tile>} title="Leave group" danger onClick={leave} trailing={<span />} />
          {admin && <Row icon={<Tile tone="danger"><IconTrash size={16} /></Tile>} title="Delete group" danger onClick={remove} trailing={<span />} />}
        </Group>
      </div>

      {page?.id === "overview" && <OverviewPage group={group} leaving={page.leaving} onBack={close} onSaved={() => { close(); onToast("Group updated"); }} />}
      {page?.id === "channels" && <ChannelsPage group={group} leaving={page.leaving} onBack={close} onSheet={setSheet} closeSheet={closeSheet} onToast={onToast} />}
      {page?.id === "roles" && <RolesPage group={group} leaving={page.leaving} onBack={close} onSheet={setSheet} closeSheet={closeSheet} onToast={onToast} />}
      {page?.id === "members" && <MembersPage group={group} leaving={page.leaving} onBack={close} onSheet={setSheet} closeSheet={closeSheet} onToast={onToast} />}
      {page?.id === "invites" && <InvitesPage group={group} leaving={page.leaving} onBack={close} onSheet={setSheet} closeSheet={closeSheet} onToast={onToast} />}
      {sheet}
    </div>
  );
}

interface PageProps { group: Chat; leaving: boolean; onBack: () => void; onSheet: (n: React.ReactNode) => void; closeSheet: () => void; onToast: (t: string) => void }

function OverviewPage({ group, leaving, onBack, onSaved }: { group: Chat; leaving: boolean; onBack: () => void; onSaved: () => void }) {
  const { updateGroup } = useChat();
  const info = groupInfo(group);
  const [look, setLook] = useState<Look>({ name: group.name, description: info.description, tone: group.tone ?? "graphite", photo: group.photo, cover: info.cover });
  const save = () => {
    updateGroup(group.id, (x) => {
      const next: Chat = { ...x, name: look.name.trim() || x.name, tone: look.tone, group: { ...groupInfo(x), description: look.description.trim(), cover: look.cover } };
      if (look.photo) next.photo = look.photo; else delete next.photo;
      return next;
    });
    onSaved();
  };
  return (
    <SubPage title="Edit group" onBack={onBack} leaving={leaving} action={<button className={a.textBtn} onClick={save} disabled={!look.name.trim()}>Save</button>}>
      <LookFields look={look} onChange={(p) => setLook((l) => ({ ...l, ...p }))} />
    </SubPage>
  );
}

/** What a channel's access looks like, in a few words. */
function access(group: Chat, c: GroupChannel) {
  const info = groupInfo(group);
  const parts = [
    !c.roles.length ? "Everyone" : c.roles.every((r) => r === ADMIN) ? "Admins only" : `${roleNames(info, c.roles)} only`,
    c.postRoles.length ? `${roleNames(info, c.postRoles)} post` : "",
  ].filter(Boolean);
  return [c.topic, parts.join(" · ")].filter(Boolean).join(" · ");
}

function ChannelsPage({ group, leaving, onBack, onSheet, closeSheet, onToast }: PageProps) {
  const { updateGroup } = useChat();
  const info = groupInfo(group);
  const edit = (id?: string) => onSheet(<ChannelSheet groupId={group.id} channelId={id} onClose={closeSheet} onToast={onToast} />);
  return (
    <SubPage title="Channels" onBack={onBack} leaving={leaving}>
      <Group note="Private channels only show for the roles you pick. Admins see them all.">
        {info.channels.map((c, i) => (
          // Not a Row: the reorder buttons can't sit inside the row's own button.
          <div key={c.id} className={`${a.row} ${g.channelRow}`}>
            <button className={g.rowMain} onClick={() => edit(c.id)}>
              <Tile tone={c.roles.length ? "plum" : "denim"}>{c.roles.length ? <IconLock size={14} /> : <b className={g.tileHash}>#</b>}</Tile>
              <span className={a.rowText}><b>#{c.name}</b><small>{access(group, c)}</small></span>
              <IconChevron size={14} />
            </button>
            {i > 0 ? (
              <span className={styles.mindReorder}>
                <button onClick={() => updateGroup(group.id, (x) => moveChannel(x, c.id, -1))} disabled={i < 2} aria-label={`Move #${c.name} up`}>↑</button>
                <button onClick={() => updateGroup(group.id, (x) => moveChannel(x, c.id, 1))} disabled={i === info.channels.length - 1} aria-label={`Move #${c.name} down`}>↓</button>
              </span>
            ) : <span className={g.fixed}>First</span>}
          </div>
        ))}
        <Row icon={<span className={a.addTile}><IconPlus size={16} /></span>} title="Add a channel" onClick={() => edit()} />
      </Group>
    </SubPage>
  );
}

function RolesPage({ group, leaving, onBack, onSheet, closeSheet, onToast }: PageProps) {
  const info = groupInfo(group);
  const count = (id: string) => (id === MEMBER ? group.memberIds.length : group.memberIds.filter((u) => (info.memberRoles[u] ?? []).includes(id) || (id === ADMIN && info.createdBy === u)).length);
  const edit = (role?: GroupRole) => onSheet(<RoleSheet groupId={group.id} roleId={role?.id} onClose={closeSheet} onToast={onToast} />);
  return (
    <SubPage title="Roles & permissions" onBack={onBack} leaving={leaving}>
      <Group note="Everyone is a Member. Give people more roles for extra permissions, and to open private channels to them.">
        {info.roles.map((r) => (
          <Row
            key={r.id}
            icon={<Tile tone={r.tone}><IconLock size={14} /></Tile>}
            title={r.name}
            sub={`${count(r.id)} ${count(r.id) === 1 ? "person" : "people"} · ${r.id === ADMIN ? "Everything" : r.permissions.length ? `${r.permissions.length} ${r.permissions.length === 1 ? "permission" : "permissions"}` : "Channel access only"}`}
            onClick={() => edit(r)}
          />
        ))}
        <Row icon={<span className={a.addTile}><IconPlus size={16} /></span>} title="New role" sub="e.g. Design, Leads, Guests" onClick={() => edit()} />
      </Group>
    </SubPage>
  );
}

function RoleSheet({ groupId, roleId, onClose, onToast }: { groupId: string; roleId?: string; onClose: () => void; onToast: (t: string) => void }) {
  const { me, updateGroup } = useChat();
  const live = useGroup(groupId);
  const existing = live?.info.roles.find((r) => r.id === roleId);
  const [name, setName] = useState(existing?.name ?? "");
  const [tone, setTone] = useState<AvatarTone>(existing?.tone ?? ROLE_TONES[(live?.info.roles.length ?? 0) % ROLE_TONES.length]);
  const [perms, setPerms] = useState<GroupPermission[]>(existing?.permissions ?? []);
  const [people, setPeople] = useState<string[]>(() => (live && roleId ? live.group.memberIds.filter((u) => (live.info.memberRoles[u] ?? []).includes(roleId)) : []));
  const [confirm, setConfirm] = useState(false);
  if (!live) return null;
  const { group, info } = live;
  const isAdminRole = roleId === ADMIN;
  const isMember = roleId === MEMBER;
  const builtIn = isAdminRole || isMember;

  const save = () => {
    const id = existing?.id ?? newRoleId();
    updateGroup(groupId, (x) => {
      let next = upsertRole(x, { id, name: builtIn ? existing!.name : name.trim(), tone, permissions: isAdminRole ? existing!.permissions : perms });
      if (!isMember) {
        const gi = groupInfo(next);
        for (const u of next.memberIds) {
          const had = (gi.memberRoles[u] ?? []).includes(id);
          const wants = people.includes(u) || (isAdminRole && u === gi.createdBy);
          // You can't take Admin away from yourself here; another admin can.
          if (isAdminRole && u === me && had && !wants) continue;
          if (had !== wants) next = setMemberRoles(next, u, wants ? [...(gi.memberRoles[u] ?? []), id] : (gi.memberRoles[u] ?? []).filter((r) => r !== id));
        }
      }
      return next;
    });
    onClose();
    onToast(existing ? `${builtIn ? existing.name : name.trim()} saved` : `${name.trim()} added`);
  };

  return (
    <Sheet title={existing ? existing.name : "New role"} onClose={onClose} action={{ label: existing ? "Save" : "Add", disabled: !builtIn && !name.trim(), onClick: save }}>
      {!builtIn && <input className={`${styles.plainInput} ${styles.mindTitleInput}`} value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} placeholder="Role name, e.g. Design" data-autofocus aria-label="Role name" />}
      <p className={styles.sheetLabel}>Colour</p>
      <div className={a.tones} role="radiogroup" aria-label="Role colour">
        {ROLE_TONES.map((t) => (
          <button key={t} role="radio" aria-checked={tone === t} aria-label={TONE_NAMES[t]} className={tone === t ? a.toneOn : undefined} style={{ background: TONES[t] }} onClick={() => setTone(t)}>
            {tone === t && <IconCheck size={12} />}
          </button>
        ))}
      </div>

      <p className={styles.sheetLabel}>Permissions</p>
      {isAdminRole ? (
        <p className={styles.sheetNote}>Admins can do everything, and see every channel.</p>
      ) : (
        <div className={styles.listGroup}>
          {PERMISSIONS.map((p) => (
            <div key={p.id} className={g.permRow}>
              <span className={styles.contactText}><b>{p.label}</b><small>{p.sub}</small></span>
              <Toggle on={perms.includes(p.id)} onChange={(v) => setPerms((x) => (v ? [...x, p.id] : x.filter((y) => y !== p.id)))} label={p.label} />
            </div>
          ))}
        </div>
      )}

      <p className={styles.sheetLabel}>People</p>
      {isMember ? (
        <p className={styles.sheetNote}>Everyone in {group.name} is a Member.</p>
      ) : (
        <div className={styles.listGroup}>
          {group.memberIds.map((u) => {
            const p = userById(u);
            const owner = isAdminRole && u === info.createdBy;
            const on = owner || people.includes(u);
            return (
              <button key={u} className={styles.contactRow} disabled={owner || (isAdminRole && u === me && on)} onClick={() => setPeople((x) => (x.includes(u) ? x.filter((y) => y !== u) : [...x, u]))}>
                <Avatar glyph={initials(p.fullName)} tone={p.tone} photo={p.photo} size={36} shape="circle" />
                <span className={styles.contactText}><b>{u === me ? `${p.fullName} (you)` : p.fullName}</b><small>{owner ? "Made the group" : rolesLine(info, u)}</small></span>
                <span className={`${styles.pickCircle} ${on ? styles.pickOn : ""}`}>{on && <IconCheck size={12} />}</span>
              </button>
            );
          })}
        </div>
      )}

      {existing && !builtIn && (
        <button
          className={styles.mindDanger}
          onClick={() => {
            if (!confirm) { setConfirm(true); return; }
            updateGroup(groupId, (x) => deleteRole(x, existing.id));
            onClose();
            onToast(`${existing.name} deleted`);
          }}
        >
          {confirm ? `Tap again to delete ${existing.name}` : "Delete role"}
        </button>
      )}
    </Sheet>
  );
}

const rolesLine = (info: ReturnType<typeof groupInfo>, userId: string) => {
  const names = rolesOf(info, userId).filter((r) => r !== MEMBER).map((r) => info.roles.find((x) => x.id === r)?.name).filter(Boolean);
  return names.length ? names.join(", ") : "Member";
};

/** A person's roles, as small coloured chips. */
export function RoleBadges({ group, userId }: { group: Chat; userId: string }) {
  const info = groupInfo(group);
  const ids = [...new Set([...(info.createdBy === userId ? [ADMIN] : []), ...(info.memberRoles[userId] ?? [])])];
  const roles = ids.map((id) => info.roles.find((r) => r.id === id)).filter(Boolean) as GroupRole[];
  if (!roles.length) return null;
  return (
    <span className={g.badges}>
      {roles.map((r) => <span key={r.id} className={g.badge} style={{ ["--role" as string]: TONES[r.tone] }}>{r.name}</span>)}
    </span>
  );
}

function MembersPage({ group, leaving, onBack, onSheet, closeSheet, onToast }: PageProps) {
  const { me, isOnline } = useChat();
  const info = groupInfo(group);
  const manage = can(info, me, "manageRoles");
  const members = useMemo(() => [...group.memberIds].sort((x, y) => (x === me ? -1 : y === me ? 1 : Number(isAdmin(info, y)) - Number(isAdmin(info, x)) || userById(x).fullName.localeCompare(userById(y).fullName))), [group.memberIds, info, me]);
  return (
    <SubPage title="Members" onBack={onBack} leaving={leaving}>
      <Group label={`${members.length} ${members.length === 1 ? "member" : "members"}`} note={manage ? "Tap someone to change their roles or remove them." : undefined}>
        {members.map((u) => {
          const p = userById(u);
          return (
            <Row
              key={u}
              icon={<Avatar glyph={initials(p.fullName)} tone={p.tone} photo={p.photo} size={36} shape="circle" online={u !== me && isOnline(u)} />}
              title={u === me ? `${p.fullName} (you)` : p.fullName}
              sub={p.username ? `@${p.username}` : undefined}
              onClick={manage && u !== me ? () => onSheet(<MemberSheet groupId={group.id} userId={u} onClose={closeSheet} onToast={onToast} />) : undefined}
              trailing={<RoleBadges group={group} userId={u} />}
            />
          );
        })}
      </Group>
      {info.invites.length > 0 && (
        <Group label="Invited">
          {info.invites.map((i) => {
            const p = userById(i.userId);
            return <Row key={i.userId} icon={<Avatar glyph={initials(p.fullName)} tone={p.tone} photo={p.photo} size={36} shape="circle" />} title={p.fullName} sub={`Invited by ${i.by === me ? "you" : userById(i.by).name}`} trailing={<span className={g.waiting}>Waiting</span>} />;
          })}
        </Group>
      )}
    </SubPage>
  );
}

function MemberSheet({ groupId, userId, onClose, onToast }: { groupId: string; userId: string; onClose: () => void; onToast: (t: string) => void }) {
  const { updateGroup } = useChat();
  const live = useGroup(groupId);
  const [roles, setRoles] = useState<string[]>(() => live?.info.memberRoles[userId] ?? []);
  const [confirm, setConfirm] = useState(false);
  if (!live) return null;
  const { group, info } = live;
  const p = userById(userId);
  const owner = info.createdBy === userId;
  return (
    <Sheet title={p.fullName} onClose={onClose} action={{ label: "Save", onClick: () => { updateGroup(groupId, (x) => setMemberRoles(x, userId, roles)); onClose(); onToast(`${p.name}’s roles saved`); } }}>
      <div className={g.memberHead}>
        <Avatar glyph={initials(p.fullName)} tone={p.tone} photo={p.photo} size={64} shape="circle" />
        <small>{p.username ? `@${p.username}` : ""}{owner ? " · Made the group" : ""}</small>
      </div>
      <p className={styles.sheetLabel}>Roles</p>
      <div className={styles.listGroup}>
        {info.roles.filter((r) => r.id !== MEMBER).map((r) => {
          const on = (owner && r.id === ADMIN) || roles.includes(r.id);
          return (
            <button key={r.id} className={styles.contactRow} disabled={owner && r.id === ADMIN} onClick={() => setRoles((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id]))}>
              <Tile tone={r.tone}><IconLock size={14} /></Tile>
              <span className={styles.contactText}><b>{r.name}</b><small>{r.id === ADMIN ? "Can do everything" : r.permissions.length ? PERMISSIONS.filter((x) => r.permissions.includes(x.id)).map((x) => x.label).join(", ") : "Opens private channels for this role"}</small></span>
              <span className={`${styles.pickCircle} ${on ? styles.pickOn : ""}`}>{on && <IconCheck size={12} />}</span>
            </button>
          );
        })}
      </div>
      <p className={styles.sheetNote}>Everyone is also a Member.</p>
      {!owner && (
        <button
          className={styles.mindDanger}
          onClick={() => {
            if (!confirm) { setConfirm(true); return; }
            updateGroup(groupId, (x) => removeMember(x, userId));
            onClose();
            onToast(`${p.name} removed from ${group.name}`);
          }}
        >
          {confirm ? `Tap again to remove ${p.name}` : `Remove from ${group.name}`}
        </button>
      )}
    </Sheet>
  );
}

function InvitesPage({ group, leaving, onBack, onSheet, closeSheet, onToast }: PageProps) {
  const { me, updateGroup } = useChat();
  const info = groupInfo(group);
  const link = linkOf(info.inviteCode);
  const copy = async () => {
    try { await navigator.clipboard.writeText(`https://${link}`); onToast("Invite link copied"); } catch { onToast(link); }
  };
  return (
    <SubPage title="Invitations" onBack={onBack} leaving={leaving}>
      <div className={a.invite}>
        <div className={a.qrCard}>
          <div className={a.qrWrap}>
            <QrPattern seed={info.inviteCode} />
            <span className={a.qrFace}><Avatar glyph={initials(group.name)} tone={group.tone ?? "graphite"} photo={group.photo} size={40} /></span>
          </div>
          <b>{group.name}</b>
          <small>Scan to join on NOD</small>
        </div>
        <div className={a.linkRow}>
          <span>{link}</span>
          <button className={a.pill} onClick={copy}><IconCopy size={13} /> Copy</button>
        </div>
        <button className={`${styles.primaryWide} ${g.rowBtn}`} onClick={() => onSheet(<InvitePeopleSheet groupId={group.id} onClose={closeSheet} onToast={onToast} />)}>
          <IconUserAdd size={18} /> Invite people
        </button>
      </div>
      <Group label="Waiting for an answer" note={info.invites.length ? "They see the invitation in their inbox until they join or decline." : "Nobody right now."}>
        {info.invites.map((i) => {
          const p = userById(i.userId);
          return (
            <Row
              key={i.userId}
              icon={<Avatar glyph={initials(p.fullName)} tone={p.tone} photo={p.photo} size={36} shape="circle" />}
              title={p.fullName}
              sub={`Invited by ${i.by === me ? "you" : userById(i.by).name}`}
              trailing={<button className={a.pill} onClick={() => { updateGroup(group.id, (x) => cancelInvite(x, i.userId)); onToast(`Invitation to ${p.name} cancelled`); }}>Cancel</button>}
            />
          );
        })}
      </Group>
    </SubPage>
  );
}

/** For the group page's actions: whether to show Settings at all. */
export function showsSettings(group: Chat, userId: string) {
  return canManage(groupInfo(group), userId);
}

