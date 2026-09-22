import styles from "../OnboardingFlow.module.css";

const IMG = "/onboarding";

export default function Screen2ValueProp({ onNext }: { onNext: () => void }) {
  return (
    <div className={styles.valueBody}>
      <div style={{ position: "relative", width: "100%", height: 550, flexShrink: 0 }}>
        {/* Frame 14 — top-left collage cluster (1309:6096) */}
        <div style={{ position: "absolute", left: 25, top: 25, width: 320, height: 143 }}>
          <div style={{ position: "absolute", left: 0, top: 65, width: 67, height: 67 }}>
            <img src={`${IMG}/camera.webp`} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <div style={{ position: "absolute", left: 281, top: 104, width: 41, height: 41 }}>
            <div style={{ position: "absolute", inset: 0, background: "#f7f7f7", borderRadius: 10 }} />
            <div style={{ position: "absolute", left: 4, top: 4, width: 33, height: 33 }}>
              <img src={`${IMG}/tile-plane.webp`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </div>
          <div style={{ position: "absolute", left: 267, top: 45, width: 41, height: 41, borderRadius: 10, overflow: "hidden", background: "#f7f7f7" }}>
            <img
              src={`${IMG}/tile-flag.webp`}
              alt=""
              style={{ position: "absolute", left: "-21.9%", top: "-23.44%", width: "145.21%", height: "156.38%", maxWidth: "none" }}
            />
          </div>
          <div style={{ position: "absolute", left: 78, top: 0, width: 80, height: 99, borderRadius: 10, overflow: "hidden" }}>
            <img src={`${IMG}/mountain.webp`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ position: "absolute", left: 180, top: 45, width: 69, height: 83, borderRadius: 10, overflow: "hidden" }}>
            <img src={`${IMG}/coastline.webp`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>

        {/* Frame 16 — bottom-right collage cluster (1309:6098) */}
        <div className={styles.collageLower}>
          <div className={styles.collageLowerInner}>
            <div style={{ position: "absolute", left: 187, top: 19.5, width: 121, height: 67, borderRadius: 10, overflow: "hidden" }}>
              <img src={`${IMG}/room-collage.webp`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ position: "absolute", left: 281, top: 104, width: 41, height: 41, overflow: "hidden" }}>
              <img
                src={`${IMG}/teapot.webp`}
                alt=""
                style={{ position: "absolute", left: "-141.59%", top: "-36.47%", width: "271.94%", height: "306.6%", maxWidth: "none" }}
              />
            </div>
            <div style={{ position: "absolute", left: 227, top: 104, width: 41, height: 41 }}>
              <img src={`${IMG}/pendant.webp`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ position: "absolute", left: 173, top: 104, width: 41, height: 41 }}>
              <img src={`${IMG}/lamp.webp`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ position: "absolute", left: 0, top: 45, width: 41, height: 41, background: "#f7f7f7", borderRadius: 10, overflow: "hidden" }}>
              <img
                src={`${IMG}/teapot.webp`}
                alt=""
                style={{ position: "absolute", left: "-27.33%", top: "-179.11%", width: "271.94%", height: "306.6%", maxWidth: "none" }}
              />
            </div>
            <div style={{ position: "absolute", left: 78, top: 57.5, width: 69, height: 83, borderRadius: 10, overflow: "hidden" }}>
              <img src={`${IMG}/room-full.webp`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </div>
        </div>

        {/* Frame 17 — centered NOD wordmark + heading (1309:6143) */}
        <div className={styles.valueHeading}>
          <span className={styles.valueBrand}>NOD</span>
          <p className={styles.valueTitle}>
            We need a strong
            <br />
            {" value proposition"}
          </p>
        </div>
      </div>

      <div className={styles.footer}>
        <p className={styles.terms}>
          By creating an account, you agree to the <a href="#">Terms of Service</a> and acknowledge that
          you have read and understood the <a href="#">Privacy Policy</a>
        </p>
        <button className={styles.cta} onClick={onNext}>Get started</button>
      </div>
    </div>
  );
}
