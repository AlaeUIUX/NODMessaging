import { ImageResponse } from "next/og";
import { CELLS } from "@/components/chat/Logo";

// The link preview for chats, docs and social posts: the mark and the hero line.
export const alt = "NOD — Talk it through. Keep what matters.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function Mark({ px, color }: { px: number; color: string }) {
  const k = px / 48;
  return (
    <div style={{ position: "relative", width: px, height: px, display: "flex" }}>
      {CELLS.map(([x, y, o], i) => (
        <div
          key={i}
          style={{ position: "absolute", left: x * k, top: y * k, width: 6.86 * k, height: 6.86 * k, background: color, opacity: o }}
        />
      ))}
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#E8E2D8",
          color: "#1C1917",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Mark px={64} color="#1C1917" />
          <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>nod</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02 }}>
          <span>Talk it through.</span>
          <span style={{ color: "#79716B" }}>Keep what matters.</span>
        </div>
        <span style={{ fontSize: 30, color: "#57534E" }}>
          A Space for every team, polls, checklists and payments in the thread, and Mind to keep what you need.
        </span>
      </div>
    ),
    size,
  );
}
