"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Emoji } from "@/lib/chat/emoji";
import { isIsbnQuery } from "@/lib/chat/links";
import { findBooks, SOURCE_LABEL, type BookHit } from "@/lib/chat/lookup";
import { MAX_ATTACHMENT_BYTES } from "@/lib/chat/media";
import { allCurrencies, currencyFlag, currencyMatches, currencyName, recentCurrencies } from "@/lib/chat/money";
import { CURRENCIES } from "@/lib/chat/receipt";
import FileTypeIcon from "./FileTypeIcon";
import { IconCheck, IconChevronDown, IconClose, IconFileAdd, IconImageAdd, IconPaste, IconPlay, IconSearch } from "./Icons";
import { BookSkeleton, RetryLine } from "./Loading";
import { fileSize } from "./Media";
import { toneFor } from "./MindBlocks";
import f from "./mindfields.module.css";

/**
 * The fields Mind's add sheet is built from: a link field you can paste into,
 * the photo and file pickers, a video's preview and the book search. (Dates
 * have their own picker, in DatePicker.)
 */

/* ===========================================================================
   Paste
   =========================================================================== */

/**
 * Pastes what's on the clipboard. The browser may ask first (iOS shows its
 * own Paste bubble); when it won't share, the field takes focus instead, so a
 * long-press or ⌘V does the same.
 */
export function PasteButton({ onPaste, onRefused, label = "Paste" }: { onPaste: (text: string) => void; onRefused?: (why: "empty" | "blocked") => void; label?: string }) {
  const paste = async () => {
    let text = "";
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      onRefused?.("blocked");
      return;
    }
    if (text) onPaste(text);
    else onRefused?.("empty");
  };
  return (
    // Pressing it mustn't take focus from the field (that would drop the phone's keyboard).
    <button type="button" className={f.paste} onPointerDown={(e) => e.preventDefault()} onClick={() => { void paste(); }}>
      <IconPaste size={15} />
      {label}
    </button>
  );
}

/** A one-line field with an icon in front and Paste at the end (a clear button once it has something). */
export function PasteField({ value, onChange, placeholder, icon, label, type = "url", autoFocus, onEnter, pick }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: React.ReactNode;
  label: string;
  type?: "url" | "search";
  autoFocus?: boolean;
  onEnter?: () => void;
  /** What to keep from pasted text: the link in a sentence, say. */
  pick?: (text: string) => string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState<string | null>(null);
  return (
    <div className={f.fieldWrap}>
      <div className={f.field}>
        <span className={f.lead} aria-hidden="true">{icon}</span>
        <input
          ref={ref}
          className={f.input}
          type={type}
          inputMode={type === "url" ? "url" : "search"}
          enterKeyHint={type === "url" ? "go" : "search"}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          data-autofocus={autoFocus || undefined}
          value={value}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => { setHint(null); onChange(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }}
        />
        {value ? (
          <button type="button" className={f.clear} onClick={() => { onChange(""); ref.current?.focus(); }} aria-label={`Clear ${label.toLowerCase()}`}>
            <IconClose size={12} />
          </button>
        ) : (
          <PasteButton
            onPaste={(t) => { setHint(null); onChange(pick ? pick(t) : t); }}
            onRefused={(why) => {
              setHint(why === "empty" ? "There’s nothing on the clipboard." : "Paste wasn’t allowed here. Long-press the field and choose Paste.");
              ref.current?.focus();
            }}
          />
        )}
      </div>
      {hint && <p className={f.hint} role="status">{hint}</p>}
    </div>
  );
}

/* ===========================================================================
   Photos and files
   =========================================================================== */

/** Dropping a file on something: whether one is over it, and the handlers that take it. */
function useDrop(take: (file: File) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) take(file);
      },
    },
  };
}

const isImage = (file: File) => file.type.startsWith("image/");

/** A picture pasted while the picker is open (⌘V with a screenshot on the clipboard). Text pastes are left alone. */
function usePastedImage(take: (file: File) => void) {
  const latest = useRef(take);
  useEffect(() => { latest.current = take; });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find(isImage);
      if (!file) return;
      e.preventDefault();
      latest.current(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);
}

/**
 * The button that opens your photo library. On a phone the system offers the
 * library or the camera; on a computer a picture can be dropped on it or
 * pasted. Once there's a photo it shows it, with Replace and Remove.
 */
