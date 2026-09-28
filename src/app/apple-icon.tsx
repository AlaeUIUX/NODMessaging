import { ImageResponse } from "next/og";
import { CELLS } from "@/components/chat/Logo";

// Home-screen icon (and Safari's tab icon, which doesn't take SVG).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const k = 112 / 48;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF9" }}>
        <div style={{ position: "relative", width: 112, height: 112, display: "flex" }}>
          {CELLS.map(([x, y, o], i) => (
            <div key={i} style={{ position: "absolute", left: x * k, top: y * k, width: 6.86 * k, height: 6.86 * k, background: "#1C1917", opacity: o }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
