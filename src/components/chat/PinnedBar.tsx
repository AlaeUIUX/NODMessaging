"use client";

import { useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { emojify } from "@/lib/chat/emoji";
import { stripFormatting } from "@/lib/chat/markdown";
import { activePins, PIN_FOR, PIN_FOR_DEFAULT, PIN_LIMIT, pinLeft, pinMs, type PinFor } from "@/lib/chat/pins";
import { useChat, userById } from "@/lib/chat/store";
import type { Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconPin } from "./Icons";
import { Sheet, useNow } from "./ui";
import styles from "./chat.module.css";

/*
   Pinned messages, the WhatsApp way: a bar under the header shows one pin at
   a time. Tapping it goes to that message and moves the bar on to the next;
   the pin at its end lists them all, to unpin. Pinning asks for how long.
*/

/** One line for a pinned message: its text, or what it is when it has none. */
export function pinPreview(m: Message) {
  if (m.kind === "voice") return "Voice message";
  if (m.card) {
    const c = m.card as Record<string, unknown>;
    const name = [c.title, c.question, c.name, c.text, c.place, c.prompt].find((x) => typeof x === "string" && x);
    return (name as string | undefined) ?? "A card";
  }
  const text = stripFormatting(m.body).replace(/\s+/g, " ").trim();
  if (text) return text;
  const a = m.attachments[0];
  return a ? (a.kind === "image" ? "Photo" : a.name) : "Message";
}

/** The bar under the header. Keyed on the newest pin, so a new one shows first. */
export function PinnedBar({ pins, me, group, onJump, onOpenList }: {
  /** Newest pin first (see activePins). */
  pins: Message[];
  me: string;
  /** In a group the bar says who wrote it. */
  group: boolean;
  onJump: (messageId: string) => void;
  onOpenList: () => void;
}) {
  const [index, setIndex] = useState(0);
  const i = index % pins.length;
  const m = pins[i];
  const who = m.authorId === me ? "You" : userById(m.authorId).name;
  const text = emojify(pinPreview(m));
  const go = () => {
    onJump(m.id);
    setIndex(i + 1);
  };
  return (
    <div className={`${styles.pinBar} ${styles.glass}`}>
      <button className={styles.pinBarMain} onClick={go} aria-label={`Go to pinned message${pins.length > 1 ? ` ${i + 1} of ${pins.length}` : ""}: ${text}`}>
        {pins.length > 1 && (
          <span className={styles.pinSteps} aria-hidden="true">
            {pins.map((p, k) => <i key={p.id} className={k === i ? styles.pinStepOn : ""} />)}
          </span>
        )}
        <span className={styles.pinBarText}>
          <small>{pins.length > 1 ? `Pinned · ${i + 1} of ${pins.length}` : "Pinned"}</small>
          <span>{group ? <b>{who}: </b> : null}{text}</span>
        </span>
      </button>
      <button className={styles.pinBarList} onClick={onOpenList} data-pin-target aria-label={`All pinned messages (${pins.length})`}>
        <IconPin size={16} />
      </button>
    </div>
  );
}

/** Pinning: for how long, and which pin makes room when there are already three. */
export function PinSheet({ message, chatId, onClose, onPin }: {
  message: Message;
  chatId: string;
  onClose: () => void;
  onPin: (forMs: number) => void;
}) {
  const { state } = useChat();
  const [length, setLength] = useState<PinFor>(PIN_FOR_DEFAULT);
  const pins = activePins(state.data.messages[chatId] ?? []);
  const replaces = pins.length >= PIN_LIMIT ? pins[pins.length - 1] : null;
  return (
    <Sheet title="Pin message" onClose={onClose} action={{ label: "Pin", onClick: () => onPin(pinMs(length)) }}>
      <p className={styles.pinQuote}>{emojify(pinPreview(message))}</p>
      <p className={styles.sheetLabel}>Keep it pinned for</p>
      <div className={styles.chipGrid} role="radiogroup" aria-label="Keep it pinned for">
        {PIN_FOR.map((f) => (
          <button key={f.id} role="radio" aria-checked={length === f.id} className={`${styles.choice} ${length === f.id ? styles.choiceOn : ""}`} onClick={() => setLength(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <p className={styles.sheetNote}>
        {replaces
          ? <>Three messages are pinned here already. This one takes the place of the oldest: “{emojify(pinPreview(replaces))}”</>
          : "Everyone in the chat sees it at the top. You can unpin it at any time."}
      </p>
    </Sheet>
  );
}

/** Every pinned message in the chat: tap one to go to it, or unpin it. */
export function PinnedSheet({ chatId, me, canPin, onClose, onJump, onUnpin }: {
  chatId: string;
  me: string;
  /** Unpinning takes the same permission as pinning. */
  canPin: boolean;
  onClose: () => void;
  onJump: (id: string) => void;
  onUnpin: (m: Message) => void;
}) {
  // Read live, so unpinning here takes the row away.
  const { state } = useChat();
  const now = useNow(60_000);
  const pins = activePins(state.data.messages[chatId] ?? [], now);
  return (
    <Sheet title={pins.length ? `Pinned · ${pins.length}` : "Pinned"} onClose={onClose}>
      {(close) => (!pins.length ? <p className={styles.sheetNote}>Nothing pinned here any more.</p> : (
        <div className={styles.listGroup}>
          {pins.map((m) => {
            const who = userById(m.authorId);
            const by = m.pin && m.pin.by !== m.authorId ? ` · pinned by ${m.pin.by === me ? "you" : userById(m.pin.by).name}` : "";
            return (
              <div key={m.id} className={styles.pinRow}>
                <button className={styles.pinRowMain} onClick={() => close(() => setTimeout(() => onJump(m.id), 60))}>
                  <Avatar glyph={initials(who.fullName)} tone={who.tone} photo={who.photo} size={32} shape="circle" />
                  <span className={styles.contactText}>
                    <b>{m.authorId === me ? "You" : who.name}</b>
                    <small>{emojify(pinPreview(m))}</small>
                    {(m.pin || by) && <small className={styles.pinRowLeft}>{pinLeft(m, now) || "Pinned"}{by}</small>}
                  </span>
                </button>
                {canPin && <button className={styles.pinRowUnpin} onClick={() => onUnpin(m)} aria-label="Unpin">Unpin</button>}
              </div>
            );
          })}
        </div>
      ))}
    </Sheet>
  );
}
