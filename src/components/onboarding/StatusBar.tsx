import styles from "../OnboardingFlow.module.css";

export default function StatusBar() {
  return (
    <div className={styles.statusWrap}>
      <div className={styles.statusInner}>
        <div className={styles.statusIcons}>
          <img src="/onboarding/status-pro.svg" alt="" />
        </div>
        <p className={styles.statusTime}>9:41</p>
      </div>
    </div>
  );
}
