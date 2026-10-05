import type { AvatarTone, Chat, GroupChannel, GroupInfo, GroupPermission, GroupRole } from "./types";

/**
 * Groups: one chat per channel, listed under the group. The group's own chat
 * is its first channel (#general), so a group without extra channels is just
 * the group chat it always was. Roles decide what people can do and which
 * channels they can see; admins can always see and do everything.
 *
 * Everything here is pure: the store applies the result and syncs it.
 */

export const ADMIN = "admin";
export const MEMBER = "member";

export const PERMISSIONS: { id: GroupPermission; label: string; sub: string }[] = [
  { id: "manageGroup", label: "Edit the group", sub: "Name, pictures, description and colour" },
  { id: "manageChannels", label: "Manage channels", sub: "Add channels, rename them, choose who sees them" },
  { id: "manageRoles", label: "Manage roles & members", sub: "Create roles, give them to people, remove members" },
  { id: "invite", label: "Invite people", sub: "Send invitations and share the invite link" },
];
const ALL: GroupPermission[] = PERMISSIONS.map((p) => p.id);

export const ROLE_TONES: AvatarTone[] = ["plum", "denim", "sage", "ochre", "clay", "graphite"];

export function baseRoles(): GroupRole[] {
  return [
    { id: ADMIN, name: "Admin", tone: "clay", permissions: ALL },
    // Like most chat apps, anyone can bring people in until an admin says otherwise.
    { id: MEMBER, name: "Member", tone: "graphite", permissions: ["invite"] },
  ];
}

const rand = () => Math.random().toString(36).slice(2, 8);

