/** Same status bar as the reference prototype — it's what clears the notch. */
export default function StatusBar() {
  return (
    <div className="statusbar">
      <span>9:41</span>
      <span className="icons">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
          <path d="M1 9V11H3V9H1ZM5 6V11H7V6H5ZM9 3V11H11V3H9ZM13 0V11H15V0H13Z" fill="currentColor" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path d="M8 10.5C8.6 10.5 9 10.1 9 9.5C9 8.9 8.6 8.5 8 8.5C7.4 8.5 7 8.9 7 9.5C7 10.1 7.4 10.5 8 10.5Z" fill="currentColor" />
          <path d="M2 5.5C4.5 2.5 11.5 2.5 14 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="1" y="1" width="20" height="10" rx="2.5" stroke="currentColor" strokeWidth="1" />
          <rect x="2.5" y="2.5" width="16" height="7" rx="1.2" fill="currentColor" />
          <rect x="22" y="4" width="2" height="4" rx="1" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}
