import styles from "./chat.module.css";

/** A calm, stylised city map drawn in SVG — no tiles, no network. */
export default function MiniMap({ x, y, live = false }: { x: number; y: number; live?: boolean }) {
  const px = x * 320;
  const py = y * 180;
  return (
    <svg className={styles.miniMap} viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="320" height="180" className={styles.mapLand} />
      <path d="M-10 132 C 60 118, 110 150, 180 138 S 290 120, 330 128 L 330 190 L -10 190 Z" className={styles.mapWater} />
      <path d="M198 18 h70 a10 10 0 0 1 10 10 v36 a10 10 0 0 1 -10 10 h-70 a10 10 0 0 1 -10 -10 v-36 a10 10 0 0 1 10 -10 Z" className={styles.mapPark} />
      <path d="M22 40 h54 v38 h-54 Z" className={styles.mapPark} />
      <g className={styles.mapRoadWide}>
        <path d="M-10 92 L 330 70" />
        <path d="M120 -10 L 150 200" />
      </g>
      <g className={styles.mapRoad}>
        <path d="M-10 30 L 330 22" />
        <path d="M-10 150 L 200 120" />
        <path d="M60 -10 L 80 200" />
        <path d="M240 -10 L 230 200" />
        <path d="M180 -10 L 300 200" />
        <path d="M-10 60 L 110 118" />
      </g>
      {live && <circle cx={px} cy={py} r="26" className={styles.mapPulse} />}
      <circle cx={px} cy={py} r="9" className={styles.mapHalo} />
      <circle cx={px} cy={py} r="6" className={styles.mapDot} />
    </svg>
  );
}
