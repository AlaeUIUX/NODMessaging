"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/chat/types";
import { IconCopy, IconEdit, IconPin, IconPlus, IconReply, IconTrash } from "./Icons";
import { BubbleBody, bubbleClass, haptic, type BubblePos } from "./MessageRow";
import { Emoji } from "@/lib/chat/emoji";
import styles from "./chat.module.css";

const QUICK = ["❤️", "👍", "😂", "😮", "😢", "🔥"];
const MORE = [
  "🙏", "👏", "🎉", "💯", "✨", "🤝", "👀",
  "🥹", "😍", "🤔", "😅", "🙌", "💪", "✅",
  "👎", "😡", "🫶", "⚡️", "🌿", "☕️", "🚀",
];

const TOP_SAFE = 58;
const BOTTOM_SAFE = 30;
const GAP = 10;
const PILL_H = 52;
const PILL_W = QUICK.length * 42 + 40 + 12;
const MENU_W = 236;
const GRID_W = 7 * 42 + 12;
const CLOSE_MS = 220;
const FLY_MS = 420;

type Action = { id: string; label: string; icon: React.ReactNode; danger?: boolean; run: () => void };

interface Props {
  message: Message;
  isMine: boolean;
  pos: BubblePos;
  rect: { top: number; left: number; width: number; height: number };
  bounds: { width: number; height: number };
  armed: boolean;
  meId: string;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function MessageOverlay({
  message, isMine, pos, rect, bounds, armed, meId,
  onReact, onReply, onCopy, onEdit, onPin, onDelete, onClose,
}: Props) {
  const [closing, setClosing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hoverEmoji, setHoverEmoji] = useState<number | null>(null);
  const [hoverAction, setHoverAction] = useState<string | null>(null);
  const [flyer, setFlyer] = useState<{ emoji: string; x: number; y: number } | null>(null);
  const flyerRef = useRef<HTMLSpanElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const done = useRef(false);

  const mine = new Set(message.reactions.filter((r) => r.userIds.includes(meId)).map((r) => r.emoji));

  const actions: (Action | "sep")[] = [
    { id: "reply", label: "Reply", icon: <IconReply />, run: onReply },
    ...(message.kind === "text" && message.body ? [{ id: "copy", label: "Copy", icon: <IconCopy />, run: onCopy }] : []),
    ...(isMine && message.kind === "text" ? [{ id: "edit", label: "Edit", icon: <IconEdit />, run: onEdit }] : []),
    { id: "pin", label: message.pinned ? "Unpin" : "Pin", icon: <IconPin />, run: onPin },
    ...(isMine ? ["sep" as const, { id: "delete", label: "Delete", icon: <IconTrash />, danger: true, run: onDelete }] : []),
  ];
  const itemCount = actions.filter((a) => a !== "sep").length;
  const sepCount = actions.length - itemCount;
  const menuH = expanded ? Math.ceil(MORE.length / 7) * 42 + 12 : 12 + itemCount * 44 + sepCount * 11;

  // Keep the lifted message where it was when there is room; nudge it just
  // enough to fit the reaction pill above and the menu below when there isn't.
  const minTop = TOP_SAFE + PILL_H + GAP;
  const maxBottom = bounds.height - BOTTOM_SAFE - menuH - GAP;
  const h = Math.min(rect.height, Math.max(60, maxBottom - minTop));
  const top = clamp(rect.top, minTop, Math.max(minTop, maxBottom - h));
  const fromY = rect.top - top;

  const pillLeft = clamp(isMine ? rect.left + rect.width - PILL_W : rect.left, 8, bounds.width - PILL_W - 8);
  const panelW = expanded ? GRID_W : MENU_W;
  const menuLeft = clamp(isMine ? rect.left + rect.width - panelW : rect.left, 8, bounds.width - panelW - 8);

  const close = (after?: () => void, unmountAfter = CLOSE_MS) => {
    if (done.current) return;
    done.current = true;
    setClosing(true);
    setTimeout(() => { after?.(); onClose(); }, unmountAfter);
  };

  const pick = (emoji: string, from: HTMLElement | null) => {
    if (done.current) return;
    haptic(10);
    if (mine.has(emoji) || !from) {
      close(() => onReact(emoji));
      return;
    }
    const b = from.getBoundingClientRect();
    const host = from.closest(`.${styles.overlay}`)?.getBoundingClientRect();
    if (!host) { close(() => onReact(emoji)); return; }
    setFlyer({ emoji, x: b.left - host.left + b.width / 2, y: b.top - host.top + b.height / 2 });
    // Chrome fades now; the overlay stays mounted until the flyer lands. The
    // reaction commits on a timer, not on animation end, so a backgrounded tab
    // (where animations stall) never drops it.
    close(() => onReact(emoji), FLY_MS);
  };

  // The flyer lands where the badge will appear once the bubble settles home.
  useEffect(() => {
    if (!flyer || !flyerRef.current) return;
    const tx = (isMine ? rect.left + rect.width - 25 : rect.left + 25) - flyer.x;
    const ty = rect.top + rect.height + 5 - flyer.y;
    flyerRef.current.animate(
      [
        { transform: "translate(-50%, -50%) scale(1.3)" },
        { transform: `translate(calc(-50% + ${tx * .5}px), calc(-50% + ${ty * .5 - 48}px)) scale(1.1)`, offset: .45 },
        { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(.55)` },
      ],
      { duration: FLY_MS, easing: "cubic-bezier(.3,.7,.2,1)", fill: "forwards" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyer]);

  // Drag-to-select: the finger that long-pressed can slide straight onto an
  // emoji or a menu item and release to choose it.
  useEffect(() => {
    if (!armed) return;
    // Hit-test the quick bar by column rather than by each emoji's box: the
    // boxes scale while animating and magnifying, the columns never move.
    const locate = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const bar = el?.closest<HTMLElement>("[data-quick-bar]");
      let emoji: HTMLElement | null = null;
      if (bar) {
        const col = Math.floor((e.clientX - bar.getBoundingClientRect().left - 6) / 42);
        emoji = bar.querySelector<HTMLElement>(`[data-emoji-index="${col}"]`);
      }
      return { emoji, action: el?.closest<HTMLElement>("[data-action]") ?? null };
    };
    let lastEmoji: number | null = null;
    const move = (e: PointerEvent) => {
      const { emoji, action } = locate(e);
      const idx = emoji ? Number(emoji.dataset.emojiIndex) : null;
      if (idx !== lastEmoji && idx !== null) haptic(4);
      lastEmoji = idx;
      setHoverEmoji(idx);
      setHoverAction(action?.dataset.action ?? null);
    };
    const up = (e: PointerEvent) => {
      const { emoji, action } = locate(e);
      setHoverEmoji(null);
      setHoverAction(null);
      cleanup();
      if (emoji?.dataset.emoji) pick(emoji.dataset.emoji, emoji);
      else if (action) action.click();
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cleanup);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cleanup);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  useEffect(() => {
    if (!armed) firstItemRef.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const side = isMine ? `${styles.mine} ${styles.focusMine}` : `${styles.theirs} ${styles.focusTheirs}`;

  return (
    <div className={`${styles.overlay} ${closing ? styles.closing : ""}`} role="dialog" aria-label="Message actions">
      <div className={styles.scrim} onClick={() => close()} />

      <div
        className={`${styles.focus} ${side}`}
        data-pos={pos}
        style={{
          top,
          left: rect.left,
          width: rect.width,
          ["--from-y" as string]: `${fromY}px`,
          ["--max-h" as string]: h < rect.height ? `${h}px` : "none",
        }}
      >
        <div className={bubbleClass(message)} style={{ width: "100%" }}>
          <BubbleBody message={message} interactive={false} />
        </div>
      </div>

      <div
        data-quick-bar
        className={`${styles.reactBar} ${styles.glassStrong}`}
        style={{ top: top - GAP - PILL_H, left: pillLeft, transformOrigin: isMine ? "bottom right" : "bottom left" }}
      >
        {QUICK.map((emoji, i) => (
          <button
            key={emoji}
            className={styles.emojiBtn}
            style={{ ["--i" as string]: i }}
            data-emoji={emoji}
            data-emoji-index={i}
            data-picked={mine.has(emoji)}
            data-hover={hoverEmoji === null ? undefined : Math.abs(hoverEmoji - i) > 1 ? undefined : Math.abs(hoverEmoji - i)}
            onClick={(e) => pick(emoji, e.currentTarget)}
            aria-label={`React ${emoji}`}
          >
            <Emoji char={emoji} />
          </button>
        ))}
        <button
          className={`${styles.emojiBtn} ${styles.moreBtn}`}
          style={{ ["--i" as string]: QUICK.length }}
          onClick={() => setExpanded((v) => !v)}
          aria-label="More reactions"
          aria-expanded={expanded}
        >
          <IconPlus />
        </button>
      </div>

      {expanded ? (
        <div
          className={`${styles.reactBar} ${styles.expanded} ${styles.glassStrong}`}
          style={{ top: top + h * 1.03 + GAP, left: menuLeft, width: GRID_W }}
        >
          {MORE.map((emoji, i) => (
            <button
              key={emoji}
              className={styles.emojiBtn}
              style={{ ["--i" as string]: i % 7 }}
              data-emoji={emoji}
              data-picked={mine.has(emoji)}
              onClick={(e) => pick(emoji, e.currentTarget)}
              aria-label={`React ${emoji}`}
            >
              <Emoji char={emoji} />
            </button>
          ))}
        </div>
      ) : (
        <div
          className={`${styles.menu} ${isMine ? styles.menuMine : styles.menuTheirs} ${styles.glassStrong}`}
          style={{ top: top + h * 1.03 + GAP, left: menuLeft }}
          role="menu"
        >
          {actions.map((a, i) =>
            a === "sep" ? (
              <div key={`sep-${i}`} className={styles.menuSep} />
            ) : (
              <button
                key={a.id}
                ref={i === 0 ? firstItemRef : undefined}
                role="menuitem"
                data-action={a.id}
                data-hover={hoverAction === a.id}
                className={`${styles.menuItem} ${a.danger ? styles.danger : ""}`}
                onClick={() => close(a.run)}
              >
                {a.label}
                {a.icon}
              </button>
            ),
          )}
        </div>
      )}

      {flyer && (
        <span ref={flyerRef} className={styles.flyer} style={{ left: flyer.x, top: flyer.y }}>
          <Emoji char={flyer.emoji} />
        </span>
      )}
    </div>
  );
}
