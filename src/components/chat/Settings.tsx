"use client";

import { useMemo, useState } from "react";
import { chatIdentity, initials, TONES } from "@/lib/chat/avatar";
import {
  accountIds, LANGUAGES, readThemePref, removeAccount, requestTheme, resetDemoData, usePrefs, type ThemePref,
} from "@/lib/chat/account";
import { clearMedia } from "@/lib/chat/media";
import { formatPhone, updatePerson } from "@/lib/chat/people";
import { useChat, userById } from "@/lib/chat/store";
import type { AvatarTone } from "@/lib/chat/types";
import Avatar from "./Avatar";
import {
  IconBack, IconBell, IconBellOff, IconCamera, IconCheck, IconChevron, IconContacts, IconGlobe, IconHelp, IconImage,
  IconInfo, IconKeyboard, IconLocation, IconLogout, IconPalette, IconPlus, IconShare, IconShield, IconStorage,
} from "./Icons";
import Logo from "./Logo";
import { AvatarPicker, ProfileFields, profileReady, type ProfileDraft } from "./Profile";
import StatusBar from "./StatusBar";
import { getPermission, PermissionAlert, Segmented, setPermission, Sheet, Toggle, type PermissionKind } from "./ui";
import styles from "./chat.module.css";
import s from "./account.module.css";

/**
 * Settings: who you are, which identities are signed in on this device, and
 * how NOD behaves for you. Opened from your avatar on the home screen. Each
 * group pushes in as its own page, the way a chat does.
 */

type Page = "profile" | "notifications" | "privacy" | "chats" | "language" | "storage" | "about";

function Tile({ tone, children }: { tone: AvatarTone | "accent" | "danger"; children: React.ReactNode }) {
  const bg = tone === "accent" ? "var(--accent)" : tone === "danger" ? "var(--danger)" : TONES[tone];
  // The accent turns light in dark mode, so its icon takes the background colour instead of white.
  return <span className={s.tile} style={{ background: bg, color: tone === "accent" ? "var(--bg)" : undefined }}>{children}</span>;
}

function Row({ icon, title, sub, value, onClick, trailing, danger }: {
  icon?: React.ReactNode; title: string; sub?: string; value?: string; onClick?: () => void; trailing?: React.ReactNode; danger?: boolean;
}) {
  const inner = (
    <>
      {icon}
      <span className={s.rowText}>
        <b className={danger ? s.danger : undefined}>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      {value && <span className={s.rowValue}>{value}</span>}
      {trailing ?? (onClick ? <IconChevron size={14} /> : null)}
    </>
  );
  return onClick
    ? <button className={s.row} onClick={onClick}>{inner}</button>
    : <div className={s.row}>{inner}</div>;
}

function Group({ label, note, children }: { label?: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={s.group}>
      {label && <p className={s.groupLabel}>{label}</p>}
      <div className={s.groupBody}>{children}</div>
      {note && <p className={s.groupNote}>{note}</p>}
    </section>
  );
}

/** A page that slides in over Settings, with Back and an optional action. */
function SubPage({ title, onBack, action, children, leaving }: { title: string; onBack: () => void; action?: React.ReactNode; children: React.ReactNode; leaving?: boolean }) {
  return (
    <div className={`${styles.screen} ${styles.chatScreen} ${s.settings} ${s.subPage} ${leaving ? styles.leaving : ""}`}>
      <StatusBar />
      <header className={s.bar}>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={onBack} aria-label="Back"><IconBack /></button>
        <h2>{title}</h2>
        <span className={s.barAction}>{action}</span>
      </header>
      <div className={s.scroll}>{children}</div>
    </div>
  );
}

