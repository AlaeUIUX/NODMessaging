"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getForceFailure, setForceFailure } from "@/lib/chat/api";
import { clearMedia } from "@/lib/chat/media";
import { USERS } from "@/lib/chat/seed";
import { ChatProvider, useChat, userById } from "@/lib/chat/store";
import type { Chat } from "@/lib/chat/types";
import ChatView from "./ChatView";
import { IconArrowRight, IconChecklist, IconMoneyReceive, IconMoon, IconPin, IconSun, IconUserGroup } from "./Icons";
import Inbox from "./Inbox";
import Logo from "./Logo";
import StageField from "./StageField";
import { getPermission } from "./ui";
import styles from "./chat.module.css";

const LEAVE_MS = 220;
const THEME_KEY = "nod.theme";
const STAGE_KEY = "nod.stage";

type Theme = "light" | "dark";

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

/** Each demo person organises their Mind differently (see lib/chat/mind seeds). */
const MIND_PERSONAS: Record<string, string> = {
  me: "Alae keeps three collections: German, Work and Trip ideas.",
  charles: "Charles keeps a collection per client, plus Money.",
  reema: "Reema keeps one collection of home ideas, mostly pictures.",
  jamshad: "Jamshad starts with a blank Mind, for trying everything from scratch.",
  salman: "Salman starts with a blank Mind.",
};

