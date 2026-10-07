"use client";

import { useRef, type ReactNode } from "react";
import styles from "./chat.module.css";
import w from "./widgetintro.module.css";

/**
 * The first time someone opens + on an empty dashboard: four short steps,
 * each a small scene that plays on a loop above a line or two of text (what a
 * widget is, its sizes, its views, how to move one). Swipe or tap Next; the
 * last step hands over to picking the first widget.
 */

/** A tiny widget inside a scene: a coloured dot and a name, then whatever it shows. */
function Mini({ className, tone, name, children }: { className?: string; tone: string; name: string; children?: ReactNode }) {
  return (
    <div className={`${w.mini} ${className ?? ""}`} style={{ ["--tone" as string]: tone }}>
      <span className={w.miniName}><i />{name}</span>
      {children}
    </div>
  );
}

const RED = "var(--bad)";
const AMBER = "var(--warn)";
const BLUE = "var(--accent)";
const SAGE = "#5B8A6B";
const DENIM = "#3E67A6";

/** 1. A dashboard of little windows: three widgets rise in, each with its number or chart. */
function Windows() {
  return (
    <div className={`${w.scene} ${w.windows}`}>
      <Mini className={w.winA} tone="var(--ink)" name="Spending">
        <b className={w.num}>€46<em>.37</em></b>
        <svg className={w.spark} viewBox="0 0 90 26" preserveAspectRatio="none" aria-hidden="true">
          <path d="M2 22 C 14 20, 18 12, 30 14 S 48 6, 58 9 S 78 3, 88 4" />
        </svg>
      </Mini>
      <Mini className={w.winB} tone={SAGE} name="Polls">
        <b className={w.num}>1</b>
        <span className={w.pill}>Vote</span>
      </Mini>
      <Mini className={w.winC} tone={DENIM} name="Boards">
        <span className={w.stackBar}><i style={{ background: RED, flex: 4 }} /><i style={{ background: AMBER, flex: 3 }} /><i style={{ background: BLUE, flex: 2 }} /></span>
        <span className={w.legend}><span><i style={{ background: RED }} />4 high</span><span><i style={{ background: AMBER }} />3 medium</span><span><i style={{ background: BLUE }} />2 low</span></span>
      </Mini>
    </div>
  );
}

/** 2. One widget, three sizes: it grows from a number, to a chart, to the whole picture. */
function Sizes() {
  return (
    <div className={`${w.scene} ${w.sizes}`}>
      <Mini className={w.morph} tone="var(--ink)" name="Spending">
        <b className={w.num}>€46<em>.37</em></b>
        <svg className={w.morphChart} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <path className={w.morphPrev} d="M0 36 C 20 32, 30 24, 50 20 S 80 8, 100 4" />
          <path d="M0 38 C 12 34, 20 30, 34 26" />
          <circle cx="34" cy="26" r="3" />
        </svg>
        <span className={w.morphRows}>
          <span><b>Lunch</b><em>€24.00</em></span>
          <span><b>Taxi</b><em>€12.50</em></span>
          <span><b>Coffee</b><em>€4.80</em></span>
        </span>
      </Mini>
      <span className={w.sizeTabs} aria-hidden="true"><span>Small</span><span>Medium</span><span>Large</span></span>
    </div>
  );
}

/** 3. Many views: the same board widget by priority, then deadlines, then what's missing. */
function Views() {
  return (
    <div className={`${w.scene} ${w.views}`}>
      <Mini className={w.viewCard} tone={DENIM} name="Boards">
        <span className={w.viewTabs} aria-hidden="true">
          <i className={w.viewLens} />
          <span>Priority</span><span>Deadlines</span><span>Missing</span>
        </span>
        <span className={`${w.pane} ${w.pane1}`}>
          <span className={w.stackBar}><i style={{ background: RED, flex: 4 }} /><i style={{ background: AMBER, flex: 3 }} /><i style={{ background: BLUE, flex: 2 }} /></span>
          <span className={w.paneRows}>
            <span><i style={{ background: RED }} />Pricing page copy</span>
            <span><i style={{ background: RED }} />Investor preview</span>
            <span><i style={{ background: AMBER }} />Android QA</span>
          </span>
        </span>
        <span className={`${w.pane} ${w.pane2}`}>
          <span className={w.cols}>
            {[0.35, 0.7, 0.35, 0.95, 0.35, 0.12, 0.35, 0.12].map((h, i) => (
              <i key={i} style={{ height: `${h * 100}%`, background: i === 0 ? RED : h > 0.6 ? BLUE : undefined, ["--d" as string]: i }} />
            ))}
          </span>
        </span>
        <span className={`${w.pane} ${w.pane3}`}>
          <span className={w.tiles}>
            <span><b style={{ color: AMBER }}>2</b>No one on it</span>
            <span><b style={{ color: BLUE }}>3</b>No due date</span>
          </span>
          <span className={w.paneRows}>
            <span><i style={{ background: AMBER }} />Record the demo video</span>
          </span>
        </span>
      </Mini>
    </div>
  );
}