export default function Settings({ leaving, onBack, onAddIdentity, onInvite, onToast }: {
  leaving: boolean;
  onBack: () => void;
  onAddIdentity: () => void;
  onInvite: () => void;
  onToast: (text: string) => void;
}) {
  const { me, setMe } = useChat();
  const user = userById(me);
  const [page, setPage] = useState<{ id: Page; leaving: boolean } | null>(null);
  const [sheet, setSheet] = useState<"logout" | "help" | null>(null);
  const [prefs] = usePrefs(me);
  const accounts = accountIds();
  const open = (id: Page) => setPage({ id, leaving: false });
  const close = () => {
    setPage((p) => (p ? { ...p, leaving: true } : p));
    setTimeout(() => setPage((p) => (p?.leaving ? null : p)), 220);
  };
  const theme = readThemePref();

  const switchTo = (id: string) => {
    setMe(id);
    onToast(`Signed in as ${userById(id).name}`);
    onBack();
  };
  const logOut = () => {
    const name = user.username ? `@${user.username}` : user.name;
    removeAccount(me);
    const next = accountIds()[0];
    try { sessionStorage.removeItem("nod.chat.me"); } catch { /* private mode */ }
    if (next) { setMe(next); onToast(`Logged out of ${name}`); onBack(); }
    // With no identity left on the device, the app goes back to its welcome.
  };

  return (
    <div className={`${styles.screen} ${styles.chatScreen} ${s.settings} ${leaving ? styles.leaving : ""}`} role="dialog" aria-label="Settings">
      <StatusBar />
      <header className={s.bar}>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={onBack} aria-label="Back to chats"><IconBack /></button>
        <h2>Settings</h2>
        <span className={s.barAction} />
      </header>

      <div className={s.scroll}>
        <button className={s.profileCard} onClick={() => open("profile")}>
          <Avatar glyph={initials(user.fullName)} tone={user.tone} photo={user.photo} size={64} shape="circle" />
          <span className={s.rowText}>
            <b className={s.profileName}>{user.fullName}</b>
            <small>{[user.username && `@${user.username}`, user.fullName !== formatPhone(user.phone) && formatPhone(user.phone)].filter(Boolean).join(" · ") || "No username yet"}</small>
            {user.bio && <small className={s.bio}>{user.bio}</small>}
            {user.phone && user.fullName === formatPhone(user.phone) && <small className={s.bio}>Add a photo, a name and a username</small>}
          </span>
          <span className={s.editPill}>Edit</span>
        </button>

        <Group label="Identities on this device" note="Each identity has its own chats, Mind and settings. Switch any time.">
          {accounts.map((id) => {
            const u = userById(id);
            const on = id === me;
            return (
              <Row
                key={id}
                icon={<Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={32} shape="circle" />}
                title={u.fullName}
                sub={u.username ? `@${u.username}` : formatPhone(u.phone)}
                onClick={on ? undefined : () => switchTo(id)}
                trailing={on ? <span className={s.check}><IconCheck size={12} /></span> : <span className={s.switch}>Switch</span>}
              />
            );
          })}
          <Row icon={<span className={s.addTile}><IconPlus size={16} /></span>} title="Add an identity" sub="Sign in with another number" onClick={onAddIdentity} />
        </Group>

        <Group>
          <Row icon={<Tile tone="accent"><IconShare size={16} /></Tile>} title="Invite friends" sub="Share a link to NOD" onClick={onInvite} />
        </Group>

        <Group label="Preferences">
          <Row icon={<Tile tone="clay"><IconBell size={16} /></Tile>} title="Notifications" value={getPermission("notifications") === "granted" ? "On" : "Off"} onClick={() => open("notifications")} />
          <Row icon={<Tile tone="denim"><IconShield size={16} /></Tile>} title="Privacy & security" onClick={() => open("privacy")} />
          <Row icon={<Tile tone="plum"><IconPalette size={16} /></Tile>} title="Chats & appearance" value={theme === "system" ? "Automatic" : theme === "dark" ? "Dark" : "Light"} onClick={() => open("chats")} />
          <Row icon={<Tile tone="sage"><IconGlobe size={16} /></Tile>} title="Language" value={LANGUAGES.find((l) => l.id === prefs.language)?.native ?? "English"} onClick={() => open("language")} />
          <Row icon={<Tile tone="ochre"><IconStorage size={16} /></Tile>} title="Data & storage" onClick={() => open("storage")} />
        </Group>

        <Group label="Help">
          <Row icon={<Tile tone="graphite"><IconHelp size={16} /></Tile>} title="Help & feedback" onClick={() => setSheet("help")} />
          <Row icon={<Tile tone="graphite"><IconInfo size={16} /></Tile>} title="About NOD" onClick={() => open("about")} />
        </Group>

        <Group>
          <Row icon={<Tile tone="danger"><IconLogout size={16} /></Tile>} title="Log out" danger onClick={() => setSheet("logout")} trailing={<span />} />
        </Group>
        <p className={s.version}>NOD · Interactive prototype · 0.1.0</p>
      </div>

      {page?.id === "profile" && <ProfilePage leaving={page.leaving} onBack={close} onSaved={() => { close(); onToast("Profile updated"); }} />}
      {page?.id === "notifications" && <NotificationsPage leaving={page.leaving} onBack={close} />}
      {page?.id === "privacy" && <PrivacyPage leaving={page.leaving} onBack={close} onToast={onToast} />}
      {page?.id === "chats" && <ChatsPage leaving={page.leaving} onBack={close} />}
      {page?.id === "language" && <LanguagePage leaving={page.leaving} onBack={close} />}
      {page?.id === "storage" && <StoragePage leaving={page.leaving} onBack={close} onToast={onToast} />}
      {page?.id === "about" && <AboutPage leaving={page.leaving} onBack={close} />}

      {sheet === "logout" && (
        <Sheet title="Log out" onClose={() => setSheet(null)}>
          {(closeSheet) => (
            <div className={s.logout}>
              <Avatar glyph={initials(user.fullName)} tone={user.tone} photo={user.photo} size={56} shape="circle" />
              <b>Log out of {user.username ? `@${user.username}` : user.fullName}?</b>
              <p>
                Your chats and Mind stay in NOD. Log back in with {formatPhone(user.phone) || "your number"}
                {accounts.length > 1 ? `, and you’ll switch to ${userById(accounts.find((x) => x !== me)!).name} now.` : "."}
              </p>
              <button className={`${styles.primaryWide} ${s.dangerBtn}`} onClick={() => closeSheet(logOut)}>Log out</button>
            </div>
          )}
        </Sheet>
      )}
      {sheet === "help" && <HelpSheet onClose={() => setSheet(null)} onSent={() => onToast("Thanks, the NOD team will read it")} />}
    </div>
  );
}

