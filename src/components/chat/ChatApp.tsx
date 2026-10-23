"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { getForceFailure, setForceFailure } from "@/lib/chat/api";
import { getPrefs, resetDemoData, THEME_EVENT, useAccounts, type ThemePref } from "@/lib/chat/account";
import { groupInfo } from "@/lib/chat/groups";
import { mindOf } from "@/lib/chat/mind";
import { effectiveRule, isQuiet, readMutes } from "@/lib/chat/mutes";
import { findLink, zoneById } from "@/lib/chat/operation";
import { parseShareToken, shareToken, type ShareRef } from "@/lib/chat/share";
import { ChatProvider, useChat, userById } from "@/lib/chat/store";
import type { Chat } from "@/lib/chat/types";
import ChatView from "./ChatView";
import { IconArrowRight, IconChecklist, IconMoneyReceive, IconMoon, IconPin, IconSun, IconUserGroup } from "./Icons";
import Inbox from "./Inbox";
import Logo from "./Logo";
import Onboarding from "./Onboarding";
import { OperationOverlays } from "./operation/Overlays";
import { CompanionLink, PersonaSwitcher, personGroups, SecondWindowMenu } from "./operation/Personas";
import { OperationSimulator } from "./operation/Simulator";
import { SharedLink } from "./Share";
import StageField from "./StageField";
import { getPermission } from "./ui";
import styles from "./chat.module.css";

const LEAVE_MS = 220;
/** The screens stacked on a chat, each with its own history entry (see useBackLayer). */
const LAYER_KEYS = ["nodContact", "nodBoard", "nodOp", "nodOpsBoard", "nodZone", "nodRadio"] as const;
function stripLayers(s: Record<string, unknown>) {
  const out = { ...s };
  for (const k of LAYER_KEYS) delete out[k];
  return out;
}
const THEME_KEY = "nod.theme";
const STAGE_KEY = "nod.stage";

type Theme = "light" | "dark";

