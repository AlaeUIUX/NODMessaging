import styles from "./chat.module.css";

export default function StatusBar() {
  return (
    <div className={styles.statusbar} aria-hidden="true">
      <span>9:41</span>
      <span className={styles.sbIcons}>
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
          <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.3-1.3A10.4 10.4 0 0 0 8 .4 10.4 10.4 0 0 0 .7 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.3-1.3A6.6 6.6 0 0 0 8 4a6.6 6.6 0 0 0-4.7 1.8l1.3 1.3C5.5 6.3 6.7 5.8 8 5.8zm0 3.6c.4 0 .8.2 1.1.4L8 11 6.9 9.8c.3-.2.7-.4 1.1-.4z" />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
          <rect x=".5" y=".5" width="23" height="12" rx="3.8" stroke="currentColor" opacity=".4" />
          <rect x="2" y="2" width="20" height="9" rx="2.5" fill="currentColor" />
          <path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill="currentColor" opacity=".4" />
        </svg>
      </span>
    </div>
  );
}
