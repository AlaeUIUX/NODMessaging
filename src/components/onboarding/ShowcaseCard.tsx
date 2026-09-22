import styles from "../OnboardingFlow.module.css";

const IMG = "/onboarding";

type Props = {
  title: string;
  caption: { name: string; meta: string };
  onNext: () => void;
  variant: "revealed" | "sealed";
};

// 1:1 port of the "Frame 46 / Group 3" masked photo-reveal composition shared by
// screens 3 & 4 (1309:6273 / 1311:8860): a kraft-paper envelope body with the
// Japandi room photo peeking through two organic torn-edge SVG masks, plus a
// rotated accent photo (revealed variant only) and a floating "Base colors" chip.
export default function ShowcaseCard({ title, caption, onNext, variant }: Props) {
  const revealed = variant === "revealed";
  const groupHeight = revealed ? 407 : 398;

  return (
    <div className={styles.showcaseBody}>
      <p className={styles.showcaseTitle}>
        {title.split("\n").map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {line}
          </span>
        ))}
      </p>

      <div className={styles.showcaseStack}>
        <div className={styles.cardFrame}>
          <div className={styles.cardGroup3} style={{ height: groupHeight }}>
            {/* Rectangle 9 — envelope body (kraft texture), revealed variant only */}
            {revealed && (
              <div className={styles.envelopeBody} style={{ left: 16.5, top: 0, width: 163.638, height: 349.07 }}>
                <img src={`${IMG}/room-tall.webp`} alt="" />
              </div>
            )}

            {/* Group 2 — top torn-edge mask revealing the room photo */}
            <div
              className={styles.maskLayer}
              style={{
                left: 0.75,
                top: revealed ? 8.5 : -0.5,
                width: 347.5,
                height: 400,
                WebkitMaskImage: `url(${IMG}/mask-top.svg)`,
                maskImage: `url(${IMG}/mask-top.svg)`,
                WebkitMaskSize: "343.064px 261px",
                maskSize: "343.064px 261px",
                WebkitMaskPosition: "0.936px 0.25px",
                maskPosition: "0.936px 0.25px",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
              }}
            >
              <img src={`${IMG}/room-wide.webp`} alt="" />
            </div>

            {/* Rectangle 11 — rotated accent photo, revealed variant only */}
            {revealed && (
              <div className={styles.accentCard} style={{ left: 37.5, top: 107, width: 224.342, height: 229.764 }}>
                <div style={{ transform: "scaleY(-1) rotate(-169.45deg)" }}>
                  <div className={styles.accentCardInner} style={{ width: 191.308, height: 198.086 }}>
                    <img
                      src={`${IMG}/pendant.webp`}
                      alt=""
                      style={{ left: "-10.21%", top: 0, width: "103.54%", height: "100%" }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Group 1 — bottom torn-edge mask revealing the room photo */}
            <div
              className={styles.maskLayer}
              style={{
                left: -0.25,
                top: revealed ? 7.5 : -1.5,
                width: 347.5,
                height: 400,
                WebkitMaskImage: `url(${IMG}/mask-bottom.svg)`,
                maskImage: `url(${IMG}/mask-bottom.svg)`,
                WebkitMaskSize: "347.505px 243.57px",
                maskSize: "347.505px 243.57px",
                WebkitMaskPosition: "-0.001px 156.18px",
                maskPosition: "-0.001px 156.18px",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
              }}
            >
              <img src={`${IMG}/room-wide.webp`} alt="" />
            </div>

            {/* Frame 233 — "Base colors" chip, revealed variant only */}
            {revealed && (
              <div className={styles.chipWrap} style={{ left: 184.5, top: 73, width: 156.001, height: 260.651 }}>
                <div className={styles.chipBg} style={{ width: 142.055, height: 253.095, transform: "rotate(3.21deg)" }} />
                <div className={styles.chipText} style={{ left: 12, top: 20, width: 106.068, transform: "rotate(-3.21deg)" }}>
                  <div>
                    <b>Base colors</b>
                    <ul>
                      <li>Warm White</li>
                      <li>Parchment</li>
                      <li>Warm Sand</li>
                      <li>Soft Greige</li>
                      <li>Pale Clay</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.showcaseCaption}>
          <b>{caption.name}</b>
          <span>{caption.meta}</span>
        </div>
      </div>

      <div className={styles.footer}>
        <button className={styles.cta} onClick={onNext}>Next</button>
      </div>
    </div>
  );
}