export function PhotoPicker({ file, onFile, before }: {
  file: File | null;
  onFile: (file: File | null) => void;
  /** Runs first, like the OS asking for access to Photos; false stops there. Gets the button that was pressed. */
  before?: (from: HTMLElement) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    let live = true;
    void Promise.resolve().then(() => { if (live) setPreview({ file, url }); });
    return () => { live = false; URL.revokeObjectURL(url); };
  }, [file]);
  const src = file && preview?.file === file ? preview.url : null;
  const take = (x: File) => { if (isImage(x)) onFile(x); };
  const drop = useDrop(take);
  usePastedImage(take);
  const open = async (from: HTMLElement) => {
    if (before && !(await before(from))) return;
    input.current?.click();
  };
  return (
    <>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) take(x); e.target.value = ""; }} />
      {file ? (
        <div className={f.photo} {...drop.handlers}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src && <img src={src} alt="The photo you picked" />}
          <span className={f.photoTools}>
            <button type="button" className={f.pill} onClick={(e) => { void open(e.currentTarget); }}><IconImageAdd size={15} /> Replace</button>
            <button type="button" className={f.round} onClick={() => onFile(null)} aria-label="Remove the photo"><IconClose size={13} /></button>
          </span>
        </div>
      ) : (
        <button type="button" className={`${f.pick} ${drop.over ? f.pickOver : ""}`} onClick={(e) => { void open(e.currentTarget); }} {...drop.handlers}>
          <span className={f.pickIcon}><IconImageAdd size={24} /></span>
          <b>Choose from your photos</b>
          <small className={f.onTouch}>Opens your photo library</small>
          <small className={f.onPointer}>Or drop or paste a picture here</small>
        </button>
      )}
    </>
  );
}

/** The button that opens your files. Shows the one picked, with Replace and Remove. */
export function FilePicker({ file, onFile }: { file: File | null; onFile: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [tooBig, setTooBig] = useState(false);
  const take = (x: File) => {
    setTooBig(x.size > MAX_ATTACHMENT_BYTES);
    if (x.size <= MAX_ATTACHMENT_BYTES) onFile(x);
  };
  const drop = useDrop(take);
  return (
    <>
      <input ref={input} type="file" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) take(x); e.target.value = ""; }} />
      {file ? (
        <div className={f.fileRow} {...drop.handlers}>
          <FileTypeIcon name={file.name} mime={file.type} size={34} />
          <span className={f.fileText}><b>{file.name}</b><small>{fileSize(file.size)}</small></span>
          <button type="button" className={f.pill} onClick={() => input.current?.click()}>Replace</button>
          <button type="button" className={f.round} onClick={() => onFile(null)} aria-label="Remove the file"><IconClose size={13} /></button>
        </div>
      ) : (
        <button type="button" className={`${f.pick} ${drop.over ? f.pickOver : ""}`} onClick={() => input.current?.click()} {...drop.handlers}>
          <span className={f.pickIcon}><IconFileAdd size={24} /></span>
          <b>Choose a file</b>
          <small className={f.onTouch}>A PDF, a document, anything up to 100 MB</small>
          <small className={f.onPointer}>Or drop one here · up to 100 MB</small>
        </button>
      )}
      {tooBig && <p className={f.hint} role="alert">That file is over 100 MB. Pick a smaller one.</p>}
    </>
  );
}

/* ===========================================================================
   Video preview
   =========================================================================== */

/** The still of a video with its play badge, the way it will look in Mind. */
export function VideoPreview({ image, duration, site }: { image?: string; duration?: string; site?: string }) {
  return (
    <span className={f.video}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image && <img src={image} alt="" />}
      <span className={f.play}><IconPlay size={18} /></span>
      {site && <i>{site}</i>}
      {duration && <em>{duration}</em>}
    </span>
  );
}

/* ===========================================================================
   Books: one search across Apple Books and Open Library
   =========================================================================== */

