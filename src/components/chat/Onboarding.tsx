"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { initials, TONES } from "@/lib/chat/avatar";
import { Emoji } from "@/lib/chat/emoji";
import {
  ADDRESS_BOOK, allPeople, COUNTRIES, createPerson, findByPhone, formatPhone, suggestUsername, toE164, type Country,
} from "@/lib/chat/people";
import { USERS } from "@/lib/chat/seed";
import type { AvatarTone, User } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconBack, IconCheck, IconChevron, IconMessage, IconSmartphone, IconUserGroup } from "./Icons";
import Logo from "./Logo";
import { AvatarPicker, ProfileFields, profileReady, type ProfileDraft } from "./Profile";
import StatusBar from "./StatusBar";
import { getPermission, PermissionAlert, setPermission, Sheet } from "./ui";
import styles from "./chat.module.css";
import s from "./account.module.css";

/**
 * Getting into NOD: a short welcome that says what the app is for, then a
 * phone number and a texted code. A number NOD knows signs that person in;
 * a new one goes on to name, username and avatar, and a look for people you
 * already know. The same flow adds a second identity from Settings.
 */

type Step = "welcome" | "phone" | "code" | "profile" | "contacts";

const SLIDES = [
  { title: "Talk it through", body: "Chat one to one, or start a Space for a team, a trip or a project.", art: <ArtChat /> },
  { title: "Decide in the thread", body: "Polls, checklists, plans, boards and payments live right in the conversation.", art: <ArtPoll /> },
  { title: "Keep what matters", body: "Save anything from a chat into Mind: your own collections of stacks, notes and links.", art: <ArtMind /> },
  { title: "See what needs you", body: "Analytics gathers your spending, votes, tasks and what’s coming up this week.", art: <ArtDash /> },
];

const newCode = () => String(Math.floor(100000 + Math.random() * 900000));
const TONE_ORDER: AvatarTone[] = ["denim", "sage", "clay", "ochre", "plum", "graphite"];

