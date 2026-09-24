"use client";

import { useState } from "react";
import Link from "next/link";
import { getForceFailure, setForceFailure } from "@/lib/chat/api";
import { USERS } from "@/lib/chat/seed";
import { ChatProvider, useChat } from "@/lib/chat/store";
import type { Chat } from "@/lib/chat/types";
import ChatView from "./ChatView";
import Inbox from "./Inbox";
import styles from "./chat.module.css";

function DevBar() {
  const { me, setMe, peers } = useChat();
  const [failing, setFailing] = useState(getForceFailure());

  return (
    <div className={styles.devBar}>
      <span>
        <span className={`${styles.peerDot} ${peers.length === 0 ? styles.solo : ""}`} />
        {peers.length === 0
          ? "No other tab connected — replies are simulated"
          : `${peers.length} tab${peers.length > 1 ? "s" : ""} connected: ${peers.map((p) => p.userId).join(", ")}`}
      </span>

      <span>
        <b>You are:</b>{" "}
        <span className={styles.identityGroup}>
          {USERS.map((u) => (
            <button
              key={u.id}
              className={`${styles.identityBtn} ${me === u.id ? styles.active : ""}`}
              onClick={() => setMe(u.id)}
            >
              {u.name}
            </button>
          ))}
        </span>
      </span>

      <label className={styles.devToggle}>
        <input
          type="checkbox"
          checked={failing}
          onChange={(e) => { setFailing(e.target.checked); setForceFailure(e.target.checked); }}
        />
        Force send failure
      </label>
    </div>
  );
}

function Shell() {
  const [openChat, setOpenChat] = useState<Chat | null>(null);

  return (
    <>
      <DevBar />
      <div className="phone">
        <div className="notch" />
        {openChat
          ? <ChatView chat={openChat} onBack={() => setOpenChat(null)} />
          : <Inbox onOpen={setOpenChat} />}
      </div>
    </>
  );
}

export default function ChatApp() {
  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div className={styles.navRow}>
          <Link href="/">Reference prototype</Link>
          <Link href="/onboarding-test">Onboarding Test</Link>
        </div>
        <h1>NOD Chat</h1>
        <p>
          Phase 0 + Phase 1 of the build spec, running for real: optimistic send with rollback,
          realtime over BroadcastChannel, and a persisted message model. Open this page in a second
          tab and switch identity to talk to yourself live.
        </p>
      </div>

      <ChatProvider>
        <Shell />
      </ChatProvider>
    </div>
  );
}
