import l from "./landing.module.css";

/**
 * The moment something lands in Mind. Put `LAND` on the element that holds
 * it (it settles in with a slight tilt, like a card dropped onto a table) and
 * <LandingGlow /> inside it (a glint of light across it, a soft ring, and a
 * few sparkles off its corner in the collection's colour). Nothing plays with
 * reduced motion on.
 */
export const LAND = l.land;
/** For a container that receives something (a folder, the Unassigned tray): a small bump instead of a drop. */
export const RECEIVE = l.receive;

/** A four-point star: the sparkle. */
const STAR = "M12 0c.7 6.4 5.6 11.3 12 12-6.4.7-11.3 5.6-12 12-.7-6.4-5.6-11.3-12-12C6.4 11.3 11.3 6.4 12 0Z";

/** Where each sparkle starts (around the top right corner, one at the bottom left), how big, when, and which way it drifts. */
const SPARKS = [
  { x: "86%", y: "0%", size: 15, delay: 260, dx: 9, dy: -11 },
  { x: "100%", y: "22%", size: 10, delay: 340, dx: 12, dy: 2 },
  { x: "70%", y: "-2%", size: 8, delay: 420, dx: -3, dy: -12 },
  { x: "4%", y: "96%", size: 9, delay: 380, dx: -9, dy: 8 },
];

/** Something going away for good (the tray, all sorted): sparkles across it, drifting up and out. */
const PUFF = [
  { x: "14%", y: "30px", size: 12, delay: 40, dx: -10, dy: -14 },
  { x: "34%", y: "16px", size: 8, delay: 110, dx: -4, dy: -18 },
  { x: "52%", y: "40px", size: 14, delay: 0, dx: 2, dy: -20 },
  { x: "70%", y: "18px", size: 9, delay: 90, dx: 6, dy: -16 },
  { x: "88%", y: "36px", size: 11, delay: 60, dx: 12, dy: -12 },
  { x: "26%", y: "62px", size: 7, delay: 150, dx: -8, dy: 4 },
  { x: "78%", y: "64px", size: 7, delay: 130, dx: 9, dy: 5 },
];

function Sparks({ list }: { list: typeof SPARKS }) {
  return list.map((s, i) => (
    <svg
      key={i}
      className={l.spark}
      viewBox="0 0 24 24"
      style={{ left: s.x, top: s.y, width: s.size, height: s.size, ["--d" as string]: `${s.delay}ms`, ["--dx" as string]: `${s.dx}px`, ["--dy" as string]: `${s.dy}px` }}
    >
      <path d={STAR} />
    </svg>
  ));
}

export function LandingGlow({ round }: { round?: "bubble" | "card" }) {
  return (
    <span className={`${l.glow} ${round === "bubble" ? l.glowBubble : round === "card" ? l.glowCard : ""}`} aria-hidden="true">
      <span className={l.sheen} />
      <Sparks list={SPARKS} />
    </span>
  );
}

/** The puff something leaves when it vanishes. */
export function Poof() {
  return (
    <span className={l.poof} aria-hidden="true">
      <Sparks list={PUFF} />
    </span>
  );
}

/** Mind's mark, where something kept in Mind flies to: it leads the toast after Save to Mind. */
export function MindMark() {
  return (
    <span className={l.mindMark} data-mind-target aria-hidden="true">
      <i style={{ ["--src" as string]: "url(/nod/mind.svg)" }} />
    </span>
  );
}

/** One sparkle, still: the mark on Mind's own suggestions. */
export function Sparkle({ size = 14 }: { size?: number }) {
  return (
    <svg className={l.sparkle} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={STAR} />
    </svg>
  );
}
