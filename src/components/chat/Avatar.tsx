import { TONES } from "@/lib/chat/avatar";
import type { AvatarTone } from "@/lib/chat/types";
import styles from "./chat.module.css";

interface Props {
  glyph: string;
  tone: AvatarTone;
  size?: number;
  /** Slack-style rounded square; circles are kept for presence-heavy spots. */
  shape?: "square" | "circle";
  online?: boolean;
  /** A profile photo; the initials show when there isn't one. */
  photo?: string;
}

export default function Avatar({ glyph, tone, size = 40, shape = "square", online, photo }: Props) {
  return (
    <span
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        background: TONES[tone],
        fontSize: Math.round(size * (glyph.length > 1 ? 0.36 : 0.44)),
        borderRadius: shape === "circle" ? 9999 : Math.round(size * 0.3),
      }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo ? <img className={styles.avatarPhoto} src={photo} alt="" draggable={false} /> : glyph || (
        // No name yet (someone known only by their number): a quiet silhouette.
        <svg width="52%" height="52%" viewBox="0 0 24 24" fill="currentColor" opacity=".9"><circle cx="12" cy="8" r="4.2" /><path d="M3.8 21c.9-4.3 4.2-6.6 8.2-6.6s7.3 2.3 8.2 6.6z" /></svg>
      )}
      {online && <i className={styles.presence} />}
    </span>
  );
}
