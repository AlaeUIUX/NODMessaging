import styles from "../OnboardingFlow.module.css";

const IMG = "/onboarding";

export type Category = {
  id: string;
  name: string;
  items: string;
  visibility: string;
  icon?: string;
  emoji?: string;
};

export const CATEGORIES: Category[] = [
  { id: "japandi", name: "Japandi Inspo", items: "12 items", visibility: "Public", icon: `${IMG}/pendant.webp` },
  { id: "iceland", name: "Iceland trip 26", items: "14 items", visibility: "Private", emoji: "🇮🇸" },
  { id: "work", name: "Work notes", items: "32 items", visibility: "Private", emoji: "💻" },
];

export default function Screen5Categories({
  onNext,
  selectedCategory,
  onSelectCategory,
}: {
  onNext: () => void;
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
}) {
  return (
    <div className={styles.sheetBody}>
      <div style={{ flex: "1 0 0", minHeight: 0, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 32 }}>
        <div className={styles.sheetPanel}>
          <div className={styles.grabber}><span /></div>

          <div className={styles.chipRow}>
            <div className={styles.chipTile} style={{ width: 97, height: 67 }}>
              <img src={`${IMG}/room-collage.webp`} alt="" />
            </div>
            <div className={styles.chipTile} style={{ width: 67, height: 67 }}>
              <img src={`${IMG}/room-full.webp`} alt="" />
            </div>
            <div className={styles.chipTile} style={{ width: 57, height: 57, borderRadius: 0 }}>
              <img src={`${IMG}/pendant.webp`} alt="" />
            </div>
            <div className={styles.chipTile} style={{ width: 57, height: 57, borderRadius: 0 }}>
              <img src={`${IMG}/lamp.webp`} alt="" />
            </div>
          </div>

          <div className={styles.sheetContent}>
            <div className={styles.sheetLabel}>Saved to Mind</div>

            <div className={styles.searchBar}>
              <img src={`${IMG}/magnifying-glass.svg`} alt="" />
              <span>Search categories</span>
            </div>

            <div className={styles.newCategoryRow}>
              <div className={styles.newCategoryIcon}>
                <img src={`${IMG}/plus.svg`} alt="" />
              </div>
              <span>New category</span>
            </div>

            <img src={`${IMG}/divider-line.svg`} alt="" className={styles.dividerImg} />

            <div className={styles.catList}>
              {CATEGORIES.map((cat) => (
                <button key={cat.id} className={styles.catRow} onClick={() => onSelectCategory(cat.id)}>
                  <div className={styles.catLeft}>
                    <div className={styles.catIcon} style={{ borderRadius: cat.icon ? 0 : 14, background: cat.icon ? "transparent" : "#e7e5e4" }}>
                      {cat.icon ? <img src={cat.icon} alt="" /> : cat.emoji}
                    </div>
                    <div className={styles.catText}>
                      <b>{cat.name}</b>
                      <span className={styles.catMeta}>
                        {cat.items}
                        <img src={`${IMG}/dot-sep.svg`} alt="" />
                        {cat.visibility}
                      </span>
                    </div>
                  </div>
                  <span className={`${styles.radio} ${selectedCategory === cat.id ? styles.selected : ""}`} />
                </button>
              ))}
            </div>

            <div className={styles.noteField}>Add a note (optional)</div>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <p className={styles.terms}>
          By creating an account, you agree to the <a href="#">Terms of Service</a> and acknowledge that
          you have read and understood the <a href="#">Privacy Policy</a>
        </p>
        <button className={styles.cta} onClick={onNext}>Next</button>
      </div>
    </div>
  );
}
