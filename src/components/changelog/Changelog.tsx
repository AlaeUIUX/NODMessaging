"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconArrowRight } from "@/components/chat/Icons";
import PlayInView from "@/components/updates/PlayInView";
import { CopyLink, People, Stage, ThemeSwitch, useChangelogTheme } from "./parts";
import WeekSheet from "./WeekSheet";
import { WEEKS, weekBySlug, weekRange, type Week } from "./weeks";
import s from "./changelog.module.css";

const PATH = /^\/changelog\/([^/]+)\/?$/;
/** The week on the sheet; `session` changes only when a sheet opens, so stepping weeks doesn't re-raise it. */
type Open = { slug: string; section?: string; session: number };

/**
 * The changelog: one entry per week, newest first, laid out like Interfere's
 * (the date and a copy link on a rule, the title and people on the left, a
 * picture and the summary on the right). A week opens as a sheet that rises
 * over the list, the way the Catalyst Design Lab case studies do, at its own
 * address (/changelog/<monday>), so Back closes it and the link can be sent.
 */
export default function Changelog({ initial }: { initial?: string }) {
  const [open, setOpen] = useState<Open | null>(() => (initial && weekBySlug(initial) ? { slug: initial, session: 0 } : null));
  /** The sheet is on its way out because of Back, so closing mustn't touch the history again. */
  const [leaving, setLeaving] = useState(false);
  const pushed = useRef(false);

  const show = useCallback((slug: string, section?: string) => {
    if (!weekBySlug(slug)) return;
    window.history.pushState({ changelog: slug }, "", `/changelog/${slug}`);
    pushed.current = true;
    setLeaving(false);
    setOpen({ slug, section, session: Date.now() });
  }, []);

  /** From inside the sheet: an older or newer week, in place of this one. */
  const go = useCallback((slug: string) => {
    window.history.replaceState({ changelog: slug }, "", `/changelog/${slug}`);
    setOpen((o) => ({ slug, session: o?.session ?? Date.now() }));
  }, []);

  const closed = useCallback(() => {
    setOpen(null);
    if (leaving) { setLeaving(false); return; }
    if (pushed.current) { pushed.current = false; window.history.back(); }
    else window.history.replaceState(null, "", "/changelog");
  }, [leaving]);

  useEffect(() => {
    const onPop = () => {
      const slug = PATH.exec(window.location.pathname)?.[1];
      if (slug && weekBySlug(slug)) {
        setLeaving(false);
        setOpen((o) => ({ slug, session: o?.session ?? Date.now() }));
      } else {
        pushed.current = false;
        setOpen((o) => { if (o) setLeaving(true); return o; });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const week = open ? weekBySlug(open.slug) : undefined;
  const theme = useChangelogTheme();

  return (
    <div className={s.page} data-theme={theme.choice ?? undefined}>
      <div className={s.wrap} inert={!!week}>
        <header className={s.head}>
          <div className={s.headTop}>
            <h1>Changelog</h1>
            <ThemeSwitch shown={theme.shown} onChange={theme.set} />
          </div>
          <p className={s.lede}>What changed in the NOD prototype, a week at a time. Open a week for the whole story, with recordings.</p>
          <Link href="/" className={s.open}>Open the prototype <IconArrowRight size={16} /></Link>
        </header>

        <PlayInView>
          {WEEKS.map((w) => <Entry key={w.slug} week={w} onOpen={show} />)}
        </PlayInView>

        <footer className={s.foot}>
          Recordings and stills are of the prototype itself. Older weeks show those features as they look today, after the
          colour and icon pass of week 8.
        </footer>
      </div>

      {week && open && (
        <WeekSheet key={open.session} week={week} section={open.section} leaving={leaving} onClosed={closed} onGo={go} />
      )}
    </div>
  );
}

function Entry({ week, onOpen }: { week: Week; onOpen: (slug: string, section?: string) => void }) {
  return (
    <article className={s.entry} id={week.slug} aria-labelledby={`t-${week.slug}`}>
      <div className={s.meta}>
        <time dateTime={week.from}>{weekRange(week)}</time>
        {week.open && <span className={s.now}>This week</span>}
        <CopyLink slug={week.slug} />
      </div>
      <div className={s.body}>
        <div className={s.side}>
          <span className={s.weekNo}>Week {week.n}</span>
          <h2 id={`t-${week.slug}`}>
            <button type="button" onClick={() => onOpen(week.slug)}>{week.title}</button>
          </h2>
          <People names={week.people} />
        </div>
        <div className={s.main}>
          <button type="button" className={s.coverBtn} onClick={() => onOpen(week.slug)} aria-label={`Open week ${week.n}: ${week.title}`}>
            <Stage media={week.cover} week={week} />
          </button>
          {week.summary.map((p, i) => <p key={i}>{p}</p>)}
          <ul className={s.toc} aria-label={`In week ${week.n}`}>
            {week.sections.map((x) => (
              <li key={x.id}><button type="button" onClick={() => onOpen(week.slug, x.id)}>{x.title}</button></li>
            ))}
          </ul>
          <button type="button" className={s.read} onClick={() => onOpen(week.slug)}>
            Read week {week.n} <IconArrowRight size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
