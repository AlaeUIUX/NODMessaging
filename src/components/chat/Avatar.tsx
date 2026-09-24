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
}

export default function Avatar({ glyph, tone, size = 40, shape = "square", online }: Props) {
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
      {glyph}
      {online && <i className={styles.presence} />}
    </span>
  );
}