function Cover({ book }: { book: BookHit }) {
  return (
    <span className={f.cover} style={{ ["--c" as string]: toneFor(book.title) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {book.cover ? <img src={book.cover} alt="" loading="lazy" /> : <b>{book.title.slice(0, 1)}</b>}
    </span>
  );
}

/**
 * Type a title or an author, or paste an ISBN or a link to the book (Apple
 * Books, Open Library, Goodreads, Amazon…). An ISBN or a link picks its book
 * straight away; otherwise tap the one you mean. Once one is picked the list
 * steps aside for it, with whatever goes under it (the shelf to put it on).
 */
export function BookSearch({ picked, onPick, onManual, autoFocus, children }: {
  picked: BookHit | null;
  onPick: (b: BookHit | null) => void;
  onManual: () => void;
  autoFocus?: boolean;
  /** Shown under the picked book. */
  children?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; results: BookHit[] | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [tries, setTries] = useState(0);
  const pick = useRef(onPick);
  useEffect(() => { pick.current = onPick; });
  const query = q.trim();

  useEffect(() => {
    if (query.length < 2) return;
    let live = true;
    const exact = isIsbnQuery(query) || /^(https?:\/\/|www\.)/i.test(query);
    const timer = setTimeout(() => {
      setLoading(true);
      void findBooks(query).then((results) => {
        if (!live) return;
        setLoading(false);
        setFound({ q: query, results });
        // An ISBN or a link to a book means that book.
        if (exact && results?.length) pick.current(results[0]);
      });
    }, exact ? 0 : 320);
    return () => { live = false; clearTimeout(timer); };
  }, [query, tries]);

  const results = query.length >= 2 ? found?.results : null;
  const yourself = <button type="button" className={f.inlineLink} onClick={onManual}>add it yourself</button>;
  const row = (b: BookHit) => {
    const on = picked?.key === b.key;
    return (
      <button key={b.key} type="button" role="option" aria-selected={on} className={`${f.bookRow} ${on ? f.bookOn : ""}`} onClick={() => onPick(on ? null : b)}>
        <Cover book={b} />
        <span className={f.bookText}>
          <b>{b.title}</b>
          <small>{[b.author, b.year].filter(Boolean).join(" · ") || "Unknown author"}</small>
          <em>{b.sources.map((s) => SOURCE_LABEL[s]).join(" · ")}</em>
        </span>
        <span className={`${f.check} ${on ? f.checkOn : ""}`} aria-hidden="true">{on && <IconCheck size={12} />}</span>
      </button>
    );
  };
  return (
    <div className={f.books}>
      <PasteField
        value={q}
        onChange={(v) => {
          setQ(v);
          if (picked) onPick(null);
          if (v.trim().length < 2) { setLoading(false); setFound(null); }
        }}
        type="search"
        icon={<IconSearch size={18} />}
        label="Find a book"
        placeholder="Title, author or ISBN"
        autoFocus={autoFocus}
      />
      {picked ? (
        <>
          <div className={f.bookList} role="listbox" aria-label="The book you picked">{row(picked)}</div>
          {children}
          <button type="button" className={f.manual} onClick={() => onPick(null)}>Choose a different book</button>
        </>
      ) : (
        <>
          {query.length < 2 ? (
            <p className={f.note}>Searches Apple Books and Open Library. You can also paste an ISBN, or a link to the book from any shop.</p>
          ) : found && found.results === null && !loading ? (
            <RetryLine onRetry={() => { setFound(null); setTries((n) => n + 1); }}>The book catalogues didn’t answer. Try again, or {yourself}.</RetryLine>
          ) : found && results && !results.length && !loading ? (
            <p className={f.note}>Nothing found for “{found.q}”. Try the author’s name, or {yourself}.</p>
          ) : loading && !results?.length ? <BookSkeleton /> : null}
          {results && results.length > 0 && (
            <div className={f.bookList} role="listbox" aria-label="Books found">{results.slice(0, 8).map(row)}</div>
          )}
          {results && results.length > 0 && <button type="button" className={f.manual} onClick={onManual}>Not here? Add it yourself</button>}
        </>
      )}
    </div>
  );
}

/* ===========================================================================
   An amount, and the currency it's in
   =========================================================================== */

/**
 * The amount, with its currency in front (flag, code, chevron). Tapping the
 * currency opens a list to search: the ones receipts know first, then every
 * other currency.
 */
export function AmountField({ value, currency, onChange, onCurrency, onEnter, autoFocus }: {
  value: string;
  currency: string;
  onChange: (v: string) => void;
  onCurrency: (code: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const all = useMemo(() => allCurrencies(), []);
  // Read when the list opens, so a currency just picked is there next time.
  const recent = useMemo(() => (open ? recentCurrencies() : []), [open]);
  const query = q.trim().toLowerCase();
  // Recent first (once there is one), then the common ones, then everything else; a search looks through them all.
  const groups = query
    ? [{ label: "", list: all.filter((c) => currencyMatches(c, query)) }]
    : [
      { label: "Recent", list: recent },
      { label: "Common", list: CURRENCIES.filter((c) => !recent.includes(c)) },
      { label: "All", list: all.filter((c) => !recent.includes(c) && !CURRENCIES.includes(c)) },
    ].filter((g) => g.list.length);
  const shown = groups.flatMap((g) => g.list);
  const pick = (code: string) => { onCurrency(code); setOpen(false); setQ(""); };
  return (
    <div className={f.fieldWrap}>
      <div className={f.field}>
        <button type="button" className={f.currency} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Currency: ${currencyName(currency)}`}>
          <Emoji char={currencyFlag(currency)} />
          <b>{currency}</b>
          <IconChevronDown size={14} />
        </button>
        <input
          className={f.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }}
          inputMode="decimal"
          placeholder="Amount"
          aria-label="Amount"
          data-autofocus={autoFocus || undefined}
        />
      </div>
      {open && (
        <div className={f.currencies}>
          <label className={f.currencySearch}>
            <IconSearch size={16} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && shown.length) pick(shown[0]); }}
              placeholder="Search code, name, country"
              aria-label="Search currencies"
            />
          </label>
          <div className={f.currencyList} role="listbox" aria-label="Currencies">
            {groups.map((g) => (
              <Fragment key={g.label}>
                {g.label && <p className={f.currencyHead}>{g.label}</p>}
                {g.list.map((c) => (
                  <button key={c} type="button" role="option" aria-selected={c === currency} onClick={() => pick(c)}>
                    <Emoji char={currencyFlag(c)} />
                    <span><b>{currencyName(c)}</b><small>{c}</small></span>
                    {c === currency && <IconCheck size={14} />}
                  </button>
                ))}
              </Fragment>
            ))}
            {!shown.length && <p className={f.note}>No currency matches “{q.trim()}”.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
