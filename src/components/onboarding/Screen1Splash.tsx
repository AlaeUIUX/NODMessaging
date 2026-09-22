import styles from "../OnboardingFlow.module.css";
import Logomark from "./Logomark";

export default function Screen1Splash({ onNext }: { onNext: () => void }) {
  return (
    <div className={styles.splashInner} onClick={onNext}>
      <div className={styles.logoTitle}>
        <Logomark spin />
      </div>
      <p className={styles.splashText}>Maybe it&rsquo;s time to think about branding</p>
    </div>
  );
}
