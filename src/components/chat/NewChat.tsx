"use client";

import { useMemo, useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { getPrefs, usePrefs } from "@/lib/chat/account";
import { ADDRESS_BOOK, allPeople, formatPhone, type AddressEntry } from "@/lib/chat/people";
import { useChat, userById } from "@/lib/chat/store";
import type { Chat, User } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconCheck, IconChevron, IconContacts, IconSearch, IconShare, IconUserGroup } from "./Icons";
import { getPermission, PermissionAlert, setPermission, Sheet } from "./ui";
import styles from "./chat.module.css";
import s from "./account.module.css";

/**
 * WhatsApp-style "New chat": quick actions first, then frequently contacted,
 * then the people you know A–Z, and the contacts you could invite. With
 * contacts allowed, NOD matches your address book; search reaches anyone on
 * NOD by name, @username or number. "New group" is a second step.
 */

const digits = (v: string) => v.replace(/\D/g, "");

export default function NewChat({ onOpen, onClose, onInvite, onToast }: {
  onOpen: (chat: Chat) => void;
  onClose: () => void;
  onInvite: () => void;
  onToast: (text: string) => void;
}) {
  const { state, me, createGroup, openDm, isOnline } = useChat();
  const meUser = userById(me);
  const [prefs, setPrefs] = usePrefs(me);
  const [step, setStep] = useState<"pick" | "group">("pick");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [perm, setPerm] = useState(getPermission("contacts"));
  const [asking, setAsking] = useState(false);
  const allowed = perm === "granted";

  const everyone = allPeople().filter((u) => u.id !== me);
  const dmWith = (id: string) => state.data.chats.find((c) => c.kind === "dm" && c.memberIds.includes(id) && c.memberIds.includes(me));

  // Who you know: the people you already share a chat with, plus (with contacts allowed) everyone in your address book who's on NOD.
  const { contacts, invite } = useMemo(() => {
    const book = ADDRESS_BOOK.filter((e) => e.phone !== meUser.phone);
    const phones = new Set(book.map((e) => e.phone));
    const chatWith = new Set(state.data.chats.filter((c) => c.memberIds.includes(me)).flatMap((c) => c.memberIds));
    const known = everyone.filter((u) => chatWith.has(u.id) || (allowed && !!u.phone && phones.has(u.phone)));
    return {
      contacts: known,
      invite: allowed ? book.filter((e) => !everyone.some((u) => u.phone === e.phone)) : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data.chats, me, allowed, meUser.phone]);

  // "Frequently contacted" = the people you've messaged most recently.
  const frequent = useMemo(() => {
    const lastAt = (id: string) => {
      const chat = dmWith(id);
      const list = chat ? state.data.messages[chat.id] ?? [] : [];
      return list[list.length - 1]?.createdAt ?? 0;
    };
    return [...contacts].filter((u) => lastAt(u.id) > 0).sort((a, b) => lastAt(b.id) - lastAt(a.id)).slice(0, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data, me, contacts]);

  const q = query.trim().toLowerCase().replace(/^@/, "");
  const match = (u: User) => !q || u.fullName.toLowerCase().includes(q) || (u.username ?? "").includes(q) || (digits(q).length >= 3 && digits(u.phone ?? "").includes(digits(q)));
  const matches = contacts.filter(match);
  // Searching reaches everyone on NOD, even people who aren't in your contacts yet.
  const others = q.length >= 2 ? everyone.filter((u) => !contacts.includes(u) && match(u)) : [];
  const invites = invite.filter((e) => !q || e.name.toLowerCase().includes(q) || (digits(q).length >= 3 && digits(e.phone).includes(digits(q))));
  const byLetter = matches.reduce<Record<string, User[]>>((acc, u) => {
    const k = u.fullName[0]?.toUpperCase() ?? "#";
    (acc[/[A-Z]/.test(k) ? k : "#"] ??= []).push(u);
    return acc;
  }, {});

  const closed = (id: string) => getPrefs(id).spaceInvites === "nobody";
  const presence = (u: User, note?: string) => {
    const status = step === "group" && closed(u.id) ? "Doesn’t take Space invites"
      : isOnline(u.id) ? "Active now"
      : step === "group" ? (selected.includes(u.id) ? "Added" : "Tap to add")
      : note ?? "Tap to message";
    return u.username ? `@${u.username} · ${status}` : status;
  };

  const person = (u: User, close: (after?: () => void) => void, note?: string) => (
    <button
      key={u.id}
      className={styles.contactRow}
      disabled={step === "group" && closed(u.id)}
      onClick={() => {
        if (step === "group") {
          setSelected((x) => (x.includes(u.id) ? x.filter((y) => y !== u.id) : [...x, u.id]));
          return;
        }
        // Anyone on NOD: the chat starts if there isn't one yet.
        const chat = dmWith(u.id) ?? openDm(u.id);
        close(() => onOpen(chat));
      }}
    >
      <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={40} shape="circle" online={isOnline(u.id)} />
      <span className={styles.contactText}><b>{u.fullName}</b><small>{presence(u, note)}</small></span>
      {step === "group" && (
        <span className={`${styles.pickCircle} ${selected.includes(u.id) ? styles.pickOn : ""}`}>
          {selected.includes(u.id) && <IconCheck size={12} />}
        </span>
      )}
    </button>
  );

  const inviteRow = (e: AddressEntry) => {
    const sent = prefs.invited.includes(e.phone);
    return (
      <div key={e.phone} className={styles.contactRow}>
        <span className={s.ghostAvatar}>{initials(e.name)}</span>
        <span className={styles.contactText}><b>{e.name}</b><small>{formatPhone(e.phone)}</small></span>
        <button
          className={`${s.pill} ${sent ? s.pillDone : s.pillAccent}`}
          disabled={sent}
          onClick={() => { setPrefs({ invited: [...prefs.invited, e.phone] }); onToast(`Invite sent to ${e.name.split(" ")[0]}`); }}
        >
          {sent ? <><IconCheck size={12} /> Invited</> : "Invite"}
        </button>
      </div>
    );
  };

  const alert = asking && (
    <PermissionAlert kind="contacts" onResolve={(granted) => {
      setPermission("contacts", granted ? "granted" : "denied");
      setPerm(granted ? "granted" : "denied");
      setAsking(false);
    }} />
  );

  if (step === "group") {
    return (
      <Sheet
        title="New group"
        onClose={onClose}
        action={{
          label: "Create",
          disabled: !groupName.trim() || selected.length === 0,
          onClick: () => onOpen(createGroup(groupName, selected)),
        }}
      >
        {(close) => (
          <>
            <input
              className={styles.bigInput}
              data-autofocus
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            {selected.length > 0 && (
              <div className={styles.memberPick}>
                {selected.map((id) => {
                  const u = userById(id);
                  return (
                    <button key={id} className={styles.memberOn} onClick={() => setSelected((x) => x.filter((y) => y !== id))}>
                      <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={40} shape="circle" />
                      <span>{u.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className={styles.sheetLabel}>Members · {selected.length} of {contacts.length}</p>
            <div className={styles.listGroup}>{contacts.map((u) => person(u, close))}</div>
          </>
        )}
      </Sheet>
    );
  }

  return (
    <>
      <Sheet title="New chat" onClose={onClose}>
        {(close) => (
          <>
            <label className={styles.sheetSearch}>
              <IconSearch size={18} />
              <input placeholder="Search name, @username or number" value={query} onChange={(e) => setQuery(e.target.value)} data-autofocus />
            </label>

            {!q && (
              <div className={styles.listGroup}>
                <button className={styles.actionRow} onClick={() => setStep("group")}>
                  <span className={styles.actionIcon}><IconUserGroup size={20} /></span>
                  <span className={styles.contactText}><b>New group</b><small>Chat with several people at once</small></span>
                  <IconChevron size={16} />
                </button>
                <button className={styles.actionRow} onClick={() => close(onInvite)}>
                  <span className={styles.actionIcon}><IconShare size={20} /></span>
                  <span className={styles.contactText}><b>Invite friends</b><small>Share your link or QR code</small></span>
                  <IconChevron size={16} />
                </button>
                {!allowed && (
                  <button className={styles.actionRow} onClick={() => setAsking(true)}>
                    <span className={styles.actionIcon}><IconContacts size={20} /></span>
                    <span className={styles.contactText}><b>Find people you know</b><small>Allow contacts to see who’s on NOD</small></span>
                    <IconChevron size={16} />
                  </button>
                )}
              </div>
            )}

            {!q && frequent.length > 0 && (
              <>
                <p className={styles.sheetLabel}>Frequently contacted</p>
                <div className={styles.listGroup}>{frequent.map((u) => person(u, close))}</div>
              </>
            )}

            {matches.length > 0 && (
              <>
                <p className={styles.sheetLabel}>Contacts on NOD{!q ? ` · ${contacts.length}` : ""}</p>
                {q ? <div className={styles.listGroup}>{matches.map((u) => person(u, close))}</div> : Object.keys(byLetter).sort().map((letter) => (
                  <div key={letter}>
                    <p className={styles.letter}>{letter}</p>
                    <div className={styles.listGroup}>{byLetter[letter].map((u) => person(u, close))}</div>
                  </div>
                ))}
              </>
            )}
            {!q && contacts.length === 0 && (
              <p className={styles.sheetNote}>Nobody here yet. Allow contacts to find people you know, or search for someone’s @username or number.</p>
            )}

            {others.length > 0 && (
              <>
                <p className={styles.sheetLabel}>More people on NOD</p>
                <div className={styles.listGroup}>{others.map((u) => person(u, close, "Not in your contacts"))}</div>
              </>
            )}

            {invites.length > 0 && (
              <>
                <p className={styles.sheetLabel}>Invite to NOD · {invites.length}</p>
                <div className={styles.listGroup}>{invites.map(inviteRow)}</div>
              </>
            )}

            {q && !matches.length && !others.length && !invites.length && (
              <p className={styles.emptyInbox}>No one matches “{query}”.</p>
            )}
          </>
        )}
      </Sheet>
      {alert}
    </>
  );
}