function DevDrawer({ stage, onStage }: { stage: string; onStage: (v: string) => void }) {
  const { me, setMe, peers } = useChat();
  const [failing, setFailing] = useState(getForceFailure());

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
            : `${peers.length} tab${peers.length > 1 ? "s" : ""} live: ${peers.map((p) => p.userId).join(", ")}`}
        </p>
        <div>
          <span className={styles.devLabel}>Signed in as</span>
          <div className={styles.devIds}>
            {USERS.map((u) => (
              <button key={u.id} className={me === u.id ? styles.devOn : undefined} onClick={() => setMe(u.id)}>
                {u.name}
              </button>
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
        <button
          className={styles.devReset}
          onClick={async () => {
            // Fresh seed for demos: conversations, drafts, identity, permission answers and stored files.
            try {
              Object.keys(localStorage).filter((k) => k.startsWith("nod.chat") || k.startsWith("nod.perm") || k.startsWith("nod.mind")).forEach((k) => localStorage.removeItem(k));
              sessionStorage.removeItem("nod.chat.me");
            } catch { /* private mode */ }
            await clearMedia();
            location.reload();
          }}
        >
          Reset demo data
        </button>
      </div>
    </details>
  );
}

interface Banner { id: number; chatId: string; title: string; body: string }

/**
 * Fires reminders when they come due, in whichever chat they live, and raises
 * a system-style banner — but only if notifications were allowed.
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
      let muted: string[] = [];
      try { muted = JSON.parse(localStorage.getItem(`nod.chat.muted.${me}`) ?? "[]"); } catch { /* private mode */ }
      // `started`: already under way when this tab opened, so it was due before we could say so.
      const notify = (key: string, chat: Chat, title: string, body: string, started: boolean) => {
        if (seen.has(key)) return;
        seen.add(key);
        if (first && started) return;
        if (!muted.includes(chat.id) && getPermission("notifications") === "granted") onBanner({ id: Date.now(), chatId: chat.id, title, body });
      };
      for (const chat of latest.current.chats) {
        if (!chat.memberIds.includes(me)) continue;
        for (const m of latest.current.messages[chat.id] ?? []) {
          const c = m.card;
          if (c && !m.deletedAt && c.type === "plan") {
            const going = c.rsvps[me] === "going";
            for (const stop of c.days.flatMap((d) => d.stops)) {
              // Ten minutes ahead, for stops you're responsible for or plans you're going to.
              if (stop.doneBy || stop.at === null || stop.at - now > 10 * 60_000 || stop.at < now - 60_000) continue;
              if (stop.owner === me || (going && !stop.owner)) {
                notify(`plan:${stop.id}`, chat, `${c.title} · ${new Date(stop.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`, stop.place ? `${stop.title} at ${stop.place}` : stop.title, stop.at <= now);
              }
            }
          }
          if (c && !m.deletedAt && c.type === "project") {
            const done = c.columns[c.columns.length - 1]?.id;
            for (const task of Object.values(c.tasks)) {
              if (task.deleted || task.assignee !== me || task.column === done || task.due === null || task.due > now) continue;
              notify(`task:${task.id}:${task.due}`, chat, `Due now · ${c.name}`, task.title, true);
            }
          }
          if (!c || c.type !== "reminder" || c.firedAt !== null || c.at > now) continue;
          updateCard(m, (x) => (x.type === "reminder" ? { ...x, firedAt: Date.now() } : x));
          const forMe = c.audience === "everyone" || m.authorId === me;
          if (forMe && getPermission("notifications") === "granted") {
            onBanner({ id: Date.now(), chatId: chat.id, title: `Reminder · ${chat.kind === "group" ? chat.name : userById(m.authorId).name}`, body: c.text });
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
  const [leaving, setLeaving] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  const { state, saveFailed } = useChat();
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

  // Say so once if storage fills up: nothing new would survive a reload.
  const [storageWarned, setStorageWarned] = useState(false);
  if (saveFailed && !storageWarned) {
    setStorageWarned(true);
    setBanner({ id: -1, chatId: "", title: "Storage is full", body: "New messages stay in this tab, but they won't be there after a reload." });
  }

  const showBanner = useCallback((b: Banner) => {
    setBanner(b);
    setTimeout(() => setBanner((cur) => (cur?.id === b.id ? null : cur)), 5000);
  }, []);

  const show = useCallback((chat: Chat) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setLeaving(false);
    setOpenChat(chat);
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

  // An open chat is a history entry, so the phone's Back (or a browser back
  // swipe) closes the chat instead of leaving the site. Next.js keeps its own
  // router state inside these entries.
  const openRef = useRef<Chat | null>(null);
  const popImmediate = useRef(false);
  useEffect(() => { openRef.current = openChat; }, [openChat]);
  const open = (chat: Chat) => {
    show(chat);
    if (window.history.state?.nodChat) {
      // Switching chats (a banner tap) while a contact page or board is open: this entry now
      // belongs to the new chat, so the old layer's cleanup mustn't step back from it.
      const { nodContact, nodBoard, ...rest } = window.history.state;
      void nodContact; void nodBoard;
      window.history.replaceState({ ...rest, nodChat: chat.id }, "");
    } else {
      window.history.pushState({ nodChat: chat.id }, "");
    }
  };
  const back = (immediate?: boolean) => {
    if (!window.history.state?.nodChat) { hide(immediate); return; }
    popImmediate.current = !!immediate;
    window.history.back();
  };
  useEffect(() => {
    const onPop = () => {
      // A same-page #anchor adds an entry with no state; it isn't a Back out of the chat.
      if (window.history.state === null) return;
      const id: string | undefined = window.history.state?.nodChat;
      if (!id && openRef.current) {
        hide(popImmediate.current);
        popImmediate.current = false;
      } else if (id && openRef.current?.id !== id) {
        // Forward again: reopen the chat this entry belongs to.
        const chat = latestChats.current.find((c) => c.id === id);
        if (chat) show(chat);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [hide, show]);

  return (
    <div ref={deviceRef} className={styles.device} data-device>
      <i className={`${styles.key} ${styles.keyAction}`} />
      <i className={`${styles.key} ${styles.keyVolUp}`} />
      <i className={`${styles.key} ${styles.keyVolDown}`} />
      <i className={`${styles.key} ${styles.keyPower}`} />
      <div className={styles.bezel}>
        <div className={styles.screenBox}>
          <div className={styles.island} />
          <Inbox onOpen={open} pushed={!!openChat && !leaving} />
          {openChat && <ChatView key={openChat.id} chat={openChat} leaving={leaving} onBack={back} />}
          <ReminderWatcher onBanner={showBanner} />
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
  const [theme, setTheme] = useState<Theme>("light");
  const [stage, setStage] = useState(STAGE_COLORS[0].value);

  useEffect(() => {
    // Restoring saved preferences after mount keeps server and client HTML identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(readPref(THEME_KEY, "light") === "dark" ? "dark" : "light");
    setStage(readPref(STAGE_KEY, STAGE_COLORS[0].value));
  }, []);

  // The page sits inside the global <body>; keep its backdrop and scrollbars in step.
  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    document.body.style.background = theme === "dark" ? "#0C0A09" : "#FAFAF9";
  }, [theme]);

  const flipTheme = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
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
            {/* The second window signs in as Charles, so the two can talk. */}
            <a className={styles.cta} href="/?as=charles" target="_blank" rel="noopener">
              Open a second window
            </a>
          </div>
        </header>

        <section className={styles.hero}>
          <p className={styles.pill}><span>New</span>Mind: keep anything from any chat</p>
          <h1 className={styles.heroTitle}>Talk it through.<br /><em>Keep what matters.</em></h1>
          <p className={styles.heroLede}>
            Run your projects from the conversation. A Space for every team, polls, checklists and payments in the thread, and Mind to keep what you need.
          </p>
          <div className={styles.heroCtas}>
            <a className={styles.cta} href="#demo">Try the live demo <IconArrowRight size={16} /></a>
            <a className={styles.ctaGhost} href="/?as=charles" target="_blank" rel="noopener">Open a second tab to chat with yourself</a>
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
            <div><b>A Space for every project</b><span>One group per team, client or launch.</span></div>
          </div>
          <div data-float className={`${styles.floatCard} ${styles.fcRightBottom} ${styles.glass}`}>
            <span className={styles.fcIcon}><IconMoneyReceive size={16} /></span>
            <div><b>Collect from everyone</b><span>Payments, files, places and events, sent straight into the chat.</span></div>
          </div>

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
