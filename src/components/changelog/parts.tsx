"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconCheck, IconLink, IconMoon, IconSun } from "@/components/chat/Icons";
import type { Media, Week } from "./weeks";
import s from "./changelog.module.css";

/* ---- light or dark: the system's until the switch picks one, remembered in this browser ---- */

type Theme = "light" | "dark";
const KEY = "nod.changelog.theme";
const EVENT = "nod:changelog-theme";
const DARK = "(prefers-color-scheme: dark)";

const readChoice = (): Theme | null => {
  try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : null; } catch { return null; }
};
const subscribe = (fn: () => void) => {
  const mq = window.matchMedia(DARK);
  mq.addEventListener("change", fn);
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => { mq.removeEventListener("change", fn); window.removeEventListener(EVENT, fn); window.removeEventListener("storage", fn); };
};

/** The chosen theme (null: follow the system) and the one showing now. */
export function useChangelogTheme() {
  const choice = useSyncExternalStore(subscribe, readChoice, () => null);
  const systemDark = useSyncExternalStore(subscribe, () => window.matchMedia(DARK).matches, () => false);
  const shown: Theme = choice ?? (systemDark ? "dark" : "light");
  const set = (t: Theme) => {
    try { localStorage.setItem(KEY, t); } catch { /* private mode: it lasts this visit */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return { choice, shown, set };
}

export function ThemeSwitch({ shown, onChange }: { shown: Theme; onChange: (t: Theme) => void }) {
  const dark = shown === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={s.theme}
      onClick={() => onChange(dark ? "light" : "dark")}
    >
      <span className={s.themeKnob}>{dark ? <IconMoon size={15} /> : <IconSun size={15} />}</span>
    </button>
  );
}

export function People({ names }: { names: string[] }) {
  return (
    <ul className={s.people}>
      {names.map((n) => (
        <li key={n}><span className={s.face} aria-hidden="true">{n[0]}</span>{n}</li>
      ))}
    </ul>
  );
}

export function CopyLink({ slug }: { slug: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    const url = `${window.location.origin}/changelog/${slug}`;
    try { await navigator.clipboard.writeText(url); } catch { window.prompt("Copy this link", url); }
    setDone(true);
    window.setTimeout(() => setDone(false), 1600);
  };
  return (
    <button type="button" className={s.copy} onClick={copy} aria-live="polite">
      {done ? <IconCheck size={15} /> : <IconLink size={15} />}
      {done ? "Copied" : "Copy link"}
    </button>
  );
}

/**
 * A week's pictures on a soft stage: the app in its whole iPhone (recordings
 * and stills), or a clip that has its own stage. Two devices side by side are a
 * pair (last week and this week), so their clips are kept in step.
 */
export function Stage({ media, week, big }: { media?: Media[]; week: Week; big?: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  const paired = (media?.length ?? 0) > 1 && media!.every((m) => m.kind === "video");

  // The second clip follows the first, so the same gesture plays at the same moment.
  useEffect(() => {
    if (!paired) return;
    const [lead, follow] = [...(root.current?.querySelectorAll("video") ?? [])];
    if (!lead || !follow) return;
    const sync = () => {
      if (lead.paused) { follow.pause(); return; }
      if (follow.paused) follow.play().catch(() => {});
      if (Math.abs(follow.currentTime - lead.currentTime) > .12) follow.currentTime = lead.currentTime;
    };
    lead.addEventListener("timeupdate", sync);
    lead.addEventListener("play", sync);
    lead.addEventListener("pause", sync);
    return () => {
      lead.removeEventListener("timeupdate", sync);
      lead.removeEventListener("play", sync);
      lead.removeEventListener("pause", sync);
    };
  }, [paired]);

  if (!media?.length) {
    return (
      <span className={`${s.stage} ${s.stageType}`}>
        <span className={s.stageNo}>{week.n}</span>
        <span className={s.stageList}>{week.sections.map((x) => <span key={x.id}>{x.title}</span>)}</span>
      </span>
    );
  }
  if (media[0].frame === "wide") {
    const m = media[0];
    return (
      <span className={`${s.stage} ${s.stageWide}`}>
        {m.kind === "video" && <video src={m.src} poster={m.poster} muted loop playsInline preload="metadata" aria-label={m.alt} />}
      </span>
    );
  }
  return (
    <span ref={root} className={`${s.stage} ${s.stageDevice} ${big ? s.stageBig : ""}`}>
      {media.map((m) => (
        <span key={m.src} className={s.deviceCol}>
          {m.label && <span className={s.deviceLabel}>{m.label}</span>}
          <span className={s.device}>
            {m.kind === "video"
              ? <video src={m.src} poster={m.poster} muted loop playsInline preload="metadata" aria-label={m.alt} />
              : <Image src={m.src} alt={m.alt} width={568} height={1158} sizes="(max-width: 720px) 45vw, 320px" />}
          </span>
        </span>
      ))}
    </span>
  );
}