/* ===========================================================================
   Pages
   =========================================================================== */

function ProfilePage({ leaving, onBack, onSaved }: { leaving: boolean; onBack: () => void; onSaved: () => void }) {
  const { me } = useChat();
  const user = userById(me);
  // Known only by the number so far: the name field starts empty rather than holding it.
  const unnamed = !!user.phone && user.fullName === formatPhone(user.phone);
  const [initial] = useState<ProfileDraft>(() => ({ fullName: unnamed ? "" : user.fullName, username: user.username ?? "", tone: user.tone, photo: user.photo, bio: user.bio ?? "" }));
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const changed = (Object.keys(initial) as (keyof ProfileDraft)[]).some((k) => (draft[k] ?? "") !== (initial[k] ?? ""));
  const ready = profileReady(draft, me) && changed;
  const save = () => {
    if (!ready) return;
    updatePerson(me, { fullName: draft.fullName, username: draft.username, tone: draft.tone, photo: draft.photo, bio: draft.bio?.trim() || undefined });
    onSaved();
  };
  return (
    <SubPage
      title="Edit profile"
      onBack={onBack}
      leaving={leaving}
      action={<button className={s.barSave} disabled={!ready} onClick={save}>Save</button>}
    >
      <AvatarPicker draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
      <ProfileFields draft={draft} userId={me} withBio onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
      <Group label="Your ID" note="Your phone number is your NOD ID. People who have it in their contacts can find you. Changing it isn’t part of the demo.">
        <Row title={formatPhone(user.phone) || "No number"} trailing={<span />} />
      </Group>
    </SubPage>
  );
}