/** 4. Hold, drag, drop: a finger lifts the board widget, a blue slot opens at the top, it lands there. */
function Move() {
  return (
    <div className={`${w.scene} ${w.move}`}>
      <span className={w.moveSlot} />
      <span className={w.moveLine} />
      <Mini className={w.moveA} tone="var(--ink)" name="Spending"><b className={w.numSm}>€46</b></Mini>
      <Mini className={w.moveB} tone={SAGE} name="Polls"><b className={w.numSm}>1</b></Mini>
      <Mini className={w.moveC} tone={DENIM} name="Boards">
        <span className={w.stackBar}><i style={{ background: RED, flex: 4 }} /><i style={{ background: AMBER, flex: 3 }} /><i style={{ background: BLUE, flex: 2 }} /></span>
      </Mini>
      <span className={w.moveRing} />
      <span className={w.finger} />
    </div>
  );
}

const STEPS: { title: string; body: string; scene: ReactNode }[] = [
  {
    title: "Little windows on your chats",
    body: "Each widget keeps an eye on one thing: what you spent, your boards, the polls waiting for your vote, the week ahead.",
    scene: <Windows />,
  },
  {
    title: "Small, medium or large",
    body: "Small shows the number. Medium adds the chart. Large gives you the whole picture, with what’s behind it.",
    scene: <Sizes />,
  },
  {
    title: "One widget, many views",
    body: "Change what a widget shows anytime: a board by priority, by deadline, or what’s missing an owner or a date.",
    scene: <Views />,
  },
  {
    title: "Hold it to move it",
    body: "Hold any widget to edit or remove it. Keep holding and drag: a blue slot shows where it will land, and the rest make room.",
    scene: <Move />,
  },
];
export const INTRO_STEPS = STEPS.length;

export function WidgetIntro({ step, onStep, onDone }: { step: number; onStep: (n: number) => void; onDone: () => void }) {
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const swipe = useRef<number | null>(null);
  return (
    <div className={w.intro}>
      <div
        key={step}
        className={w.stage}
        onPointerDown={(e) => { swipe.current = e.clientX; }}
        onPointerUp={(e) => {
          const from = swipe.current;
          swipe.current = null;
          if (from === null || Math.abs(e.clientX - from) < 40) return;
          if (e.clientX < from) { if (last) onDone(); else onStep(step + 1); } else if (step > 0) onStep(step - 1);
        }}
        aria-hidden="true"
      >
        {s.scene}
      </div>
      <div key={`copy-${step}`} className={w.copy}>
        <p className={w.eyebrow}>{step + 1} of {STEPS.length}</p>
        <h3>{s.title}</h3>
        <p>{s.body}</p>
      </div>
      <div className={w.dots} role="tablist" aria-label="Steps">
        {STEPS.map((x, i) => (
          <button key={x.title} role="tab" aria-selected={i === step} aria-label={`Step ${i + 1}: ${x.title}`} className={i === step ? w.dotOn : undefined} onClick={() => onStep(i)} />
        ))}
      </div>
      <button className={`${styles.primaryWide} ${w.next}`} data-autofocus onClick={() => (last ? onDone() : onStep(step + 1))}>
        {last ? "Choose my first widget" : "Next"}
      </button>
      {!last && <button className={w.skip} onClick={onDone}>Skip the intro</button>}
    </div>
  );
}
