"use client";

import { useEffect, useRef, useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { billShares, money, unclaimedItems } from "@/lib/chat/ops";
import {
  centsToInput, CURRENCIES, downscaleImage, parseMoney, SAMPLE_ADDRESS, SAMPLE_RECEIPT, type ReceiptResult,
} from "@/lib/chat/receipt";
import { useChat, userById } from "@/lib/chat/store";
import type { BillCard, BillItem, Card, Message, User } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { ConfirmPay } from "./CardBuilders";
import {
  IconAlert, IconBack, IconCamera, IconCheck, IconChevron, IconChevronDown, IconClose, IconEdit, IconImage, IconPlus,
  IconReceipt, IconScan,
} from "./Icons";
import { Sheet, uid, useChatUi } from "./ui";
import styles from "./chat.module.css";
import s from "./bill.module.css";

type Send = (card: Card, summary: string) => void;

/* ---------------------------------------------------------------------------
   The draft: what's typed stays as typed (so "12," can become "12,50"), and
   only turns into cents when the bill is built.
--------------------------------------------------------------------------- */

interface DraftItem { id: string; name: string; qty: string; total: string }
interface Draft {
  merchant: string;
  currency: string;
  items: DraftItem[];
  tax: string;
  tip: string;
  /** The total printed on the receipt, cents, while it still needs checking against the lines. */
  printed: number | null;
  unreadable: string[];
}

type Step = "start" | "scan" | "review" | "split";
type Scan =
  | { phase: "reading"; sample: boolean }
  | { phase: "failed"; notSetUp: boolean; message: string };

const blankItem = (): DraftItem => ({ id: uid(), name: "", qty: "1", total: "" });
const blankDraft = (): Draft => ({ merchant: "", currency: "EUR", items: [blankItem()], tax: "", tip: "", printed: null, unreadable: [] });

function fromReceipt(r: ReceiptResult): Draft {
  return {
    merchant: r.merchant,
    currency: CURRENCIES.includes(r.currency) ? r.currency : "EUR",
    items: r.items.map((it) => ({ id: uid(), name: it.name, qty: String(it.quantity), total: centsToInput(it.total) })),
    tax: r.tax ? centsToInput(r.tax) : "",
    tip: r.tip ? centsToInput(r.tip) : "",
    printed: r.total,
    unreadable: r.unreadable,
  };
}

const cents = (v: string) => parseMoney(v) ?? 0;
const quantity = (v: string) => Math.max(1, Math.round(Number(v.replace(",", "."))) || 1);
/** A row with a name but no price (or the other way round) can't go on the bill yet. */
const halfFilled = (it: DraftItem) => !!it.name.trim() !== cents(it.total) > 0;

function draftItems(d: Draft): BillItem[] {
  return d.items
    .map((it) => ({ id: it.id, name: it.name.trim(), quantity: quantity(it.qty), total: cents(it.total) }))
    .filter((it) => it.name && it.total > 0);
}

function buildCard(d: Draft, claims: Record<string, string[]>, me: string): BillCard {
  const items = draftItems(d);
  const tax = cents(d.tax);
  const tip = cents(d.tip);
  return {
    type: "bill",
    merchant: d.merchant.trim(),
    currency: d.currency,
    items,
    tax,
    tip,
    total: items.reduce((n, it) => n + it.total, 0) + tax + tip,
    paidBy: me,
    claims: Object.fromEntries(items.filter((it) => claims[it.id]?.length).map((it) => [it.id, claims[it.id]])),
    paid: [me],
  };
}

/** Keeps typing loose but numeric: digits and one kind of separator. */
const moneyTyping = (v: string) => v.replace(/[^\d.,]/g, "").slice(0, 10);

/* ---------------------------------------------------------------------------
   Split a bill: photo → check what was read → who had what → send
--------------------------------------------------------------------------- */

export function BillFlow({ onSend, onClose }: { onSend: Send; onClose: () => void }) {
  const { me } = useChat();
  const ui = useChatUi();
  const [step, setStep] = useState<Step>("start");
  const [scan, setScan] = useState<Scan>({ phase: "reading", sample: false });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [claims, setClaims] = useState<Record<string, string[]>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const sampleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoUrl = useRef<string | null>(null);
  const focusRow = useRef<string | null>(null);

  // Nothing keeps running once the sheet is gone: no request, no timer, no photo in memory.
  const stopReading = () => {
    request.current?.abort();
    request.current = null;
    if (sampleTimer.current) clearTimeout(sampleTimer.current);
    sampleTimer.current = null;
  };
  useEffect(() => () => {
    request.current?.abort();
    if (sampleTimer.current) clearTimeout(sampleTimer.current);
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
  }, []);

  // Each step starts at its top.
  useEffect(() => {
    rootRef.current?.parentElement?.scrollTo({ top: 0 });
  }, [step]);

  const people: User[] = [userById(me), ...ui.members.filter((u) => u.id !== me)];
  const nameOf = (id: string) => (id === me ? "You" : userById(id).name);

  const keepPhoto = (blob: Blob | null) => {
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = blob ? URL.createObjectURL(blob) : null;
    setPhoto(photoUrl.current);
    setPhotoOpen(false);
  };

  const readPhoto = async (file: File) => {
    stopReading();
    setStep("scan");
    setScan({ phase: "reading", sample: false });
    let blob: Blob;
    try {
      blob = await downscaleImage(file);
    } catch {
      keepPhoto(null);
      setScan({ phase: "failed", notSetUp: false, message: "That photo couldn’t be opened. Try a JPEG or PNG." });
      return;
    }
    keepPhoto(blob);
    const ctl = new AbortController();
    request.current = ctl;
    try {
      const body = new FormData();
      body.append("image", blob, "receipt.jpg");
      const res = await fetch("/api/receipt", { method: "POST", body, signal: ctl.signal });
      const json = await res.json().catch(() => null);
      if (ctl.signal.aborted) return;
      if (res.status === 501) {
        setScan({ phase: "failed", notSetUp: true, message: "Receipt reading isn’t set up on this server yet" });
        return;
      }
      if (!res.ok || !json?.items) {
        setScan({ phase: "failed", notSetUp: false, message: json?.message ?? "That receipt couldn’t be read." });
        return;
      }
      setDraft(fromReceipt(json as ReceiptResult));
      setClaims({});
      setStep("review");
    } catch {
      if (ctl.signal.aborted) return;
      setScan({ phase: "failed", notSetUp: false, message: "Couldn’t reach the receipt reader." });
    } finally {
      if (request.current === ctl) request.current = null;
    }
  };

  const pickPhoto = async (from: "camera" | "photos") => {
    if (!(await ui.ask(from))) {
      ui.toast(from === "camera" ? "Camera access is off" : "Photo access is off");
      return;
    }
    (from === "camera" ? cameraRef : libraryRef).current?.click();
  };

  const trySample = () => {
    stopReading();
    keepPhoto(null);
    setStep("scan");
    setScan({ phase: "reading", sample: true });
    sampleTimer.current = setTimeout(() => {
      sampleTimer.current = null;
      setDraft(fromReceipt(SAMPLE_RECEIPT));
      setClaims({});
      setStep("review");
    }, 1600);
  };

  const enterManually = () => {
    stopReading();
    // Typing after a failed scan keeps the photo beside the fields as a reference.
    setDraft((d) => d ?? blankDraft());
    setStep("review");
  };

  const back = () => {
    stopReading();
    setStep(step === "split" ? "review" : "start");
  };

  const edit = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const editItem = (id: string, patch: Partial<DraftItem>) =>
    setDraft((d) => (d ? { ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) } : d));
  const addItem = () => {
    const item = blankItem();
    focusRow.current = item.id;
    setDraft((d) => (d ? { ...d, items: [...d.items, item] } : d));
  };
  const removeItem = (id: string) =>
    setDraft((d) => (d ? { ...d, items: d.items.length > 1 ? d.items.filter((it) => it.id !== id) : [blankItem()] } : d));

  const items = draft ? draftItems(draft) : [];
  const subtotal = items.reduce((n, it) => n + it.total, 0);
  const tax = draft ? cents(draft.tax) : 0;
  const tip = draft ? cents(draft.tip) : 0;
  const total = subtotal + tax + tip;
  const currency = draft?.currency ?? "EUR";
  const fmt = (c: number) => money(c, currency);
  const zero = centsToInput(0);
  const half = draft?.items.find(halfFilled);
  const reviewOk = !!draft?.merchant.trim() && items.length > 0 && !half;
  const mismatch = draft?.printed != null && draft.printed !== total ? draft.printed : null;

  /**
   * Keeping the printed total moves the difference into the tip (or, when the
   * tip can't absorb it, the tax), so every line stays as read.
   */
  const printedPlan = (printed: number) => {
    const newTip = printed - subtotal - tax;
    if (newTip >= 0) return { tax, tip: newTip, note: newTip === tip ? "" : `Tip becomes ${fmt(newTip)}` };
    if (printed - subtotal >= 0) return { tax: printed - subtotal, tip: 0, note: `Tax becomes ${fmt(printed - subtotal)}, no tip` };
    return null;
  };
  const keepPrinted = (printed: number) => {
    const plan = printedPlan(printed);
    if (plan) edit({ tax: plan.tax ? centsToInput(plan.tax) : "", tip: plan.tip ? centsToInput(plan.tip) : "", printed: null });
  };

  const card = draft ? buildCard(draft, claims, me) : null;
  const shares = card ? billShares(card) : {};
  const unclaimed = card ? unclaimedItems(card) : [];
  const everyoneOnAll = items.length > 0 && items.every((it) => people.every((p) => claims[it.id]?.includes(p.id)));

  const toggleClaim = (itemId: string, userId: string) => setClaims((c) => {
    const had = c[itemId] ?? [];
    return { ...c, [itemId]: had.includes(userId) ? had.filter((x) => x !== userId) : [...had, userId] };
  });
  const splitEvenly = () => setClaims(everyoneOnAll ? {} : Object.fromEntries(items.map((it) => [it.id, people.map((p) => p.id)])));

  const send = () => {
    if (!card) return;
    onSend(card, `Bill: ${card.merchant} · ${money(card.total, card.currency)}`);
  };

  const titles: Record<Step, string> = { start: "Split a bill", scan: "Reading receipt", review: "Check the receipt", split: "Who had what" };
  const stepNo = step === "split" ? 3 : step === "review" ? 2 : 1;

  return (
    <Sheet
      title={titles[step]}
      onClose={onClose}
      onClosing={stopReading}
      action={step === "split" ? { label: "Send", disabled: !card, onClick: send } : undefined}
    >
      {(close) => (
        <div ref={rootRef} className={s.flow}>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readPhoto(f); }} />
          <input ref={libraryRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readPhoto(f); }} />

          {step !== "start" && (
            <div className={s.stepBar}>
              <button onClick={back}><IconBack size={18} /> Back</button>
              <span aria-label={`Step ${stepNo} of 3`}>
                {[1, 2, 3].map((n) => <i key={n} className={n <= stepNo ? s.stepOn : undefined} />)}
              </span>
            </div>
          )}

          {step === "start" && (
            <>
              <div className={s.hero}>
                <span className={s.heroIcon} aria-hidden="true"><IconReceipt size={26} /></span>
                <b>Snap the receipt, split it fairly</b>
                <p>NOD reads the lines. Everyone taps what they had, and tax and tip follow each share.</p>
              </div>
              <div className={s.options}>
                {draft && (
                  <button onClick={() => setStep("review")}>
                    <span className={s.optionIcon}><IconEdit size={20} /></span>
                    <span><b>Continue editing</b><small>{draft.merchant.trim() || "Your bill"}{items.length ? ` · ${fmt(total)}` : ""}</small></span>
                    <IconChevron size={16} />
                  </button>
                )}
                <button onClick={() => pickPhoto("camera")}>
                  <span className={s.optionIcon}><IconCamera size={20} /></span>
                  <span><b>Take a photo</b><small>Lay the receipt flat, in good light</small></span>
                  <IconChevron size={16} />
                </button>
                <button onClick={() => pickPhoto("photos")}>
                  <span className={s.optionIcon}><IconImage size={20} /></span>
                  <span><b>Choose a photo</b><small>A receipt you already snapped</small></span>
                  <IconChevron size={16} />
                </button>
                <button onClick={trySample}>
                  <span className={s.optionIcon}><IconScan size={20} /></span>
                  <span><b>Try a sample receipt</b><small>A team lunch at Konjō Ramen</small></span>
                  <IconChevron size={16} />
                </button>
                <button onClick={() => { keepPhoto(null); setDraft(blankDraft()); setClaims({}); setStep("review"); }}>
                  <span className={s.optionIcon}><IconPlus size={20} /></span>
                  <span><b>Enter it yourself</b><small>Type the items and prices</small></span>
                  <IconChevron size={16} />
                </button>
              </div>
            </>
          )}

          {step === "scan" && (
            <>
              <div className={`${s.scanFrame} ${scan.phase === "failed" ? s.scanStopped : ""}`}>
                {scan.phase === "reading" && scan.sample ? (
                  <SamplePaper />
                ) : photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local object URL, never optimisable
                  <img src={photo} alt="Your receipt" className={s.scanPhoto} />
                ) : (
                  <div className={s.scanBlank} aria-hidden="true"><IconReceipt size={32} /></div>
                )}
                {scan.phase === "reading" && <span className={s.sweep} aria-hidden="true" />}
              </div>
              {scan.phase === "reading" ? (
                <p className={s.scanStatus} role="status">Reading receipt…</p>
              ) : (
                <div className={s.scanFail} role="alert">
                  <span className={s.failIcon} aria-hidden="true"><IconAlert size={20} /></span>
                  <b>{scan.message}</b>
                  <p>{scan.notSetUp ? "You can type it in instead, with the photo beside you, or try the sample." : "Try another photo, or type it in instead."}</p>
                  <button className={styles.primaryWide} onClick={enterManually}>Enter it yourself</button>
                  {scan.notSetUp
                    ? <button className={styles.secondaryWide} onClick={trySample}>Use the sample receipt</button>
                    : <button className={styles.secondaryWide} onClick={() => setStep("start")}>Try another photo</button>}
                </div>
              )}
            </>
          )}

          {step === "review" && draft && (
            <>
              {photo && (
                <button className={`${s.photoRef} ${photoOpen ? s.photoRefOpen : ""}`} onClick={() => setPhotoOpen((v) => !v)} aria-expanded={photoOpen} aria-label={photoOpen ? "Shrink receipt photo" : "Enlarge receipt photo"}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, never optimisable */}
                  <img src={photo} alt="" />
                  <span>{photoOpen ? "Tap to shrink" : "Your photo · tap to enlarge"}</span>
                </button>
              )}
              {draft.unreadable.length > 0 && (
                <p className={s.note}><IconAlert size={14} /> Couldn’t read: {draft.unreadable.join(", ")}. Add them below if they belong on the bill.</p>
              )}
              <div className={s.headFields}>
                <input
                  className={styles.plainInput}
                  placeholder="Where was it?"
                  aria-label="Merchant"
                  data-autofocus={draft.merchant ? undefined : true}
                  value={draft.merchant}
                  onChange={(e) => edit({ merchant: e.target.value })}
                />
                <label className={s.currency}>
                  <span className={s.srOnly}>Currency</span>
                  <select value={draft.currency} onChange={(e) => edit({ currency: e.target.value })}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <IconChevronDown size={14} />
                </label>
              </div>

              <p className={styles.sheetLabel}>Items</p>
              <div className={s.itemRows} role="list">
                <div className={s.itemHead} aria-hidden="true"><span>Item</span><span>Qty</span><span>Total</span><span /></div>
                {draft.items.map((it, i) => (
                  <div key={it.id} className={`${s.itemRow} ${halfFilled(it) ? s.itemHalf : ""}`} role="listitem">
                    <input
                      ref={(el) => { if (el && focusRow.current === it.id) { focusRow.current = null; el.focus(); } }}
                      placeholder={`Item ${i + 1}`}
                      aria-label={`Item ${i + 1} name`}
                      value={it.name}
                      onChange={(e) => editItem(it.id, { name: e.target.value })}
                    />
                    <input
                      className={s.itemQty}
                      inputMode="numeric"
                      aria-label={`Item ${i + 1} quantity`}
                      value={it.qty}
                      onChange={(e) => editItem(it.id, { qty: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                      onBlur={() => editItem(it.id, { qty: String(quantity(it.qty)) })}
                    />
                    <input
                      className={s.itemTotal}
                      inputMode="decimal"
                      placeholder={zero}
                      aria-label={`Item ${i + 1} total`}
                      aria-invalid={halfFilled(it) || undefined}
                      value={it.total}
                      onChange={(e) => editItem(it.id, { total: moneyTyping(e.target.value) })}
                      onBlur={() => { const c = parseMoney(it.total); if (c !== null) editItem(it.id, { total: centsToInput(c) }); }}
                      onKeyDown={(e) => { if (e.key === "Enter" && i === draft.items.length - 1) addItem(); }}
                    />
                    <button className={s.removeBtn} onClick={() => removeItem(it.id)} aria-label={`Remove ${it.name.trim() || `item ${i + 1}`}`}>
                      <IconClose size={14} />
                    </button>
                  </div>
                ))}
                <button className={styles.addRow} onClick={addItem}><IconPlus size={16} /> Add item</button>
              </div>

              <div className={s.extras}>
                {(["tax", "tip"] as const).map((k) => (
                  <label key={k} className={s.extraRow}>
                    <span>{k === "tax" ? "Tax" : "Tip"}<small>{k === "tax" ? "If it’s added on top" : "Shared like the tax"}</small></span>
                    <input
                      inputMode="decimal"
                      placeholder={zero}
                      value={draft[k]}
                      onChange={(e) => edit({ [k]: moneyTyping(e.target.value) })}
                      onBlur={() => { const c = parseMoney(draft[k]); edit({ [k]: c ? centsToInput(c) : "" }); }}
                    />
                  </label>
                ))}
              </div>

              <div className={s.totals}>
                <div><span>Items</span><span>{fmt(subtotal)}</span></div>
                {(tax > 0 || tip > 0) && <div><span>Tax and tip</span><span>{fmt(tax + tip)}</span></div>}
                <div className={s.grand}><span>Total</span><span>{fmt(total)}</span></div>
              </div>

              {mismatch !== null && (
                <div className={s.mismatch} role="status">
                  <p><IconAlert size={16} /><span>The receipt says <b>{fmt(mismatch)}</b>, but the lines add up to <b>{fmt(total)}</b>.</span></p>
                  <div>
                    <button onClick={() => keepPrinted(mismatch)} disabled={!printedPlan(mismatch)}>
                      Keep {fmt(mismatch)}<small>{printedPlan(mismatch)?.note ?? "The items alone come to more"}</small>
                    </button>
                    <button onClick={() => edit({ printed: null })}>
                      Keep {fmt(total)}<small>As the lines add up</small>
                    </button>
                  </div>
                </div>
              )}

              <div className={s.dock}>
                <button className={styles.primaryWide} disabled={!reviewOk} onClick={() => setStep("split")}>
                  Continue
                  {!reviewOk && (
                    <small>
                      {!draft.merchant.trim() ? "Add where it was" : half ? `Add ${half.name.trim() ? `a price for “${half.name.trim()}”` : "a name for that price"}` : "Add at least one item"}
                    </small>
                  )}
                </button>
              </div>
            </>
          )}

          {step === "split" && draft && card && (
            <>
              <div className={s.splitHead}>
                <p className={styles.sheetLabel}>Tap who had each item</p>
                <button className={styles.cardLink} onClick={splitEvenly}>{everyoneOnAll ? "Clear all" : "Split everything evenly"}</button>
              </div>
              <ul className={s.claimList}>
                {card.items.map((it) => {
                  const who = claims[it.id] ?? [];
                  return (
                    <li key={it.id} className={s.claimItem}>
                      <div className={s.claimHead}>
                        <span>{it.quantity > 1 && <em>{it.quantity}×</em>}{it.name}</span>
                        <span>{fmt(it.total)}{who.length > 1 && <small>{fmt(Math.round(it.total / who.length))} each</small>}</span>
                      </div>
                      <div className={s.claimPeople}>
                        {people.map((p) => {
                          const on = who.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              className={on ? s.claimOn : undefined}
                              aria-pressed={on}
                              aria-label={`${nameOf(p.id)} had ${it.name}`}
                              onClick={() => toggleClaim(it.id, p.id)}
                            >
                              <Avatar glyph={initials(p.fullName)} tone={p.tone} photo={p.photo} size={34} shape="circle" />
                              {on && <i className={s.claimTick}><IconCheck size={9} /></i>}
                              <span>{nameOf(p.id)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <p className={styles.sheetLabel}>Each person</p>
              <ul className={s.shareList}>
                {people.map((p) => (
                  <li key={p.id}>
                    <Avatar glyph={initials(p.fullName)} tone={p.tone} photo={p.photo} size={26} shape="circle" />
                    <span className={s.shareName}>{nameOf(p.id)}{p.id === me && <small>Paid the bill</small>}</span>
                    <b className={shares[p.id] ? undefined : s.nil}>{shares[p.id] ? fmt(shares[p.id]) : "—"}</b>
                  </li>
                ))}
              </ul>
              {unclaimed.length > 0 && (
                <p className={styles.sheetNote}>
                  {unclaimed.length === 1 ? "1 item isn’t" : `${unclaimed.length} items aren’t`} claimed yet ({fmt(unclaimed.reduce((n, it) => n + it.total, 0))}). People can claim them in the chat.
                </p>
              )}

              <div className={s.dock}>
                <button className={styles.primaryWide} onClick={() => close(send)}>
                  Send bill · {fmt(card.total)}
                  <small>You paid · everyone settles up with you</small>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** The sample, printed: what the reader "sees" while it pretends to read. */
function SamplePaper() {
  const r = SAMPLE_RECEIPT;
  const fmt = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  return (
    <div className={s.paper} aria-hidden="true">
      <b>{r.merchant.toUpperCase()}</b>
      <small>{SAMPLE_ADDRESS}</small>
      <hr />
      {r.items.map((it) => (
        <p key={it.name}><span>{it.quantity} × {it.name}</span><span>{fmt(it.total)}</span></p>
      ))}
      <hr />
      <p><span>MwSt 10%</span><span>{fmt(r.tax)}</span></p>
      <p><span>Trinkgeld</span><span>{fmt(r.tip)}</span></p>
      <p className={s.paperTotal}><span>SUMME EUR</span><span>{fmt(r.total ?? 0)}</span></p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The bill in the thread: each share, claim what you had, pay or settle
--------------------------------------------------------------------------- */

export function BillCardView({ message, card, interactive }: { message: Message; card: BillCard; interactive: boolean }) {
  const { me, cardOp } = useChat();
  const ui = useChatUi();
  const [open, setOpen] = useState(false);
  const shares = billShares(card);
  const payer = userById(card.paidBy);
  const unclaimed = unclaimedItems(card);
  const owes = (id: string) => id !== card.paidBy && (shares[id] ?? 0) > 0 && !card.paid.includes(id);
  // Whoever paid, then you, then everyone else in the order they joined in.
  const rank = (id: string) => (id === card.paidBy ? 0 : id === me ? 1 : 2);
  const people = Object.keys(shares).sort((a, b) => rank(a) - rank(b));
  const owing = people.filter(owes);
  const settled = owing.length === 0 && unclaimed.length === 0;
  const fmt = (c: number) => money(c, card.currency);
  const nameOf = (id: string) => (id === me ? "You" : userById(id).name);
  const isPayer = card.paidBy === me;
  // Once your share is paid, what you had is settled too.
  const canClaim = interactive && (isPayer || !card.paid.includes(me));
  const listId = `bill-items-${message.id}`;

  const pay = () => {
    const amount = fmt(shares[me] ?? 0);
    let cancelled = false;
    ui.openSheet(
      <Sheet title="Pay your share" onClose={ui.closeSheet} onClosing={() => { cancelled = true; }}>
        <div className={styles.accessSheet}>
          <b className={styles.payAmount}>{amount}</b>
          <p>To {payer.fullName} · {card.merchant}</p>
          <ConfirmPay amount={amount} onDone={() => {
            if (cancelled) return;
            cardOp(message, { kind: "bill.pay", userId: me });
            ui.closeSheet();
            ui.toast(`Paid ${amount} to ${payer.name}`);
          }} />
          <p className={styles.demoNote}>Demo payments — no real money moves.</p>
        </div>
      </Sheet>,
    );
  };

  const settle = (id: string) => {
    cardOp(message, { kind: "bill.pay", userId: id });
    ui.toast(`${userById(id).name} is settled up`);
  };

  return (
    <div className={`${styles.card} ${s.bill} ${settled ? s.billSettled : ""}`}>
      <p className={styles.cardKicker}>
        <span><IconReceipt size={14} /> Bill</span>
        <span>{card.merchant}</span>
        {settled && <span className={s.settledTag}><IconCheck size={11} /> Settled</span>}
      </p>
      <b className={`${styles.payAmount} ${s.billTotal}`}>{fmt(card.total)}</b>
      <p className={styles.cardSub}>{isPayer ? "You paid" : `${payer.name} paid`}</p>

      {people.length > 0 && (
        <ul className={s.people}>
          {people.map((id) => {
            const u = userById(id);
            const due = owes(id);
            return (
              <li key={id}>
                <Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={24} shape="circle" />
                {due && id === me && interactive ? (<>
                  <span className={s.personName}>{nameOf(id)}</span>
                  <button className={s.payBtn} onClick={pay}>Pay {fmt(shares[id])}</button>
                </>) : due && isPayer && interactive ? (<>
                  {/* The share moves under the name so the button fits beside it. */}
                  <span className={s.personName}>{nameOf(id)}<small>Owes {fmt(shares[id])}</small></span>
                  <button className={s.settleBtn} onClick={() => settle(id)} aria-label={`Mark ${u.name} as settled`}>Mark settled</button>
                </>) : (<>
                  <span className={s.personName}>{nameOf(id)}</span>
                  <span className={s.personShare}>{fmt(shares[id])}</span>
                  <em className={due ? s.tagOwes : s.tagPaid}>{due ? "Owes" : "Paid"}</em>
                </>)}
              </li>
            );
          })}
        </ul>
      )}

      <button className={s.itemsToggle} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={listId}>
        <span>Items ({card.items.length})</span>
        {unclaimed.length > 0 && <em className={s.unclaimedTag}>{unclaimed.length} unclaimed</em>}
        <span className={`${s.chev} ${open ? s.chevOpen : ""}`}><IconChevronDown size={14} /></span>
      </button>
      {open && (
        <ul id={listId} className={s.itemList}>
          {card.items.map((it) => {
            const who = card.claims[it.id] ?? [];
            const mine = who.includes(me);
            const body = (
              <>
                <span className={s.itemText}>
                  <span>{it.quantity > 1 && <em>{it.quantity}×</em>}{it.name}</span>
                  <small>
                    {who.length ? (
                      <><Faces ids={who} />{who.length > 1 ? `Split ${who.length} ways` : nameOf(who[0])}</>
                    ) : <em className={s.unclaimedTag}>Unclaimed</em>}
                  </small>
                </span>
                <span className={s.itemPrice}>{fmt(it.total)}</span>
                {canClaim && <span className={`${s.itemCheck} ${mine ? s.itemCheckOn : ""}`} aria-hidden="true">{mine && <IconCheck size={11} />}</span>}
              </>
            );
            return (
              <li key={it.id}>
                {canClaim ? (
                  <button
                    className={s.item}
                    role="checkbox"
                    aria-checked={mine}
                    aria-label={`I had ${it.name}, ${fmt(it.total)}`}
                    onClick={() => cardOp(message, { kind: "bill.claim", itemId: it.id, userId: me, on: !mine })}
                  >
                    {body}
                  </button>
                ) : <div className={s.item}>{body}</div>}
              </li>
            );
          })}
          {(card.tax > 0 || card.tip > 0) && (
            <li className={s.extrasLine}>
              {[card.tax > 0 && `Tax ${fmt(card.tax)}`, card.tip > 0 && `Tip ${fmt(card.tip)}`].filter(Boolean).join(" · ")}
              <span>shared by what each person had</span>
            </li>
          )}
        </ul>
      )}

      <div className={styles.cardFoot}>
        {settled ? (
          <span>Everyone’s settled up with {isPayer ? "you" : payer.name}</span>
        ) : unclaimed.length > 0 && canClaim && !open ? (
          <>
            <span>{owing.length ? `${owing.length} still to pay` : "Waiting for claims"}</span>
            <button className={styles.cardLink} onClick={() => setOpen(true)}>Claim what you had</button>
          </>
        ) : (
          <span>{owing.length ? `${owing.length} still to pay` : `${unclaimed.length} unclaimed`}</span>
        )}
      </div>
    </div>
  );
}

function Faces({ ids }: { ids: string[] }) {
  return (
    <span className={styles.faces}>
      {ids.slice(0, 3).map((id) => {
        const u = userById(id);
        return <Avatar key={id} glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={16} shape="circle" />;
      })}
    </span>
  );
}