function NotificationsPage({ leaving, onBack }: { leaving: boolean; onBack: () => void }) {
  const { me, state } = useChat();
  const [prefs, set] = usePrefs(me);
  const [perm, setPerm] = useState(getPermission("notifications"));
  const [asking, setAsking] = useState(false);
  const [muted, setMuted] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(`nod.chat.muted.${me}`) ?? "[]"); } catch { return []; } });
  const on = perm === "granted";
  const unmute = (id: string) => {
    const next = muted.filter((x) => x !== id);
    setMuted(next);
    try { localStorage.setItem(`nod.chat.muted.${me}`, JSON.stringify(next)); } catch { /* private mode */ }
    window.dispatchEvent(new Event("nod:muted"));
  };
  const flip = (v: boolean) => {
    if (v && perm === "prompt") { setAsking(true); return; }
    setPermission("notifications", v ? "granted" : "denied");
    setPerm(v ? "granted" : "denied");
  };
  return (
    <SubPage title="Notifications" onBack={onBack} leaving={leaving}>
      <Group note={on ? "Banners show up even when NOD is in the background." : "No banners. Reminders, plan stops and tasks still show in the chat and in Analytics."}>
        <Row icon={<Tile tone="clay"><IconBell size={16} /></Tile>} title="Allow notifications" trailing={<Toggle on={on} onChange={flip} label="Allow notifications" />} />
      </Group>
      <div className={on ? undefined : s.dimmed}>
        <Group label="Show a banner for">
          <Row title="Reminders" sub="When a reminder for you comes due" trailing={<Toggle on={prefs.notifyReminders} onChange={(v) => set({ notifyReminders: v })} label="Reminders" />} />
          <Row title="Plan stops" sub="Ten minutes before a stop you’re part of" trailing={<Toggle on={prefs.notifyPlans} onChange={(v) => set({ notifyPlans: v })} label="Plan stops" />} />
          <Row title="Tasks due" sub="When a task on a board is due for you" trailing={<Toggle on={prefs.notifyTasks} onChange={(v) => set({ notifyTasks: v })} label="Tasks due" />} />
        </Group>
        <Group note={prefs.previews ? "Banners say what it’s about, e.g. “Send the investor preview”." : "Banners only say something’s due, and where."}>
          <Row title="Show previews" trailing={<Toggle on={prefs.previews} onChange={(v) => set({ previews: v })} label="Show previews" />} />
        </Group>
      </div>
      <Group label="Muted chats" note={muted.length ? "Muted chats never show a banner or count towards Unread." : "Swipe a chat left in your inbox to mute it."}>
        {muted.length === 0 ? <Row title="Nothing muted" trailing={<span />} /> : muted.map((id) => {
          const chat = state.data.chats.find((c) => c.id === id);
          if (!chat) return null;
          const idn = chatIdentity(chat, me, userById);
          return (
            <Row
              key={id}
              icon={<Avatar glyph={idn.glyph} tone={idn.tone} photo={idn.photo} size={32} shape="circle" />}
              title={idn.label}
              trailing={<button className={s.pill} onClick={() => unmute(id)}><IconBellOff size={13} /> Unmute</button>}
            />
          );
        })}
      </Group>
      {asking && <PermissionAlert kind="notifications" onResolve={(g) => { setPermission("notifications", g ? "granted" : "denied"); setPerm(g ? "granted" : "denied"); setAsking(false); }} />}
    </SubPage>
  );
}

const PERMS: { kind: PermissionKind; label: string; icon: React.ReactNode; tone: AvatarTone }[] = [
  { kind: "notifications", label: "Notifications", icon: <IconBell size={16} />, tone: "clay" },
  { kind: "contacts", label: "Contacts", icon: <IconContacts size={16} />, tone: "sage" },
  { kind: "photos", label: "Photos", icon: <IconImage size={16} />, tone: "ochre" },
  { kind: "camera", label: "Camera", icon: <IconCamera size={16} />, tone: "graphite" },
  { kind: "location", label: "Location", icon: <IconLocation size={16} />, tone: "denim" },
];

