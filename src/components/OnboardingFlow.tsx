"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./OnboardingFlow.module.css";
import StatusBar from "./onboarding/StatusBar";
import Screen1Splash from "./onboarding/Screen1Splash";
import Screen2ValueProp from "./onboarding/Screen2ValueProp";
import ShowcaseCard from "./onboarding/ShowcaseCard";
import Screen5Categories from "./onboarding/Screen5Categories";
import Screen6ChatRecap from "./onboarding/Screen6ChatRecap";

const TOTAL_STEPS = 6;

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
        <p>A 1:1 port of the &ldquo;New Onboarding&rdquo; selection from the NOD Figma file — six screens, wired up end to end.</p>
      </div>

      <div className={styles.canvas}>
        <div className={styles.canvasNotch} />
        <div className={styles.canvasBody}>
          <StatusBar />
          {!done && <ProgressDots step={step} />}
          {done ? (
            <div className={styles.done}>
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
            <div className={styles.body}>
              <StepContent
                key={step}
                step={step}
                onNext={next}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
              />
            </div>
          )}
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
      return <Screen1Splash onNext={onNext} />;
    case 1:
      return <Screen2ValueProp onNext={onNext} />;
    case 2:
      return (
        <ShowcaseCard
          title={"Build your world,\nthen share it with others"}
          caption={{ name: "Japandi Inspo", meta: "12 Elements" }}
          onNext={onNext}
          variant="revealed"
        />
      );
    case 3:
      return (
        <ShowcaseCard
          title={"As many worlds as \nyou might need"}
          caption={{ name: "Some other collection", meta: "24 Elements" }}
          onNext={onNext}
          variant="sealed"
        />
      );
    case 4:
      return (
        <Screen5Categories
          onNext={onNext}
          selectedCategory={selectedCategory}
          onSelectCategory={onSelectCategory}
        />
      );
    case 5:
      return <Screen6ChatRecap onNext={onNext} selectedCategory={selectedCategory} />;
    default:
      return null;
  }
}
