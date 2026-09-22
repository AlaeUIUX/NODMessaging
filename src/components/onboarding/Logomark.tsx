import styles from "../OnboardingFlow.module.css";

// Exact 1:1 port of the Figma "Logomark" node (25 absolutely-inset dots forming
// a sparkle with 4-fold rotational symmetry). The three keyframe copies of this
// node in the Figma "Animation" section (node 1311:9590) are pixel-identical —
// the symmetry means a continuous spin looks the same at each snapshot, which is
// the tell for "this rotates continuously" rather than a static illustration.
const DOTS: Array<{ inset: string; opacity?: number }> = [
  { inset: "42.86% 42.85% 42.86% 42.86%" },
  { inset: "57.14% 42.85% 28.57% 42.86%", opacity: 0.6 },
  { inset: "57.14% 28.58% 28.57% 57.14%", opacity: 0.32 },
  { inset: "57.14% 14.29% 28.57% 71.43%", opacity: 0.07 },
  { inset: "57.14% 57.14% 28.57% 28.57%", opacity: 0.32 },
  { inset: "57.14% 71.43% 28.57% 14.29%", opacity: 0.07 },
  { inset: "71.43% 42.85% 14.29% 42.86%", opacity: 0.32 },
  { inset: "71.43% 57.14% 14.29% 28.57%", opacity: 0.07 },
  { inset: "71.43% 28.58% 14.29% 57.14%", opacity: 0.07 },
  { inset: "85.71% 42.85% 0% 42.86%", opacity: 0.07 },
  { inset: "42.86% 57.14% 42.86% 28.57%", opacity: 0.6 },
  { inset: "42.86% 71.43% 42.86% 14.29%", opacity: 0.32 },
  { inset: "42.86% 85.71% 42.86% 0%", opacity: 0.07 },
  { inset: "42.86% 28.58% 42.86% 57.14%", opacity: 0.6 },
  { inset: "42.86% 14.29% 42.86% 71.43%", opacity: 0.32 },
  { inset: "42.86% 0% 42.86% 85.71%", opacity: 0.07 },
  { inset: "28.57% 42.85% 57.14% 42.86%", opacity: 0.6 },
  { inset: "28.57% 57.14% 57.14% 28.57%", opacity: 0.32 },
  { inset: "14.29% 57.14% 71.43% 28.57%", opacity: 0.07 },
  { inset: "28.57% 71.43% 57.14% 14.29%", opacity: 0.07 },
  { inset: "28.57% 28.58% 57.14% 57.14%", opacity: 0.32 },
  { inset: "14.29% 28.58% 71.43% 57.14%", opacity: 0.07 },
  { inset: "28.57% 14.29% 57.14% 71.43%", opacity: 0.07 },
  { inset: "14.29% 42.85% 71.43% 42.86%", opacity: 0.32 },
  { inset: "0% 42.85% 85.71% 42.86%", opacity: 0.07 },
];

export default function Logomark({ spin = false }: { spin?: boolean }) {
  return (
    <div className={`${styles.logomarkBox} ${spin ? styles.logomarkSpin : ""}`}>
      {DOTS.map((d, i) => (
        <div
          key={i}
          className={styles.logomarkDot}
          style={{ inset: d.inset, opacity: d.opacity ?? 1 }}
        />
      ))}
    </div>
  );
}