function PrivacyPage({ leaving, onBack, onToast }: { leaving: boolean; onBack: () => void; onToast: (t: string) => void }) {
  const { me } = useChat();
  const [prefs, set] = usePrefs(me);
  const [, bump] = useState(0);
  return (
    <SubPage title="Privacy & security" onBack={onBack} leaving={leaving}>
      <Group label="Online status" note={prefs.lastSeen === "everyone" ? "People you chat with see a green dot when you’re here." : "Nobody sees when you’re online, even in a chat you have open."}>
        <div className={s.segRow}><Segmented value={prefs.lastSeen} options={[{ id: "everyone", label: "Everyone" }, { id: "nobody", label: "Nobody" }]} onChange={(v) => set({ lastSeen: v })} /></div>
      </Group>
      <Group note="Turned off, people see “Delivered” instead of “Read” on what they send you.">
        <Row title="Read receipts" trailing={<Toggle on={prefs.readReceipts} onChange={(v) => set({ readReceipts: v })} label="Read receipts" />} />
        <Row title="Typing indicator" sub="Let people see when you’re writing" trailing={<Toggle on={prefs.typing} onChange={(v) => set({ typing: v })} label="Typing indicator" />} />
      </Group>
      <Group label="Who can add me to Spaces" note={prefs.spaceInvites === "everyone" ? "Anyone you chat with can add you to a new Space." : "People can’t add you to a new Space; you’re left out when they make one."}>
        <div className={s.segRow}><Segmented value={prefs.spaceInvites} options={[{ id: "everyone", label: "Everyone" }, { id: "nobody", label: "Nobody" }]} onChange={(v) => set({ spaceInvites: v })} /></div>
      </Group>
      <Group label="App permissions" note="What you allowed when NOD asked. Reset one and NOD asks again next time it needs it.">
        {PERMS.map((p) => {
          const st = getPermission(p.kind);
          return (
            <Row
              key={p.kind}
              icon={<Tile tone={p.tone}>{p.icon}</Tile>}
              title={p.label}
              sub={st === "granted" ? "Allowed" : st === "denied" ? "Not allowed" : "Not asked yet"}
              trailing={st === "prompt" ? <span /> : <button className={s.pill} onClick={() => { setPermission(p.kind, "prompt"); bump((n) => n + 1); onToast(`NOD will ask about ${p.label.toLowerCase()} again`); }}>Reset</button>}
            />
          );
        })}
      </Group>
    </SubPage>
  );
}

function ChatsPage({ leaving, onBack }: { leaving: boolean; onBack: () => void }) {
  const { me } = useChat();
  const [prefs, set] = usePrefs(me);
  const [theme, setTheme] = useState<ThemePref>(readThemePref);
  const pick = (t: ThemePref) => { setTheme(t); requestTheme(t); };
  return (
    <SubPage title="Chats & appearance" onBack={onBack} leaving={leaving}>
      <Group label="Appearance">
        <div className={s.themes} role="radiogroup" aria-label="Appearance">
          {([["light", "Light"], ["dark", "Dark"], ["system", "Automatic"]] as const).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={theme === id} className={`${s.themeCard} ${theme === id ? s.themeOn : ""}`} onClick={() => pick(id)}>
              <span className={`${s.themePreview} ${s[`theme_${id}`]}`} aria-hidden="true"><i /><i /><i /></span>
              <b>{label}</b>
            </button>
          ))}
        </div>
      </Group>
      <Group note={prefs.enterToSend ? "Return sends; Shift+Return starts a new line. On a phone keyboard Return is always a new line." : "Return starts a new line; send with the arrow, or ⌘/Ctrl+Return."}>
        <Row icon={<Tile tone="graphite"><IconKeyboard size={16} /></Tile>} title="Return sends" trailing={<Toggle on={prefs.enterToSend} onChange={(v) => set({ enterToSend: v })} label="Return sends" />} />
      </Group>
    </SubPage>
  );
}

function LanguagePage({ leaving, onBack }: { leaving: boolean; onBack: () => void }) {
  const { me } = useChat();
  const [prefs, set] = usePrefs(me);
  return (
    <SubPage title="Language" onBack={onBack} leaving={leaving}>
      <Group note="NOD is in English for now. Your choice is kept, and the app follows it as translations arrive.">
        {LANGUAGES.map((l) => (
          <Row
            key={l.id}
            title={l.native}
            sub={l.native !== l.name ? l.name : undefined}
            onClick={() => set({ language: l.id })}
            trailing={prefs.language === l.id ? <span className={s.check}><IconCheck size={12} /></span> : <span />}
          />
        ))}
      </Group>
    </SubPage>
  );
}

