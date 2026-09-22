import styles from "../OnboardingFlow.module.css";
import { CATEGORIES } from "./Screen5Categories";

const IMG = "/onboarding";

export default function Screen6ChatRecap({ onNext, selectedCategory }: { onNext: () => void; selectedCategory: string }) {
  const category = CATEGORIES.find((c) => c.id === selectedCategory) ?? CATEGORIES[0];

  return (
    <div className={styles.chatBody}>
      <div style={{ flex: "1 0 0", minHeight: 0, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 32 }}>
        <div className={styles.chatPanel}>
          <div className={styles.chatContent}>
            <div className={styles.chatSection}>
              <div className={styles.chatRowMine}>
                <div className={styles.chatBubbleMine}>Hey! can you put send me the items you wanted me to buy for the house :)</div>
              </div>

              <div className={styles.chatRowThem}>
                <div className={styles.chatAvatarWrap}>
                  <img src={`${IMG}/avatar.webp`} alt="" />
                  <span className={styles.onlineDot} />
                </div>
                <div className={styles.chatBubbleThem}>On it.</div>
              </div>

              <div className={styles.chatRowThem}>
                <div className={styles.chatAvatarWrap}>
                  <img src={`${IMG}/avatar.webp`} alt="" />
                  <span className={styles.onlineDot} />
                </div>
                <div className={styles.chatBubbleThem}>
                  <div className={styles.collectionCard}>
                    <div className={styles.collectionCardTop}>
                      {category.icon ? (
                        <img className="thumb" src={category.icon} alt="" style={{ width: 42, height: 42, objectFit: "cover", display: "block" }} />
                      ) : (
                        <span style={{ fontSize: 28, width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center" }}>{category.emoji}</span>
                      )}
                      <img src={`${IMG}/globe.svg`} alt="" />
                    </div>
                    <div className={styles.collectionMeta}>
                      <span>Collection</span>
                      <img src={`${IMG}/dot-sep-2.svg`} alt="" />
                      <span>{category.items}</span>
                    </div>
                    <div className={styles.collectionTitle}>{category.name}</div>
                    <button className={styles.openCollectionBtn}>Open collection</button>
                  </div>
                </div>
              </div>
            </div>
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