export default function Onboarding({ mode, onDone, onCancel }: {
  mode: "first" | "add";
  /** Signed in (or signed up) as this person. */
  onDone: (userId: string) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<Step>(mode === "add" ? "phone" : "welcome");
  const [back, setBack] = useState(false);
  const go = (next: Step, backwards = false) => { setBack(backwards); setStep(next); };

  /* ---- phone ---- */
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [local, setLocal] = useState("");
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const digits = local.replace(/\D/g, "");
  const phone = toE164(country.dial, local);

  /* ---- code ---- */
  const [code, setCode] = useState(newCode);
  const [typed, setTyped] = useState("");
  const [bad, setBad] = useState(false);
  const [ok, setOk] = useState(false);
  const [sms, setSms] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const [returning, setReturning] = useState<User | null>(null);

  /* ---- profile ---- */
  const [draft, setDraft] = useState<ProfileDraft>(() => ({ fullName: "", username: "", tone: TONE_ORDER[Math.floor(Math.random() * TONE_ORDER.length)] }));
  const handleTouched = useRef(false);
  const created = useRef<User | null>(null);

  /* ---- contacts ---- */
  const [asking, setAsking] = useState(false);
  const [contactsOk, setContactsOk] = useState(false);

  const sendCode = () => {
    setCode(newCode());
    setTyped("");
    setBad(false);
    setSms(false);
    setResendIn(30);
  };

  // The texted code arrives a moment after the screen opens, like a real SMS.
  useEffect(() => {
    if (step !== "code" || ok) return;
    const t = setTimeout(() => setSms(true), 1300);
    const hide = setTimeout(() => setSms(false), 9000);
    return () => { clearTimeout(t); clearTimeout(hide); };
  }, [step, code, ok]);
  useEffect(() => {
    if (step !== "code" || resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [step, resendIn]);

  const verify = (value: string) => {
    if (value.length < 6) return;
    if (value !== code) { setBad(true); return; }
    setOk(true);
    setSms(false);
    const who = findByPhone(phone);
    setReturning(who);
    setTimeout(() => {
      if (who) onDone(who.id);
      else go("profile");
    }, 700);
  };

  const finishProfile = () => {
    if (!profileReady(draft)) return;
    created.current = createPerson({ ...draft, phone });
    go("contacts");
  };
  // Skipped: the account is just the number (its id, and the name people see).
  const skipProfile = () => {
    created.current = createPerson({ tone: draft.tone, phone });
    go("contacts");
  };

  // Everyone in the address book who's on NOD (the new person aside).
  const known = useMemo(() => {
    const people = allPeople();
    return ADDRESS_BOOK.map((e) => people.find((u) => u.phone === e.phone)).filter((u): u is User => !!u && u.phone !== phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, contactsOk]);

  const finish = () => { if (created.current) onDone(created.current.id); };

  // Focus each step's first field without scrolling the page around the phone (autoFocus would).
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(f);
  }, [step, confirming]);

  return (
    <div ref={root} className={`${styles.screen} ${s.onboarding} ${mode === "add" ? s.onboardingAdd : ""}`} role={mode === "add" ? "dialog" : undefined} aria-modal={mode === "add" || undefined} aria-label={mode === "add" ? "Add an identity" : "Welcome to NOD"}>
      <StatusBar />
      <div key={step} className={`${s.step} ${back ? s.stepBack : ""}`}>
        {step === "welcome" && <Welcome onStart={() => go("phone")} />}

        {step === "phone" && (
          <>
            <nav className={s.nav}>
              {mode === "add"
                ? <button className={s.navText} onClick={onCancel}>Cancel</button>
                : <button className={`${styles.circleBtn} ${styles.glass}`} onClick={() => go("welcome", true)} aria-label="Back"><IconBack /></button>}
            </nav>
            <div className={s.body}>
              <span className={s.medallion}><IconSmartphone size={30} /></span>
              <h1 className={s.title}>{mode === "add" ? "Add an identity" : "Your phone number"}</h1>
              <p className={s.lede}>{mode === "add" ? "Sign in with another number. You can switch between them from Settings." : "We’ll text you a code to make sure it’s you."}</p>
              <div className={s.phoneBox}>
                <button className={s.countryRow} onClick={() => setPicking(true)}>
                  <Emoji char={country.flag} />
                  <span>{country.name}</span>
                  <IconChevron size={14} />
                </button>
                <label className={s.numberRow}>
                  <b>{country.dial}</b>
                  <input
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="660 123 4567"
                    value={local}
                    onChange={(e) => setLocal(e.target.value.replace(/[^\d ]/g, "").slice(0, 16))}
                    onKeyDown={(e) => { if (e.key === "Enter" && digits.length >= 6) setConfirming(true); }}
                    data-autofocus
                    aria-label="Phone number"
                  />
                </label>
              </div>
              <div className={s.demo}>
                <p>Trying the demo? These numbers sign you in as the people in it. Any other number makes a new account.</p>
                <div className={s.demoPeople}>
                  {USERS.map((u) => {
                    const p = allPeople().find((x) => x.id === u.id) ?? u;
                    return (
                      <button key={u.id} onClick={() => { setCountry(COUNTRIES[0]); setLocal((u.phone ?? "").replace("+43", "")); }}>
                        <Avatar glyph={initials(p.fullName)} tone={p.tone} photo={p.photo} size={22} shape="circle" />
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <footer className={s.foot}>
              <button className={styles.primaryWide} disabled={digits.length < 6} onClick={() => setConfirming(true)}>Continue</button>
              <p className={s.fine}>By continuing you agree to NOD’s Terms and Privacy Policy.</p>
            </footer>
            {confirming && (
              <div className={s.confirmScrim} onClick={() => setConfirming(false)}>
                <div className={`${s.confirm} ${styles.glassStrong}`} role="alertdialog" aria-label="Confirm your number" onClick={(e) => e.stopPropagation()}>
                  <b>{formatPhone(phone)}</b>
                  <p>Is this the right number?</p>
                  <div>
                    <button onClick={() => setConfirming(false)}>Edit</button>
                    <button className={s.confirmGo} data-autofocus onClick={() => { setConfirming(false); sendCode(); go("code"); }}>Continue</button>
                  </div>
                </div>
              </div>
            )}
            {picking && (
              <Sheet title="Country" onClose={() => setPicking(false)}>
                {(close) => (
                  <div className={styles.listGroup}>
                    {COUNTRIES.map((c) => (
                      <button key={c.code} className={styles.actionRow} onClick={() => close(() => setCountry(c))}>
                        <span className={s.flag}><Emoji char={c.flag} /></span>
                        <span className={styles.contactText}><b>{c.name}</b><small>{c.dial}</small></span>
                        {c.code === country.code && <IconCheck size={16} />}
                      </button>
                    ))}
                  </div>
                )}
              </Sheet>
            )}
          </>
        )}

        {step === "code" && (
          <>
            <nav className={s.nav}>
              <button className={`${styles.circleBtn} ${styles.glass}`} onClick={() => go("phone", true)} aria-label="Back" disabled={ok}><IconBack /></button>
            </nav>
            <div className={s.body}>
              <span className={s.medallion}><IconMessage size={30} /></span>
              <h1 className={s.title}>Enter the code</h1>
              <p className={s.lede}>We texted a 6-digit code to <b>{formatPhone(phone)}</b>.</p>
              <label className={`${s.code} ${bad ? s.codeBad : ""} ${ok ? s.codeOk : ""}`}>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={typed}
                  maxLength={6}
                  data-autofocus
                  disabled={ok}
                  aria-label="Verification code"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setTyped(v);
                    setBad(false);
                    verify(v);
                  }}
                />
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className={i === typed.length && !ok ? s.codeHere : undefined} aria-hidden="true">{typed[i] ?? ""}</span>
                ))}
              </label>
              <p className={`${s.codeNote} ${bad ? s.noteBad : ""}`} aria-live="polite">
                {ok ? <><IconCheck size={13} /> {returning ? `Welcome back, ${returning.name}` : "Number confirmed"}</>
                  : bad ? "That code isn’t right. Check the text and try again."
                  : " "}
              </p>
              <div className={s.codeLinks}>
                {resendIn > 0
                  ? <span>Send a new code in 0:{String(resendIn).padStart(2, "0")}</span>
                  : <button className={s.textBtn} onClick={sendCode}>Send a new code</button>}
                <button className={s.textBtn} onClick={() => go("phone", true)}>Wrong number?</button>
              </div>
            </div>
            {sms && (
              <button
                className={`${s.sms} ${styles.glassStrong}`}
                onClick={() => { setTyped(code); setSms(false); verify(code); }}
                aria-label={`Text message: your NOD code is ${code}. Tap to fill it in.`}
              >
                <span className={s.smsIcon}><IconMessage size={16} /></span>
                <span className={s.smsText}>
                  <b>Messages <small>now</small></b>
                  <span>NOD code: {code.slice(0, 3)} {code.slice(3)}. Don’t share it with anyone.</span>
                </span>
              </button>
            )}
          </>
        )}

        {step === "profile" && (
          <>
            <nav className={`${s.nav} ${s.navEnd}`}>
              <button className={s.navText} onClick={skipProfile}>Skip</button>
            </nav>
            <div className={s.body}>
              <h1 className={s.title}>Set up your profile</h1>
              <p className={s.lede}>A photo, a name and a username help people know it’s you. It’s all optional.</p>
              <AvatarPicker tones={false} draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
              <ProfileFields
                withBio
                draft={draft}
                onChange={(p) => setDraft((d) => {
                  if (p.username !== undefined) handleTouched.current = true;
                  const next = { ...d, ...p };
                  // Until you type a username yourself, one follows your name.
                  if (p.fullName !== undefined && !handleTouched.current) next.username = p.fullName.trim() ? suggestUsername(p.fullName) : "";
                  return next;
                })}
              />
              <p className={s.idNote}>
                <IconSmartphone size={14} />
                <span>Your NOD ID is your number, <b>{formatPhone(phone)}</b>. Skip this and that’s what people see.</span>
              </p>
            </div>
            <footer className={s.foot}>
              <button className={styles.primaryWide} disabled={!profileReady(draft)} onClick={finishProfile}>Continue</button>
            </footer>
          </>
        )}

        {step === "contacts" && (
          <>
            <nav className={s.nav} />
            <div className={s.body}>
              <span className={s.medallion}><IconUserGroup size={30} /></span>
              <h1 className={s.title}>Find people you know</h1>
              <p className={s.lede}>NOD can check your contacts to show who’s already here. Numbers stay private, and nobody is told you joined.</p>
              {contactsOk && (
                <div className={s.found}>
                  <b>{known.length ? `${known.length} people you know are on NOD` : "None of your contacts are here yet"}</b>
                  <div className={s.foundFaces}>
                    {known.slice(0, 6).map((u) => (
                      <span key={u.id}>
                        <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={44} shape="circle" />
                        <small>{u.name}</small>
                      </span>
                    ))}
                  </div>
                  <p>Message them from New chat, and invite the rest from there too.</p>
                </div>
              )}
            </div>
            <footer className={s.foot}>
              {contactsOk ? (
                <button className={styles.primaryWide} onClick={finish}>Start using NOD</button>
              ) : (
                <>
                  <button className={styles.primaryWide} onClick={() => (getPermission("contacts") === "granted" ? setContactsOk(true) : setAsking(true))}>Allow access</button>
                  <button className={styles.secondaryWide} onClick={finish}>Not now</button>
                </>
              )}
            </footer>
            {asking && (
              <PermissionAlert kind="contacts" onResolve={(granted) => {
                setPermission("contacts", granted ? "granted" : "denied");
                setAsking(false);
                if (granted) setContactsOk(true); else finish();
              }} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ===========================================================================
   Welcome: four slides, swiped or tapped through
   =========================================================================== */

function Welcome({ onStart }: { onStart: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const goTo = (i: number) => track.current?.scrollTo({ left: i * (track.current.clientWidth), behavior: "smooth" });
  return (
    <>
      <header className={s.brand}>
        <Logo size={26} />
        <span>nod</span>
      </header>
      <div
        ref={track}
        className={s.slides}
        onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        aria-roledescription="carousel"
      >
        {SLIDES.map((sl, i) => (
          <section key={sl.title} className={s.slide} aria-roledescription="slide" aria-label={`${i + 1} of ${SLIDES.length}`}>
            <div className={s.art} aria-hidden="true">{sl.art}</div>
            <h1 className={s.title}>{sl.title}</h1>
            <p className={s.lede}>{sl.body}</p>
          </section>
        ))}
      </div>
      <div className={s.dots} role="tablist" aria-label="Slides">
        {SLIDES.map((sl, i) => (
          <button key={sl.title} role="tab" aria-selected={at === i} aria-label={sl.title} className={at === i ? s.dotOn : undefined} onClick={() => goTo(i)} />
        ))}
      </div>
      <footer className={s.foot}>
        <button className={styles.primaryWide} onClick={onStart}>Get started</button>
        <button className={s.textBtn} onClick={onStart}>I already have an account</button>
      </footer>
    </>
  );
}

/* ---- The four little scenes, drawn from the app's own parts ---- */

function Face({ id }: { id: string }) {
  const u = USERS.find((x) => x.id === id)!;
  return <Avatar glyph={initials(u.fullName)} tone={u.tone} size={24} shape="circle" />;
}

function ArtChat() {
  return (
    <div className={s.scene}>
      <div className={s.artSpace} style={{ background: TONES.ochre }}><Logo size={28} /></div>
      <div className={`${s.artBubble} ${s.artTheirs}`}><Face id="reema" /><span>Lunch on Friday?</span></div>
      <div className={`${s.artBubble} ${s.artMine}`}><span>I’m in <Emoji char="🙌" /></span></div>
      <div className={`${s.artBubble} ${s.artTheirs} ${s.artLate}`}><Face id="charles" /><span>Same, book for four</span></div>
    </div>
  );
}

function ArtPoll() {
  return (
    <div className={s.scene}>
      <div className={s.artCard}>
        <small>Poll · closes in 23h</small>
        <b>Where for lunch on Friday?</b>
        <span className={s.artOption}><i style={{ width: "72%" }} /><em>Konjō Ramen</em><strong>3</strong></span>
        <span className={s.artOption}><i style={{ width: "26%" }} /><em>The Mexicano</em><strong>1</strong></span>
        <span className={s.artFaces}><Face id="reema" /><Face id="charles" /><Face id="jamshad" /></span>
      </div>
    </div>
  );
}

function ArtMind() {
  return (
    <div className={s.scene}>
      <div className={`${s.artFolder} ${s.artFolderBack}`} style={{ ["--tone" as string]: "#3E67A6" }}><Emoji char="💼" /><b>Work</b><small>1 stack</small></div>
      <div className={s.artFolder} style={{ ["--tone" as string]: "#C99432" }}><Emoji char="🇩🇪" /><b>German</b><small>6 stacks · 27 items</small><em>1 to sort</em></div>
      <div className={s.artSaved}><IconCheck size={12} /> Saved to Mind</div>
    </div>
  );
}

function ArtDash() {
  return (
    <div className={s.scene}>
      <div className={s.artTiles}>
        <span className={s.artTileOn}><b>5</b><small>Need you</small></span>
        <span><b>4</b><small>This week</small></span>
        <span><b>€19.92</b><small>You owe</small></span>
        <span><b>50%</b><small>Launch checklist</small></span>
      </div>
    </div>
  );
}