const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function StoragePage({ leaving, onBack, onToast }: { leaving: boolean; onBack: () => void; onToast: (t: string) => void }) {
  const { state } = useChat();
  const [confirm, setConfirm] = useState<"media" | "reset" | null>(null);
  const sizes = useMemo(() => {
    const out = { chats: 0, mind: 0, you: 0 };
    try {
      for (const k of Object.keys(localStorage)) {
        const n = (localStorage.getItem(k) ?? "").length * 2;
        if (k.startsWith("nod.chat")) out.chats += n;
        else if (k.startsWith("nod.mind")) out.mind += n;
        else if (/^nod\.(people|accounts|settings|perm|theme)/.test(k)) out.you += n;
      }
    } catch { /* storage blocked */ }
    return out;
  }, []);
  const files = useMemo(() => Object.values(state.data.messages).flat().flatMap((m) => m.attachments).filter((a) => a.stored === "idb"), [state.data.messages]);
  return (
    <SubPage title="Data & storage" onBack={onBack} leaving={leaving}>
      <Group label="On this device" note="NOD keeps everything in this browser. Nothing leaves it except what you send.">
        <Row title="Chats and messages" value={kb(sizes.chats)} trailing={<span />} />
        <Row title="Mind" value={kb(sizes.mind)} trailing={<span />} />
        <Row title="Photos and files" value={`${files.length} ${files.length === 1 ? "file" : "files"}`} trailing={<span />} />
        <Row title="Profiles and settings" value={kb(sizes.you)} trailing={<span />} />
      </Group>
      <Group note="Photos and files you sent or saved are removed from this device. The messages themselves stay.">
        <Row title="Clear photos and files" danger onClick={() => setConfirm("media")} trailing={<span />} />
      </Group>
      <Group note="Back to the demo’s first run: chats, Mind, people, identities and settings.">
        <Row title="Reset demo data" danger onClick={() => setConfirm("reset")} trailing={<span />} />
      </Group>
      {confirm && (
        <Sheet title={confirm === "media" ? "Clear photos and files" : "Reset demo data"} onClose={() => setConfirm(null)}>
          {(close) => (
            <div className={s.logout}>
              <b>{confirm === "media" ? `Remove ${files.length} ${files.length === 1 ? "file" : "files"} from this device?` : "Start the demo over?"}</b>
              <p>{confirm === "media" ? "This can’t be undone." : "Everything NOD keeps in this browser is removed, and the app starts from its welcome."}</p>
              <button
                className={`${styles.primaryWide} ${s.dangerBtn}`}
                onClick={() => close(async () => {
                  if (confirm === "media") { await clearMedia(); onToast("Photos and files cleared"); }
                  else await resetDemoData();
                })}
              >
                {confirm === "media" ? "Clear" : "Reset"}
              </button>
            </div>
          )}
        </Sheet>
      )}
    </SubPage>
  );
}

function AboutPage({ leaving, onBack }: { leaving: boolean; onBack: () => void }) {
  return (
    <SubPage title="About NOD" onBack={onBack} leaving={leaving}>
      <div className={s.about}>
        <span className={s.aboutLogo}><Logo size={40} /></span>
        <b>NOD</b>
        <p>Talk it through. Keep what matters.</p>
        <small>Interactive prototype · 0.1.0</small>
      </div>
      <Group>
        <Row title="Chats and Spaces" sub="One-to-one, or a Space for any team or trip" trailing={<span />} />
        <Row title="Decide in the thread" sub="Polls, checklists, plans, boards, payments and invoices" trailing={<span />} />
        <Row title="Mind" sub="Your own collections, filled from any chat" trailing={<span />} />
        <Row title="Analytics" sub="Your spending, and everything that needs you" trailing={<span />} />
      </Group>
    </SubPage>
  );
}

function HelpSheet({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("idea");
  return (
    <Sheet title="Help & feedback" onClose={onClose} action={{ label: "Send", disabled: !text.trim(), onClick: onSent }}>
      <Segmented value={topic} options={[{ id: "idea", label: "An idea" }, { id: "bug", label: "Something’s off" }, { id: "question", label: "A question" }]} onChange={setTopic} />
      <textarea className={`${styles.plainInput} ${s.helpText}`} data-autofocus rows={5} placeholder={topic === "bug" ? "What happened, and what did you expect?" : topic === "question" ? "What would you like to know?" : "What would make NOD better for you?"} value={text} onChange={(e) => setText(e.target.value)} />
      <p className={styles.demoNote}>In the demo this goes nowhere; the real app would send it to the team.</p>
    </Sheet>
  );
}
