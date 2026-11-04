import type { Metadata } from "next";
import Link from "next/link";
import PlayInView from "@/components/updates/PlayInView";
import styles from "./updates.module.css";

export const metadata: Metadata = {
  title: "NOD · What changed this week",
  description: "Ten short clips of the latest prototype changes: chat fixes, pins, the Dashboard in one currency and the answers to “Gaps in Mind”.",
};

type Clip = { file: string; title: string; tag?: string; text: string; try: React.ReactNode };

const GROUPS: { id: string; name: string; note?: string; clips: Clip[] }[] = [
  {
    id: "chat",
    name: "Chat",
    clips: [
      {
        file: "typing",
        title: "Typing that holds",
        text: "“Reema is typing” stays on for as long as she types. It used to vanish after 5 seconds. The inbox now shows typing from any channel, with the channel’s name, and editing a sent message no longer says you’re typing.",
        try: "open a second window as someone in NOD Team and type for a while.",
      },
      {
        file: "pins",
        title: "Pins, the WhatsApp way",
        text: "Pinning asks for how long (24 hours, 7 days or 30 days) and the message flies into a bar under the header. Up to three pins; a tap on the bar goes to one and steps to the next. “You pinned a message” stays in the thread. In groups, pinning is a role permission.",
        try: "hold a message › Pin.",
      },
    ],
  },
  {
    id: "dashboard",
    name: "Dashboard",
    clips: [
      {
        file: "money",
        title: "Money in one currency",
        text: "Totals and charts add up in your main currency, at reference rates, marked “≈” when something was converted. Each bill keeps its own currency on its row. “Spent this month” now lists only this month.",
        try: "Settings › Currency.",
      },
    ],
  },
  {
    id: "mind",
    name: "Mind",
    note: "answers to “Gaps in Mind”",
    clips: [
      {
        file: "offline",
        title: "Offline",
        tag: "GAP 1",
        text: "One quiet line: “Offline · showing what’s on this phone”. New items wait with a clock and send themselves when the phone is back. Moving, deleting, sharing and edits are refused up front, with a toast that says what needs a connection.",
        try: "Developer panel › Go offline.",
      },
      {
        file: "retry",
        title: "When NOD can’t be reached",
        tag: "GAP 1",
        text: "A change that fails comes back, and the toast names it (“Couldn’t delete it. It’s back.”) with Retry. A collection that can’t load says so in its place, with Try again.",
        try: "Developer panel › Force Mind & network failure.",
      },
      {
        file: "uploads",
        title: "Uploads",
        tag: "GAP 2",
        text: "Photos and files land at once from the phone’s copy, dimmed, with a ring (photo) or a thin bar (file). One that fails gets a retry arrow on its tile. Skeletons wait 300 ms, so quick loads don’t flash.",
        try: "add an Image or a File to any collection.",
      },
      {
        file: "currency",
        title: "Currencies",
        tag: "GAP 7",
        text: "The picker lists Recent, then Common, then All, and searches by code, name or country. Cards show the symbol, adding the code only when the symbol is shared ($, kr, ¥). A new amount starts in the last currency used, else the phone’s region’s.",
        try: "add an Amount, tap the currency.",
      },
      {
        file: "shared",
        title: "Shared with you",
        tag: "GAP 8",
        text: "One row on Mind home for everything others shared with you: collections first, then items, newest first. Swipe or hold for Save a copy (the row then reads “In your Mind”) or Hide, which leaves the owner’s Mind alone.",
        try: "Reset demo data, then Mind. Charles and Reema have shared something.",
      },
      {
        file: "unassigned",
        title: "Delete everything asks first",
        tag: "GAP 10",
        text: "With shared items out of Unassigned, “Delete everything” means your own things. It asks first with the count on the button, and Undo brings it all back.",
        try: "hold the “things to sort” tray.",
      },
      {
        file: "strangers",
        title: "People who aren’t contacts",
        tag: "GAP 11",
        text: "Sharing names people by their contact name, else @username, else “Someone on NOD”, with a silhouette instead of an initial. A request from someone we can’t name says so, and Allow asks once before giving them access.",
        try: <>open a link to your collection as a crew member (<code>?as=noura</code>) and ask to view.</>,
      },
    ],
  },
];

const clip = (file: string, ext: string) => `/updates/${file}.${ext}`;

/** What changed in the prototype this week, as short clips for the team. */
export default function Page() {
  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.head}>
          <span className={styles.eyebrow}>Prototype · 4 November 2026</span>
          <h1>What changed in NOD this week</h1>
          <p className={styles.lede}>
            Ten short clips of the latest prototype changes: chat fixes, WhatsApp-style pins, the Dashboard in one currency,
            and the answers to Vanessa’s “Gaps in Mind”, built into the prototype.
          </p>
          <Link href="/" className={styles.open}>Open the prototype</Link>
        </header>

        <PlayInView>
          {GROUPS.map((g) => (
            <section key={g.id} className={styles.group} aria-labelledby={g.id}>
              <h2 id={g.id}>{g.name}{g.note && <small>{g.note}</small>}</h2>
              <div className={styles.grid}>
                {g.clips.map((c) => (
                  <figure key={c.file}>
                    <div className={styles.frame}>
                      <video src={clip(c.file, "mp4")} poster={clip(c.file, "webp")} muted loop playsInline preload="metadata" />
                    </div>
                    <figcaption>
                      <h3>{c.title}{c.tag && <span className={styles.tag}>{c.tag}</span>}</h3>
                      <p>{c.text}</p>
                      <p className={styles.try}><b>Try it:</b> {c.try}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ))}
        </PlayInView>

        <footer className={styles.foot}>
          Typing, Pins, Money in one currency and Shared with you are screen recordings of this prototype, with two phones
          side by side when two people are involved. The other six are animated in NOD’s own components; what they show is
          what the prototype does.
        </footer>
      </div>
    </div>
  );
}
