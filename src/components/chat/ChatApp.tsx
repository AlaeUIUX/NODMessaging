"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getForceFailure, setForceFailure } from "@/lib/chat/api";
import { USERS } from "@/lib/chat/seed";
import { ChatProvider, useChat, userById } from "@/lib/chat/store";
import type { Chat } from "@/lib/chat/types";
import ChatView from "./ChatView";
import { IconArrowRight, IconBolt, IconLock, IconMoon, IconReply, IconSun } from "./Icons";
import Inbox from "./Inbox";
import { Emoji } from "@/lib/chat/emoji";
import Logo from "./Logo";
import { getPermission } from "./ui";
import styles from "./chat.module.css";

const LEAVE_MS = 260;
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
          onClick={() => {
            // Fresh seed for demos: conversations, drafts, identity and permission answers.
            try {
              Object.keys(localStorage).filter((k) => k.startsWith("nod.chat") || k.startsWith("nod.perm")).forEach((k) => localStorage.removeItem(k));
              sessionStorage.removeItem("nod.chat.me");
            } catch { /* private mode */ }
            location.reload();
          }}
        >
          Reset demo data
        </button>
        <div className={styles.devLinks}>
          <Link href="/prototype">Legacy prototype</Link>
          <Link href="/onboarding-test">Onboarding</Link>
        </div>
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

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const chat of latest.current.chats) {
        for (const m of latest.current.messages[chat.id] ?? []) {
          const c = m.card;
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
  const { state } = useChat();

  const showBanner = useCallback((b: Banner) => {
    setBanner(b);
    setTimeout(() => setBanner((cur) => (cur?.id === b.id ? null : cur)), 5000);
  }, []);

  const open = (chat: Chat) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setLeaving(false);
    setOpenChat(chat);
  };

  const back = () => {
    setLeaving(true);
    leaveTimer.current = setTimeout(() => {
      setOpenChat(null);
      setLeaving(false);
    }, LEAVE_MS);
  };

  return (
    <div className={styles.device}>
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
            <a className={styles.cta} href="/" target="_blank" rel="noopener">
              Open a second window
            </a>
          </div>
        </header>

        <section className={styles.hero}>
          <p className={styles.pill}><span>New</span>Spaces, formatting and reactions</p>
          <h1 className={styles.heroTitle}>Say more.<br /><em>With less.</em></h1>
          <p className={styles.heroLede}>
            A calm, private messenger for the people you actually talk to. Every tap, hold and swipe below is live.
          </p>
          <div className={styles.heroCtas}>
            <a className={styles.cta} href="#demo">Try the live demo <IconArrowRight size={16} /></a>
            <a className={styles.ctaGhost} href="/" target="_blank" rel="noopener">Open a second tab to chat with yourself</a>
          </div>
        </section>

        <section id="demo" className={`${styles.stage} ${stageIsDark ? styles.stageDark : ""}`}>
          <div className={`${styles.floatCard} ${styles.fcLeftTop} ${styles.glass}`}>
            <span className={styles.fcIcon}><IconLock size={16} /></span>
            <div><b>End-to-end encrypted</b><span>Only the people in a chat can read it.</span></div>
          </div>
          <div className={`${styles.floatCard} ${styles.fcLeftBottom} ${styles.glass}`}>
            <span className={styles.fcEmoji}><Emoji char="❤️" /><Emoji char="👍" /><Emoji char="😂" /></span>
            <div><b>Hold any message</b><span>React, reply, copy, pin.</span></div>
          </div>
          <div className={`${styles.floatCard} ${styles.fcRightTop} ${styles.glass}`}>
            <span className={styles.fcIcon}><IconBolt size={16} /></span>
            <div><b>Real-time, honestly</b><span>Sending, sent, delivered, read.</span></div>
          </div>
          <div className={`${styles.floatCard} ${styles.fcRightBottom} ${styles.glass}`}>
            <span className={styles.fcIcon}><IconReply size={16} /></span>
            <div><b>Swipe to reply</b><span>Tap Aa in a chat to format.</span></div>
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
