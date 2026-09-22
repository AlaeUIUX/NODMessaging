"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./OnboardingFlow.module.css";

const TOTAL_STEPS = 6;

type Category = {
  id: string;
  name: string;
  items: string;
  visibility: string;
  icon?: string;
  emoji?: string;
};

const CATEGORIES: Category[] = [
  { id: "japandi", name: "Japandi Inspo", items: "12 items", visibility: "Public", icon: "/onboarding/teapot.webp" },
  { id: "iceland", name: "Iceland trip 26", items: "14 items", visibility: "Private", emoji: "🇮🇸" },
  { id: "work", name: "Work notes", items: "32 items", visibility: "Private", emoji: "💻" },
];

function Terms() {
  return (
    <p className={styles.terms}>
      By creating an account, you agree to the <a href="#">Terms of Service</a> and acknowledge that
      you have read and understood the <a href="#">Privacy Policy</a>
    </p>
  );
}

function ProgressDots({ step }: { step: number }) {
  return (
    <div className={styles.progress}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <span key={i} className={`${styles.dot} ${i === step ? styles.active : ""}`} />
      ))}
    </div>
  );
}

export default function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>("japandi");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (step !== 0 || done) return;
    const t = setTimeout(() => setStep(1), 1800);
    return () => clearTimeout(t);
  }, [step, done]);

  const next = () => {
    if (step === TOTAL_STEPS - 1) {
      setDone(true);
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  const restart = () => {
    setDone(false);
    setStep(0);
  };

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <Link href="/" className={styles.backLink}>&larr; Back to chat prototype</Link>
        <h1>Onboarding Test</h1>
        <p>A working port of the &ldquo;New Onboarding&rdquo; selection from the NOD Figma file — six screens, wired up end to end.</p>
      </div>

      <div className="phone">
        <div className="notch" />
        <div className="app">
          <div className={styles.body}>
            {!done && <ProgressDots step={step} />}
            {done ? (
              <div className={`${styles.step} ${styles.done}`} key="done">
                <div className={styles.doneIcon}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h3>You&apos;re all set</h3>
                <p>This is where onboarding would hand off into the main app.</p>
                <button className={styles.restartBtn} onClick={restart}>Restart</button>
              </div>
            ) : (
              <StepContent
                step={step}
                onNext={next}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepContent({
  step,
  onNext,
  selectedCategory,
  onSelectCategory,
}: {
  step: number;
  onNext: () => void;
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
}) {
  switch (step) {
    case 0:
      return <StepSplash key={step} onNext={onNext} />;
    case 1:
      return <StepValueProp key={step} onNext={onNext} />;
    case 2:
      return (
        <StepShowcase
          key={step}
          title={"Build your world,\nthen share it with others"}
          caption={{ name: "Japandi Inspo", meta: "12 Elements" }}
          onNext={onNext}
          variant="revealed"
        />
      );
    case 3:
      return (
        <StepShowcase
          key={step}
          title={"As many worlds as \nyou might need"}
          caption={{ name: "Some other collection", meta: "24 Elements" }}
          onNext={onNext}
          variant="sealed"
        />
      );
    case 4:
      return (
        <StepCategories
          key={step}
          onNext={onNext}
          selectedCategory={selectedCategory}
          onSelectCategory={onSelectCategory}
        />
      );
    case 5:
      return <StepChatRecap key={step} onNext={onNext} selectedCategory={selectedCategory} />;
    default:
      return null;
  }
}

function StepSplash({ onNext }: { onNext: () => void }) {
  return (
    <div className={`${styles.step} ${styles.splash}`} onClick={onNext}>
      <div className={styles.logomark}>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
        </svg>
      </div>
      <p className={styles.splashText}>Maybe it&rsquo;s time to think about branding</p>
    </div>
  );
}

function StepValueProp({ onNext }: { onNext: () => void }) {
  return (
    <div className={`${styles.step} ${styles.anchored}`}>
      <div className={styles.collageRow}>
        <div className={styles.tile} style={{ width: 80, height: 99 }}>
          <img src="/onboarding/room-collage.webp" alt="" />
        </div>
        <div className={styles.tile} style={{ width: 69, height: 83 }}>
          <img src="/onboarding/coastline.webp" alt="" />
        </div>
        <div className={styles.tile} style={{ width: 41, height: 41 }}>
          <img src="/onboarding/tile-flag.webp" alt="" />
        </div>
        <div className={`${styles.tile} ${styles.tileEmoji}`} style={{ width: 41, height: 41 }}>
          ✈️
        </div>
      </div>

      <div className={styles.valueHead}>
        <span className={styles.brand}>NOD</span>
        <h2>We need a strong value proposition</h2>
      </div>

      <div className={styles.collageRow}>
        <div className={`${styles.tile} ${styles.tileEmoji}`} style={{ width: 41, height: 41 }}>
          💡
        </div>
        <div className={styles.tile} style={{ width: 69, height: 83 }}>
          <img src="/onboarding/room-full.webp" alt="" />
        </div>
        <div className={styles.tile} style={{ width: 121, height: 67 }}>
          <img src="/onboarding/lamp.webp" alt="" />
        </div>
        <div className={styles.tile} style={{ width: 41, height: 41 }}>
          <img src="/onboarding/teapot.webp" alt="" />
        </div>
        <div className={styles.tile} style={{ width: 41, height: 41 }}>
          <img src="/onboarding/pendant.webp" alt="" />
        </div>
      </div>

      <div className={styles.footer}>
        <Terms />
        <button className={styles.cta} onClick={onNext}>Get started</button>
      </div>
    </div>
  );
}

function StepShowcase({
  title,
  caption,
  onNext,
  variant,
}: {
  title: string;
  caption: { name: string; meta: string };
  onNext: () => void;
  variant: "revealed" | "sealed";
}) {
  return (
    <div className={`${styles.step} ${styles.anchored}`}>
      <p className={styles.showcaseTitle}>
        {title.split("\n").map((line, i) => (
          <span key={i}>
            {line}
            {i === 0 && <br />}
          </span>
        ))}
      </p>

      <div className={styles.showcase}>
        <div className={styles.card}>
          {variant === "revealed" ? (
            <>
              <img src="/onboarding/room-wide.webp" alt="" />
              <div className={styles.swatchChip}>
                <b>Base colors</b>
                <ul>
                  <li>Warm White</li>
                  <li>Parchment</li>
                  <li>Warm Sand</li>
                  <li>Soft Greige</li>
                  <li>Pale Clay</li>
                </ul>
              </div>
            </>
          ) : (
            <div className={styles.envelope}>
              <div className={styles.envelopeSeam} />
              <div className={styles.envelopeFlap} />
            </div>
          )}
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

function StepCategories({
  onNext,
  selectedCategory,
  onSelectCategory,
}: {
  onNext: () => void;
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
}) {
  return (
    <div className={`${styles.step} ${styles.anchored}`}>
      <div className={styles.sheet}>
        <div className={styles.sheetTitle}>Saved to Mind</div>

        <div className={styles.searchBar}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <span>Search categories</span>
        </div>

        <div className={styles.newCategoryRow}>
          <div className={styles.newCategoryIcon}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </div>
          <span>New category</span>
        </div>

        <div className={styles.divider} />

        <div className={styles.catList}>
          {CATEGORIES.map((cat) => (
            <button key={cat.id} className={styles.catRow} onClick={() => onSelectCategory(cat.id)}>
              <div className={styles.catLeft}>
                <div className={styles.catIcon}>
                  {cat.icon ? <img src={cat.icon} alt="" /> : cat.emoji}
                </div>
                <div className={styles.catText}>
                  <b>{cat.name}</b>
                  <span className={styles.catMeta}>
                    {cat.items}
                    <span className={styles.dot}>·</span>
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

      <div className={styles.footer}>
        <Terms />
        <button className={styles.cta} onClick={onNext}>Next</button>
      </div>
    </div>
  );
}

function StepChatRecap({ onNext, selectedCategory }: { onNext: () => void; selectedCategory: string }) {
  const category = CATEGORIES.find((c) => c.id === selectedCategory) ?? CATEGORIES[0];
  return (
    <div className={`${styles.step} ${styles.anchored}`}>
      <div className={styles.chatStack}>
        <div className={styles.chatRowMine}>
          <div className={styles.chatBubbleMine}>Hey! can you send me the items you wanted me to buy for the house :)</div>
        </div>
        <div className={styles.chatRowThem}>
          <div className={styles.chatAvatarWrap}>
            <img src="/onboarding/avatar.webp" alt="" />
            <span className={styles.onlineDot} />
          </div>
          <div className={styles.chatBubbleThem}>On it.</div>
        </div>
        <div className={styles.chatRowThem}>
          <div className={styles.chatAvatarWrap}>
            <img src="/onboarding/avatar.webp" alt="" />
            <span className={styles.onlineDot} />
          </div>
          <div className={styles.collectionCard}>
            <div className={styles.collectionCardTop}>
              {category.icon ? <img src={category.icon} alt="" /> : <span style={{ fontSize: 28 }}>{category.emoji}</span>}
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
            </div>
            <div className={styles.collectionMeta}>
              <span>Collection</span>
              <span className={styles.metaDot} />
              <span>{category.items}</span>
            </div>
            <div className={styles.title}>
              {category.name}
            </div>
            <button className={styles.openCollectionBtn}>Open collection</button>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <Terms />
        <button className={styles.cta} onClick={onNext}>Finish</button>
      </div>
    </div>
  );
}