/** What "Automatic" resolves to right now. */
const systemTheme = (): Theme => (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** The hero stage is one solid colour; swap it here or from the Developer drawer. */
export const STAGE_COLORS = [
  { name: "Oat", value: "#E8E2D8" },
  { name: "Sage", value: "#CBD5C3" },
  { name: "Mist", value: "#D3DCE6" },
  { name: "Clay", value: "#E4C9B9" },
  { name: "Ink", value: "#1C1917" },
];

function readPref(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writePref(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

/** Takes a one-time parameter (an invite or share code) out of the address, without a new history entry. */
function dropParam(name: string) {
  const url = new URL(window.location.href);
  url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url);
}

/** Each demo person organises their Mind differently (see lib/chat/mind seeds). */
const MIND_PERSONAS: Record<string, string> = {
  me: "Alae keeps three collections: German, Work and Trip ideas.",
  charles: "Charles keeps a collection per client, plus Money.",
  reema: "Reema keeps one collection of home ideas, mostly pictures.",
  jamshad: "Jamshad starts with a blank Mind, for trying everything from scratch.",
  salman: "Salman starts with a blank Mind.",
};

function DevDrawer({ stage, onStage }: { stage: string; onStage: (v: string) => void }) {
  const { state, me, setMe, peers } = useChat();
  const [failing, setFailing] = useState(getForceFailure());
  // Everyone in the demo (29 people), by their crew at EWC.
  const people = personGroups(state.data.chats);

  return (
    <details className={styles.dev}>
      <summary className={styles.glassStrong}>
        <span className={`${styles.devDot} ${peers.length ? styles.live : ""}`} />
        Developer
      </summary>
      <div className={`${styles.devPanel} ${styles.glassStrong}`}>
        <p>
          {peers.length === 0
            ? "No other tab connected. Replies are simulated."
            : `${peers.length} tab${peers.length > 1 ? "s" : ""} live: ${peers.map((p) => userById(p.userId).name).join(", ")}`}
        </p>
        <div>
          <span className={styles.devLabel}>Signed in as</span>
          <div className={styles.devGroups}>
            {people.map((g) => (
              <div key={g.id} role="group" aria-label={g.label}>
                <span className={styles.devGroupLabel}>{g.label}</span>
                <div className={styles.devIds}>
                  {g.ids.map((id) => (
                    <button key={id} className={me === id ? styles.devOn : undefined} aria-pressed={me === id} onClick={() => setMe(id)}>
                      {userById(id).name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className={styles.devPersona}>
            <b>Mind:</b> {MIND_PERSONAS[me] ?? "A fresh, empty Mind"}
          </p>
        </div>
        <div>
          <span className={styles.devLabel}>Stage colour</span>
          <div className={styles.swatches}>
            {STAGE_COLORS.map((c) => (
              <button
                key={c.value}
                className={stage === c.value ? styles.swatchOn : undefined}
                style={{ background: c.value }}
                onClick={() => onStage(c.value)}
                aria-label={c.name}
                title={c.name}
              />
            ))}
          </div>
        </div>
        <label className={styles.devToggle}>
          <input
            type="checkbox"
            checked={failing}
            onChange={(e) => { setFailing(e.target.checked); setForceFailure(e.target.checked); }}
          />
          Force send failure
        </label>
        {/* Fresh seed for demos: conversations, drafts, identities, profiles, settings, permission answers and stored files. */}
        <button className={styles.devReset} onClick={() => { void resetDemoData(); }}>
          Reset demo data
        </button>
      </div>
    </details>
  );
}

interface Banner { id: number; chatId: string; title: string; body: string }

/**
 * Fires reminders when they come due, in whichever chat they live (and the
 * ones kept in your Mind), and raises a system-style banner — but only if
 * notifications were allowed.
 */
function ReminderWatcher({ onBanner }: { onBanner: (b: Banner) => void }) {
  const { state, me, updateCard } = useChat();
  const latest = useRef(state.data);
  useEffect(() => { latest.current = state.data; }, [state.data]);

  // Plan stops and task due dates are announced once per tab; whatever was
  // already due when the tab opened counts as seen, so a reload doesn't replay it.
  const announced = useRef<Set<string> | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const first = announced.current === null;
      const seen = (announced.current ??= new Set());
      const prefs = getPrefs(me);
      // `started`: already under way when this tab opened, so it was due before we could say so.
      const notify = (key: string, chat: Chat | null, title: string, body: string, started: boolean) => {
        if (seen.has(key)) return;
        seen.add(key);
        if (first && started) return;
        // Muted chats are left out by onBanner (showBanner), from the same rules the inbox uses.
        if (getPermission("notifications") === "granted") onBanner({ id: Date.now(), chatId: chat?.id ?? "", title, body: prefs.previews ? body : chat ? "Tap to open the chat" : "Open Mind to see it" });
      };
      // Reminders kept in Mind: once, when they come due, unless they were ticked off first.
      if (prefs.notifyReminders) {
        for (const b of Object.values(mindOf(me).blocks)) {
          if (b.kind !== "reminder" || b.done || !b.at || b.at > now) continue;
          notify(`mind:${b.id}:${b.at}`, null, "Reminder", b.title, true);
        }
      }
      for (const chat of latest.current.chats) {
        if (!chat.memberIds.includes(me)) continue;
        for (const m of latest.current.messages[chat.id] ?? []) {
          const c = m.card;
          if (c && !m.deletedAt && c.type === "plan") {
            const going = c.rsvps[me] === "going";
            for (const stop of c.days.flatMap((d) => d.stops)) {
              // Ten minutes ahead, for stops you're responsible for or plans you're going to.
              if (stop.doneBy || stop.at === null || stop.at - now > 10 * 60_000 || stop.at < now - 60_000) continue;
              if (prefs.notifyPlans && (stop.owner === me || (going && !stop.owner))) {
                notify(`plan:${stop.id}`, chat, `${c.title} · ${new Date(stop.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`, stop.place ? `${stop.title} at ${stop.place}` : stop.title, stop.at <= now);
              }
            }
          }
          if (c && !m.deletedAt && c.type === "project") {
            const done = c.columns[c.columns.length - 1]?.id;
            for (const task of Object.values(c.tasks)) {
              if (!prefs.notifyTasks || task.deleted || task.assignee !== me || task.column === done || task.due === null || task.due > now) continue;
              notify(`task:${task.id}:${task.due}`, chat, `Due now · ${c.name}`, task.title, true);
            }
          }
          if (!c || c.type !== "reminder" || c.firedAt !== null || c.at > now) continue;
          updateCard(m, (x) => (x.type === "reminder" ? { ...x, firedAt: Date.now() } : x));
          const forMe = c.audience === "everyone" || m.authorId === me;
          if (forMe && prefs.notifyReminders && getPermission("notifications") === "granted") {
            onBanner({ id: Date.now(), chatId: chat.id, title: `Reminder · ${chat.kind === "group" ? chat.name : userById(m.authorId).name}`, body: prefs.previews ? c.text : "Tap to open the chat" });
          }
        }
      }
    };
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [me, onBanner, updateCard]);
  return null;
}

/** iPhone 16 Pro-style shell: titanium band, side keys, black bezel, Dynamic Island. */
function Device() {
  const [openChat, setOpenChat] = useState<Chat | null>(null);
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  // A channel switch swaps the chat in place, without sliding a new screen in.
  const [instant, setInstant] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  // Another identity: whatever chat was open belongs to the previous one.
  const [shownFor, setShownFor] = useState<string | null>(null);
  const { state, saveFailed, me, setMe, joinByCode } = useChat();
  const accounts = useAccounts();
  // Nobody signed in on this device: the app starts at its welcome.
  const signedIn = !!accounts?.includes(me);
  if (shownFor !== me) {
    setShownFor(me);
    if (openChat) setOpenChat(null);
  }
  // The layers the old identity had open (Operation page, zone, radio, board, contact page) are about to
  // unmount, and each would step back through history for its own entry. Clear their keys first, before
  // their cleanups run, so the entry stays the chat's and nothing pops twice.
  useLayoutEffect(() => {
    const s = window.history.state;
    if (s && typeof s === "object" && LAYER_KEYS.some((k) => k in s)) window.history.replaceState(stripLayers(s), "");
  }, [me]);
  const latestChats = useRef(state.data.chats);
  useEffect(() => { latestChats.current = state.data.chats; }, [state.data.chats]);

  // On a phone the device is the page. iOS Safari lays the keyboard over the
  // page instead of resizing it, so follow the visual viewport: the composer
  // then sits right above the keyboard rather than behind it.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = deviceRef.current;
    if (!vv || !el) return;
    const phone = window.matchMedia("(max-width: 520px)");
    const fit = () => {
      if (!phone.matches) {
        el.style.removeProperty("--vv-h");
        el.style.removeProperty("--vv-top");
        return;
      }
      el.style.setProperty("--vv-h", `${vv.height}px`);
      el.style.setProperty("--vv-top", `${vv.offsetTop}px`);
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    phone.addEventListener("change", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      phone.removeEventListener("change", fit);
    };
  }, []);

  // The open chat as it is now: leaving a group (or losing a channel) closes it.
  const openLive = openChat ? state.data.chats.find((c) => c.id === openChat.id) ?? openChat : null;
  // Whether it can be shown to this person: a zone channel can close under them, or belong to someone else.
  const showing = !!openLive && openLive.memberIds.includes(me) && !openLive.removedAt;

  // Say so once if storage fills up: nothing new would survive a reload.
  const [storageWarned, setStorageWarned] = useState(false);
  if (saveFailed && !storageWarned) {
    setStorageWarned(true);
    setBanner({ id: -1, chatId: "", title: "Storage is full", body: "New messages stay in this tab, but they won't be there after a reload." });
  }

  /** Drops a banner in for five seconds, whatever the mutes say (see showBanner). */
  const flash = useCallback((b: Banner) => {
    setBanner(b);
    setTimeout(() => setBanner((cur) => (cur?.id === b.id ? null : cur)), 5000);
  }, []);

  const showBanner = useCallback((b: Banner) => {
    // A chat you've quietened (or its group) doesn't banner; storage warnings always do.
    const chat = latestChats.current.find((c) => c.id === b.chatId);
    if (chat && isQuiet(effectiveRule(readMutes(me), chat, Date.now()))) return;
    flash(b);
  }, [me, flash]);

  // Operation banners (a normal broadcast, an All-call on the radio). Critical
  // broadcasts don't come through here: they take over the screen, mute or not.
  const bannerSeq = useRef(0);
  const opBanner = useCallback((b: Omit<Banner, "id">) => {
    bannerSeq.current += 1;
    showBanner({ ...b, id: Date.now() + bannerSeq.current });
  }, [showBanner]);

  const show = useCallback((chat: Chat, messageId?: string) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setLeaving(false);
    setOpenChat(chat);
    setInstant(false);
    // Cleared when not given, so reopening the same chat later doesn't replay an old jump.
    setFocusMessageId(messageId ?? null);
  }, []);

  // Another channel of the open group: same history entry, no slide.
  const switchChannel = useCallback((chat: Chat) => {
    setOpenChat(chat);
    setInstant(true);
    setFocusMessageId(null);
    if (window.history.state?.nodChat) window.history.replaceState({ ...window.history.state, nodChat: chat.id }, "");
  }, []);

  const hide = useCallback((immediate?: boolean) => {
    if (immediate) {
      // A swipe-back already slid the screen away; just unmount it.
      setOpenChat(null);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    leaveTimer.current = setTimeout(() => {
      setOpenChat(null);
      setLeaving(false);
    }, LEAVE_MS);
  }, []);
  // A chat that can't be shown any more (its channel closed, or it isn't this person's) would leave the
  // inbox pushed aside and inert behind nothing: let go of it, and of its history entry.
  useEffect(() => {
    if (!openChat || showing) return;
    if (window.history.state?.nodChat) window.history.back();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else hide(true);
  }, [openChat, showing, hide]);

  // An open chat is a history entry, so the phone's Back (or a browser back
  // swipe) closes the chat instead of leaving the site. Next.js keeps its own
  // router state inside these entries.
  const openRef = useRef<Chat | null>(null);
  const popImmediate = useRef(false);
  useEffect(() => { openRef.current = openChat; }, [openChat]);
  const switching = useRef(false);
  const meRef = useRef(me);
  useEffect(() => { meRef.current = me; }, [me]);
  const open = (chat: Chat, messageId?: string) => {
    const s = window.history.state;
    const layers = s && typeof s === "object" ? LAYER_KEYS.filter((k) => k in s).length : 0;
    if (layers && s?.nodChat) {
      // Switching chats (a banner tap, a move request) while layers are open: each layer has its own
      // history entry on top of the chat's. Step back over them to the chat's entry, then make that
      // entry the new chat's, so Back from here leaves the chat and nothing stale is left behind.
      // The popstate for the chat's entry would reopen the old chat; `switching` makes it a no-op.
      switching.current = true;
      const settle = () => {
        switching.current = false;
        window.removeEventListener("popstate", settle);
        window.history.replaceState({ ...stripLayers(window.history.state ?? {}), nodChat: chat.id }, "");
        show(chat, messageId);
      };
      window.addEventListener("popstate", settle);
      setTimeout(() => { if (switching.current) settle(); }, 500);
      window.history.go(-layers);
      return;
    }
    show(chat, messageId);
    if (s?.nodChat) {
      window.history.replaceState({ ...stripLayers(s), nodChat: chat.id }, "");
    } else {
      // A chat is a screen inside the phone: Back shouldn't scroll the page around it.
      window.history.scrollRestoration = "manual";
      window.history.pushState({ nodChat: chat.id }, "");
    }
  };
  // For the Operation overlays (a move prompt's "open the chat"): a stable callback that opens by id.
  const openById = useRef<(chatId: string) => void>(() => {});
  useEffect(() => {
    openById.current = (chatId) => {
      const chat = latestChats.current.find((c) => c.id === chatId);
      if (chat && chat.id !== openRef.current?.id) open(chat);
    };
  });
  const openChatById = useCallback((chatId: string) => openById.current(chatId), []);
  // An invite link (nod.app/g/<code>, here ?join=<code>) joins the group and opens it, once loaded and signed in.
  const joined = useRef(false);
  useEffect(() => {
    if (joined.current || !state.hydrated || !signedIn) return;
    const code = new URLSearchParams(window.location.search).get("join");
    if (!code) return;
    joined.current = true;
    // Used once: a reload after leaving the group mustn't join it again.
    dropParam("join");
    // An Operation's crew link also hands out a crew (and maybe a zone): say which (to someone new to it).
    const crew = findLink(state.data.chats, code);
    const wasMember = !!crew && crew.group.memberIds.includes(me);
    const group = joinByCode(code);
    if (!group) return;
    let joinedAs: Banner | null = null;
    if (crew && !wasMember) {
      const info = groupInfo(crew.group);
      const roles = crew.link.roleIds.map((r) => info.roles.find((x) => x.id === r)?.name).filter((n): n is string => !!n);
      const as = roles.length > 1 ? `${roles.slice(0, -1).join(", ")} and ${roles[roles.length - 1]}` : roles[0];
      const zone = info.operation && crew.link.zoneId ? zoneById(info.operation, crew.link.zoneId) : undefined;
      joinedAs = {
        id: Date.now(),
        chatId: group.id,
        title: `Joined ${crew.group.name}${as ? ` as ${as}` : ""}`,
        body: zone ? `You’re checked in to ${zone.code} · ${zone.name}.` : `From the crew link “${crew.link.label}”.`,
      };
    }
    setTimeout(() => {
      open(group);
      if (joinedAs) flash(joinedAs);
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hydrated, signedIn, joinByCode]);

  // A share link from Mind (nod.app/m/<token>, here ?mind=<token>) opens what it points at, or asks for access.
  const [linkShare, setLinkShare] = useState<ShareRef | null>(null);
  const shareOpened = useRef(false);
  useEffect(() => {
    if (shareOpened.current || !state.hydrated || !signedIn) return;
    const ref = parseShareToken(new URLSearchParams(window.location.search).get("mind") ?? "");
    if (!ref) return;
    shareOpened.current = true;
    dropParam("mind");
    setTimeout(() => setLinkShare(ref), 300);
  }, [state.hydrated, signedIn]);

  const back = (immediate?: boolean) => {
    if (!window.history.state?.nodChat) { hide(immediate); return; }
    popImmediate.current = !!immediate;
    window.history.back();
  };
  useEffect(() => {
    const onPop = () => {
      // A same-page #anchor adds an entry with no state; it isn't a Back out of the chat.
      if (window.history.state === null) return;
      // open() is stepping back over layer entries to switch chats; it handles this one itself.
      if (switching.current) return;
      const id: string | undefined = window.history.state?.nodChat;
      if (!id && openRef.current) {
        // In an Operation, Back from a zone's or a crew's channel goes to its lobby (#general), not out of
        // the Operation; Back again leaves. A swipe from the edge has already slid out to the inbox: it leaves.
        const open = openRef.current;
        const lobby = !popImmediate.current && open.groupId
          ? latestChats.current.find((c) => c.id === open.groupId && !c.removedAt && c.memberIds.includes(meRef.current))
          : undefined;
        if (lobby && groupInfo(lobby).operation) {
          window.history.pushState({ nodChat: lobby.id }, "");
          switchChannel(lobby);
          return;
        }
        hide(popImmediate.current);
        popImmediate.current = false;
      } else if (id && openRef.current?.id !== id) {
        // Forward again: reopen the chat this entry belongs to, if it's still this person's to see.
        const chat = latestChats.current.find((c) => c.id === id);
        if (chat && chat.memberIds.includes(meRef.current) && !chat.removedAt) show(chat);
        else if (!openRef.current) window.history.replaceState(stripLayers({ ...window.history.state, nodChat: undefined }), "");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [hide, show, switchChannel]);

  return (
    <div ref={deviceRef} className={styles.device} data-device>
      <i className={`${styles.key} ${styles.keyAction}`} />
      <i className={`${styles.key} ${styles.keyVolUp}`} />
      <i className={`${styles.key} ${styles.keyVolDown}`} />
      <i className={`${styles.key} ${styles.keyPower}`} />
      <div className={styles.bezel}>
        <div className={styles.screenBox}>
          <div className={styles.island} />
          {accounts === null ? null : !signedIn ? (
            <Onboarding key="welcome" mode="first" onDone={(id) => setMe(id)} />
          ) : (
            <>
              <Inbox key={me} onOpen={open} pushed={showing && !leaving} />
              {showing && openLive && (
                <ChatView
                  key={openLive.id}
                  chat={openLive}
                  leaving={leaving}
                  onBack={back}
                  focusMessageId={focusMessageId}
                  onSwitchChannel={switchChannel}
                  instant={instant}
                />
              )}
              {linkShare && <SharedLink key={shareToken(linkShare)} share={linkShare} onClose={() => setLinkShare(null)} />}
              <ReminderWatcher onBanner={showBanner} />
              {/* Live Operations: the critical takeover and move prompts for this person, and the venue's own life. */}
              <OperationOverlays key={`op-${me}`} onBanner={opBanner} onOpenChat={openChatById} />
              <OperationSimulator />
            </>
          )}
          {banner && (
            <button
              key={banner.id}
              className={`${styles.banner} ${styles.glassStrong}`}
              onClick={() => {
                const chat = state.data.chats.find((c) => c.id === banner.chatId);
                setBanner(null);
                if (chat && chat.id !== openChat?.id) open(chat);
              }}
            >
              <span className={styles.bannerIcon}><Logo size={18} /></span>
              <span className={styles.bannerText}>
                <b>{banner.title}</b>
                <span>{banner.body}</span>
              </span>
              <small>now</small>
            </button>
          )}
          <div className={styles.homeBar} />
        </div>
      </div>
    </div>
  );
}

export default function ChatApp() {
  // Light is the product's primary mode; dark is opt-in and remembered.
  const [pref, setPref] = useState<ThemePref>("light");
  const [system, setSystem] = useState<Theme>("light");
  const theme: Theme = pref === "system" ? system : pref;
  const [stage, setStage] = useState(STAGE_COLORS[0].value);

  useEffect(() => {
    // Restoring saved preferences after mount keeps server and client HTML identical.
    const saved = readPref(THEME_KEY, "light");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPref(saved === "dark" || saved === "system" ? saved : "light");
    setSystem(systemTheme());
    setStage(readPref(STAGE_KEY, STAGE_COLORS[0].value));
    // Settings → Appearance asks for a theme; "Automatic" follows the device.
    const onPick = (e: Event) => { const t = (e as CustomEvent<ThemePref>).detail; setPref(t); writePref(THEME_KEY, t); };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => setSystem(systemTheme());
    window.addEventListener(THEME_EVENT, onPick);
    mq.addEventListener("change", onSystem);
    return () => { window.removeEventListener(THEME_EVENT, onPick); mq.removeEventListener("change", onSystem); };
  }, []);

  // The page sits inside the global <body>; keep its backdrop and scrollbars in step.
  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    document.body.style.background = theme === "dark" ? "#0C0A09" : "#FAFAF9";
  }, [theme]);

  const flipTheme = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setPref(next);
    writePref(THEME_KEY, next);
  };

  const pickStage = (value: string) => {
    setStage(value);
    writePref(STAGE_KEY, value);
  };

  const stageIsDark = stage === "#1C1917";

  return (
    <ChatProvider>
      <div
        className={`${styles.theme} ${styles.page}`}
        data-theme={theme}
        style={{ ["--stage" as string]: stage }}
      >
        <header className={styles.topbar}>
          <Link href="/" className={styles.wordmark} aria-label="NOD home">
            <Logo size={28} />
            <span>nod</span>
          </Link>
          <div className={styles.topActions}>
            <button
              className={styles.themeSwitch}
              role="switch"
              aria-checked={theme === "dark"}
              aria-label="Dark mode"
              onClick={flipTheme}
            >
              <span className={styles.themeKnob}>{theme === "light" ? <IconSun size={14} /> : <IconMoon size={14} />}</span>
            </button>
            {/* A second window signs in as someone else, so the two can talk (or run an Operation together). */}
            <SecondWindowMenu className={styles.cta} />
          </div>
        </header>

        <section className={styles.hero}>
          <p className={styles.pill}><span>New</span>Mind: keep anything from any chat</p>
          <h1 className={styles.heroTitle}>Talk it through.<br /><em>Keep what matters.</em></h1>
          <p className={styles.heroLede}>
            Run your projects from the conversation. A group for every team, polls, checklists and payments in the thread, and Mind to keep what you need.
          </p>
          <div className={styles.heroCtas}>
            <a className={styles.cta} href="#demo">Try the live demo <IconArrowRight size={16} /></a>
            <CompanionLink className={styles.ctaGhost}>Open a second tab to chat with yourself</CompanionLink>
          </div>
        </section>

        <section id="demo" className={`${styles.stage} ${stageIsDark ? styles.stageDark : ""}`}>
          <StageField dark={stageIsDark} />
          <div data-float className={`${styles.floatCard} ${styles.fcLeftTop} ${styles.glass}`}>
            <span className={styles.fcIcon}><IconPin size={16} /></span>
            <div><b>Save it to Mind</b><span>Keep decisions, files and links from any chat, in collections of your own.</span></div>
          </div>
          <div data-float className={`${styles.floatCard} ${styles.fcLeftBottom} ${styles.glass}`}>
            <span className={styles.fcIcon}><IconChecklist size={16} /></span>
            <div><b>Decide in the thread</b><span>Polls, checklists with owners, reminders.</span></div>
          </div>
          <div data-float className={`${styles.floatCard} ${styles.fcRightTop} ${styles.glass}`}>
            <span className={styles.fcIcon}><IconUserGroup size={16} /></span>
            <div><b>A group for every project</b><span>Channels for each topic, roles for who sees what.</span></div>
          </div>
          <div data-float className={`${styles.floatCard} ${styles.fcRightBottom} ${styles.glass}`}>
            <span className={styles.fcIcon}><IconMoneyReceive size={16} /></span>
            <div><b>Collect from everyone</b><span>Payments, files, places and events, sent straight into the chat.</span></div>
          </div>

          {/* Whose phone this is: switch to anyone at EWC, or open them in a window of their own. */}
          <PersonaSwitcher />
          <Device />
        </section>

        <footer className={styles.footer}>
          <Logo size={18} />
          <span>NOD · Interactive prototype</span>
        </footer>

        <DevDrawer stage={stage} onStage={pickStage} />
      </div>
    </ChatProvider>
  );
}