/** Channel names are lowercase words joined by dashes, like #launch-plan. */
export const channelName = (raw: string) =>
  raw.toLowerCase().replace(/^#+/, "").replace(/[^a-z0-9\s_-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 32);

export function newChannelId(groupId: string, name: string) {
  return `${groupId}--${channelName(name) || "channel"}-${rand()}`;
}

export function newGroupInfo(createdBy: string, description: string, cover?: string): GroupInfo {
  return {
    description,
    cover,
    roles: baseRoles(),
    memberRoles: { [createdBy]: [ADMIN] },
    channels: [],
    invites: [],
    inviteCode: rand(),
    createdBy,
    createdAt: Date.now(),
  };
}

/** A group made before groups had settings: everyone in it is an admin of its one channel. */
export function groupInfo(chat: Chat): GroupInfo {
  const info = chat.group ?? {
    description: "",
    roles: baseRoles(),
    memberRoles: Object.fromEntries(chat.memberIds.map((id) => [id, [ADMIN]])),
    channels: [],
    invites: [],
    inviteCode: chat.id,
    createdBy: chat.memberIds[0] ?? "",
    createdAt: 0,
  };
  // The group's own chat is always the first channel.
  if (info.channels[0]?.id === chat.id) return info;
  return { ...info, channels: [{ id: chat.id, name: "general", roles: [], postRoles: [] }, ...info.channels.filter((c) => c.id !== chat.id)] };
}

export const isGroupChat = (c: Chat) => c.kind === "group" && !c.groupId;
export const isChannel = (c: Chat) => !!c.groupId;

/** The group a chat belongs to: itself for the group chat, the parent for a channel. */
export function groupOf(chats: Chat[], chat: Chat): Chat {
  return chat.groupId ? chats.find((c) => c.id === chat.groupId) ?? chat : chat;
}

export function rolesOf(info: GroupInfo, userId: string) {
  return [MEMBER, ...(info.memberRoles[userId] ?? [])];
}
export function isAdmin(info: GroupInfo, userId: string) {
  return info.createdBy === userId || (info.memberRoles[userId] ?? []).includes(ADMIN);
}
export function can(info: GroupInfo, userId: string, perm: GroupPermission) {
  if (isAdmin(info, userId)) return true;
  const mine = rolesOf(info, userId);
  return info.roles.some((r) => mine.includes(r.id) && r.permissions.includes(perm));
}
/** Settings are for people who can change something there. */
export const canManage = (info: GroupInfo, userId: string) =>
  can(info, userId, "manageGroup") || can(info, userId, "manageChannels") || can(info, userId, "manageRoles");

const overlaps = (a: string[], b: string[]) => a.some((x) => b.includes(x));

export function canSee(info: GroupInfo, channel: GroupChannel, userId: string) {
  return !channel.roles.length || isAdmin(info, userId) || overlaps(rolesOf(info, userId), channel.roles);
}
export function canPost(info: GroupInfo, channel: GroupChannel, userId: string) {
  if (!canSee(info, channel, userId)) return false;
  return !channel.postRoles.length || isAdmin(info, userId) || overlaps(rolesOf(info, userId), channel.postRoles);
}

/** "Admins and Design", for notes like "Only Admins and Design can post here". */
export function roleNames(info: GroupInfo, ids: string[]) {
  const names = ["Admins", ...ids.filter((id) => id !== ADMIN).map((id) => info.roles.find((r) => r.id === id)?.name).filter(Boolean)] as string[];
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

/** The channels someone can see, in order. */
export function visibleChannels(group: Chat, userId: string) {
  const info = groupInfo(group);
  return info.channels.filter((c) => canSee(info, c, userId));
}

/**
 * The channel chats for a group, brought in line with it: each one's members
 * are the group members who can see it, and it shows the group's name, colour
 * and picture. Channels no longer listed are closed (their history is kept).
 */
export function syncChannels(group: Chat, chats: Chat[]): Chat[] {
  const info = groupInfo(group);
  const out: Chat[] = [];
  for (const ch of info.channels.slice(1)) {
    const prev = chats.find((c) => c.id === ch.id);
    const next: Chat = {
      id: ch.id,
      kind: "group",
      groupId: group.id,
      name: `${group.name} · #${ch.name}`,
      tone: group.tone,
      photo: group.photo,
      memberIds: group.removedAt ? [] : group.memberIds.filter((u) => canSee(info, ch, u)),
      ...(group.removedAt ? { removedAt: group.removedAt } : {}),
    };
    if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) out.push(next);
  }
  for (const c of chats) {
    if (c.groupId === group.id && !info.channels.some((ch) => ch.id === c.id) && !c.removedAt) {
      out.push({ ...c, memberIds: [], removedAt: Date.now() });
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Edits: each takes the group chat and returns the next one
--------------------------------------------------------------------------- */

const withInfo = (group: Chat, fn: (info: GroupInfo) => GroupInfo): Chat => ({ ...group, group: fn(groupInfo(group)) });

/** Join: in the group, and no longer invited. */
export function addMember(group: Chat, userId: string): Chat {
  const g = withInfo(group, (info) => ({ ...info, invites: info.invites.filter((i) => i.userId !== userId) }));
  return g.memberIds.includes(userId) ? g : { ...g, memberIds: [...g.memberIds, userId] };
}

/** Leave, or be removed. If no admin is left, the longest-standing member becomes one. */
export function removeMember(group: Chat, userId: string): Chat {
  const memberIds = group.memberIds.filter((id) => id !== userId);
  return withInfo({ ...group, memberIds }, (info) => {
    const memberRoles = { ...info.memberRoles };
    delete memberRoles[userId];
    let createdBy = info.createdBy;
    if (memberIds.length && !memberIds.some((id) => id === createdBy || (memberRoles[id] ?? []).includes(ADMIN))) {
      createdBy = memberIds[0];
      memberRoles[createdBy] = [...(memberRoles[createdBy] ?? []), ADMIN];
    }
    return { ...info, memberRoles, createdBy };
  });
}

export function invite(group: Chat, userIds: string[], by: string): Chat {
  return withInfo(group, (info) => ({
    ...info,
    invites: [
      ...info.invites,
      ...userIds
        .filter((u) => !group.memberIds.includes(u) && !info.invites.some((i) => i.userId === u))
        .map((userId) => ({ userId, by, at: Date.now() })),
    ],
  }));
}

export function cancelInvite(group: Chat, userId: string): Chat {
  return withInfo(group, (info) => ({ ...info, invites: info.invites.filter((i) => i.userId !== userId) }));
}

export function setMemberRoles(group: Chat, userId: string, roleIds: string[]): Chat {
  return withInfo(group, (info) => ({ ...info, memberRoles: { ...info.memberRoles, [userId]: roleIds.filter((r) => r !== MEMBER) } }));
}

export function upsertRole(group: Chat, role: GroupRole): Chat {
  return withInfo(group, (info) => ({
    ...info,
    roles: info.roles.some((r) => r.id === role.id) ? info.roles.map((r) => (r.id === role.id ? role : r)) : [...info.roles, role],
  }));
}

/** A custom role goes; nobody has it any more, and channels stop asking for it. */
export function deleteRole(group: Chat, roleId: string): Chat {
  if (roleId === ADMIN || roleId === MEMBER) return group;
  return withInfo(group, (info) => ({
    ...info,
    roles: info.roles.filter((r) => r.id !== roleId),
    memberRoles: Object.fromEntries(Object.entries(info.memberRoles).map(([u, rs]) => [u, rs.filter((r) => r !== roleId)])),
    channels: info.channels.map((c) => ({ ...c, roles: c.roles.filter((r) => r !== roleId), postRoles: c.postRoles.filter((r) => r !== roleId) })),
  }));
}

export function newRoleId() {
  return `role-${rand()}`;
}

export function upsertChannel(group: Chat, channel: GroupChannel): Chat {
  return withInfo(group, (info) => ({
    ...info,
    channels: info.channels.some((c) => c.id === channel.id)
      // The group's own channel (#general) stays open to everyone.
      ? info.channels.map((c) => (c.id !== channel.id ? c : c.id === group.id ? { ...channel, roles: [], postRoles: [] } : channel))
      : [...info.channels, channel],
  }));
}

export function deleteChannel(group: Chat, channelId: string): Chat {
  if (channelId === group.id) return group;
  return withInfo(group, (info) => ({ ...info, channels: info.channels.filter((c) => c.id !== channelId) }));
}

export function moveChannel(group: Chat, channelId: string, dir: -1 | 1): Chat {
  return withInfo(group, (info) => {
    const list = [...info.channels];
    const i = list.findIndex((c) => c.id === channelId);
    const j = i + dir;
    // #general stays first.
    if (i < 1 || j < 1 || j >= list.length) return info;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...info, channels: list };
  });
}

/* ---------------------------------------------------------------------------
   The channel someone last had open in each group (per person, this device)
--------------------------------------------------------------------------- */

const lastKey = (me: string, groupId: string) => `nod.channel.${me}.${groupId}`;

export function readLastChannel(me: string, groupId: string) {
  try { return window.localStorage.getItem(lastKey(me, groupId)); } catch { return null; }
}
export function writeLastChannel(me: string, groupId: string, channelId: string) {
  try { window.localStorage.setItem(lastKey(me, groupId), channelId); } catch { /* private mode */ }
}

/** Opening a group lands in the channel left open last time, if it's still there and still yours. */
export function landingChannel(chats: Chat[], group: Chat, me: string): Chat {
  const id = readLastChannel(me, group.id);
  const ch = id && id !== group.id ? chats.find((c) => c.id === id && c.groupId === group.id && !c.removedAt && c.memberIds.includes(me)) : null;
  return ch ?? group;
}
