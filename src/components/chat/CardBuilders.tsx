"use client";

import { useEffect, useRef, useState } from "react";
import { initials, TONES } from "@/lib/chat/avatar";
import { invoiceTotals, nextInvoiceNumber } from "@/lib/chat/invoice";
import { useChat } from "@/lib/chat/store";
import type { AvatarTone, Card, Invoice, User } from "@/lib/chat/types";
import Avatar from "./Avatar";
import {
  IconAttachment, IconBell, IconCalendar, IconCamera, IconCheck, IconChecklist, IconClose, IconImage, IconLocation,
  IconMoneyReceive, IconMoneySend, IconPlus, IconPoll, IconSmile,
  IconBrush, IconGame, IconSparkles, IconWheel, IconBoard, IconReceipt, IconRoute,
} from "./Icons";
import MiniMap from "./MiniMap";
import { Segmented, Sheet, Toggle, uid } from "./ui";
import styles from "./chat.module.css";
import iv from "./invoice.module.css";

export type AddKind =
  | "photos" | "camera" | "file"
  | "checklist" | "poll" | "reminder" | "location" | "event" | "plan" | "board"
  | "pay" | "request" | "bill"
  | "sketch" | "tictactoe" | "wheel" | "gallery";

type Send = (card: Card, summary: string) => void;

/* ---------------------------------------------------------------------------
   Add to message — the launcher
--------------------------------------------------------------------------- */

/** Artifacts (Doodle, Tic-tac-toe, Wheel) are hidden for now; flip this to bring the group back. */
const SHOW_ARTIFACTS = false;

const ALL_GROUPS: { title: string; tone: AvatarTone; items: { kind: AddKind; label: string; icon: React.ReactNode }[] }[] = [
  {
    title: "Media",
    tone: "denim",
    items: [
      { kind: "photos", label: "Photos", icon: <IconImage size={24} /> },
      { kind: "camera", label: "Camera", icon: <IconCamera size={24} /> },
      { kind: "file", label: "File", icon: <IconAttachment size={24} /> },
    ],
  },
  {
    title: "Together",
    tone: "sage",
    items: [
      { kind: "poll", label: "Poll", icon: <IconPoll size={24} /> },
      { kind: "checklist", label: "Checklist", icon: <IconChecklist size={24} /> },
      { kind: "reminder", label: "Reminder", icon: <IconBell size={24} /> },
      { kind: "location", label: "Location", icon: <IconLocation size={24} /> },
      { kind: "event", label: "Event", icon: <IconCalendar size={24} /> },
      { kind: "plan", label: "Plan", icon: <IconRoute size={24} /> },
      { kind: "board", label: "Board", icon: <IconBoard size={24} /> },
    ],
  },
  {
    title: "Money",
    tone: "graphite",
    items: [
      { kind: "pay", label: "Pay", icon: <IconMoneySend size={24} /> },
      { kind: "request", label: "Request", icon: <IconMoneyReceive size={24} /> },
      { kind: "bill", label: "Split bill", icon: <IconReceipt size={24} /> },
    ],
  },
  {
    title: "Artifacts",
    tone: "plum",
    items: [
      { kind: "sketch", label: "Doodle", icon: <IconBrush size={24} /> },
      { kind: "tictactoe", label: "Tic-tac-toe", icon: <IconGame size={24} /> },
      { kind: "wheel", label: "Wheel", icon: <IconWheel size={24} /> },
      { kind: "gallery", label: "More", icon: <IconSparkles size={24} /> },
    ],
  },
];

const GROUPS = ALL_GROUPS.filter((g) => SHOW_ARTIFACTS || g.title !== "Artifacts");

export function AddSheet({ onPick, onClose }: { onPick: (k: AddKind) => void; onClose: () => void }) {
  return (
    <Sheet title="Add to message" onClose={onClose}>
      {(close) => GROUPS.map((g, gi) => (
        <div key={g.title} className={styles.addGroup}>
          <p className={styles.sheetLabel}>{g.title}</p>
          <div className={styles.addGrid}>
            {g.items.map((it, i) => (
              <button
                key={it.kind}
                className={styles.addTile}
                style={{ ["--i" as string]: gi * 3 + i }}
                onClick={() => close(() => onPick(it.kind))}
              >
                <span className={styles.addIcon} style={{ background: TONES[g.tone] }}>{it.icon}</span>
                {it.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   Poll
--------------------------------------------------------------------------- */

const CLOSES = [
  { id: "1h", label: "1 hour", ms: 3_600_000 },
  { id: "24h", label: "24 hours", ms: 86_400_000 },
  { id: "3d", label: "3 days", ms: 3 * 86_400_000 },
  { id: "1w", label: "1 week", ms: 7 * 86_400_000 },
] as const;

export function PollBuilder({ onSend, onClose }: { onSend: Send; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState([{ id: uid(), label: "" }, { id: uid(), label: "" }]);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [closes, setCloses] = useState<(typeof CLOSES)[number]["id"]>("24h");
  const filled = options.filter((o) => o.label.trim());
  const valid = question.trim() && filled.length >= 2;

  return (
    <Sheet
      title="New poll"
      onClose={onClose}
      action={{
        label: "Send",
        disabled: !valid,
        onClick: () => onSend({
          type: "poll",
          question: question.trim(),
          options: filled.map((o) => ({ id: o.id, label: o.label.trim(), votes: [] })),
          multiple,
          anonymous,
          closesAt: Date.now() + CLOSES.find((c) => c.id === closes)!.ms,
          closedAt: null,
        }, `Poll: ${question.trim()}`),
      }}
    >
      <input className={styles.bigInput} data-autofocus placeholder="Ask a question" value={question} onChange={(e) => setQuestion(e.target.value)} />
      <p className={styles.sheetLabel}>Options</p>
      <div className={styles.fieldStack}>
        {options.map((o, i) => (
          <div key={o.id} className={styles.optionField}>
            <span className={styles.optionDot} />
            <input
              placeholder={`Option ${i + 1}`}
              value={o.label}
              onChange={(e) => setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && options.length < 8) setOptions((prev) => [...prev, { id: uid(), label: "" }]);
              }}
            />
            {options.length > 2 && (
              <button onClick={() => setOptions((prev) => prev.filter((x) => x.id !== o.id))} aria-label="Remove option"><IconClose size={14} /></button>
            )}
          </div>
        ))}
        {options.length < 8 && (
          <button className={styles.addRow} onClick={() => setOptions((prev) => [...prev, { id: uid(), label: "" }])}>
            <IconPlus size={16} /> Add option
          </button>
        )}
      </div>
      <div className={styles.settingRows}>
        <label className={styles.settingRow}>
          <span><b>Multiple choice</b><small>People can pick more than one answer.</small></span>
          <Toggle on={multiple} onChange={setMultiple} label="Multiple choice" />
        </label>
        <label className={styles.settingRow}>
          <span><b>Anonymous votes</b><small>Results show counts, never names.</small></span>
          <Toggle on={anonymous} onChange={setAnonymous} label="Anonymous votes" />
        </label>
        <div className={styles.settingRow}>
          <span><b>Closes in</b><small>You can always end it early.</small></span>
        </div>
        <Segmented value={closes} options={CLOSES.map((c) => ({ id: c.id, label: c.label }))} onChange={setCloses} />
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   Checklist — with the edit-permission model
--------------------------------------------------------------------------- */

export function ChecklistBuilder({ onSend, onClose, ownerName }: { onSend: Send; onClose: () => void; ownerName: string }) {
  const [title, setTitle] = useState("");
  const [items, setItems] = useState([{ id: uid(), label: "" }, { id: uid(), label: "" }]);
  const [everyone, setEveryone] = useState(true);
  const filled = items.filter((i) => i.label.trim());
  return (
    <Sheet
      title="New checklist"
      onClose={onClose}
      action={{
        label: "Send",
        disabled: !title.trim() || !filled.length,
        onClick: () => onSend({
          type: "checklist",
          title: title.trim(),
          items: filled.map((i) => ({ id: i.id, label: i.label.trim(), doneBy: null })),
          everyoneCanEdit: everyone,
          editors: [],
          requests: [],
        }, `Checklist: ${title.trim()}`),
      }}
    >
      <input className={styles.bigInput} data-autofocus placeholder="Checklist title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className={styles.fieldStack}>
        {items.map((it, i) => (
          <div key={it.id} className={styles.optionField}>
            <span className={styles.checkGhost} />
            <input
              placeholder={`Item ${i + 1}`}
              value={it.label}
              onChange={(e) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)))}
              onKeyDown={(e) => { if (e.key === "Enter") setItems((prev) => [...prev, { id: uid(), label: "" }]); }}
            />
            {items.length > 1 && (
              <button onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))} aria-label="Remove item"><IconClose size={14} /></button>
            )}
          </div>
        ))}
        <button className={styles.addRow} onClick={() => setItems((prev) => [...prev, { id: uid(), label: "" }])}>
          <IconPlus size={16} /> Add item
        </button>
      </div>
      <div className={styles.settingRows}>
        <label className={styles.settingRow}>
          <span>
            <b>Allow everyone to edit</b>
            <small>{everyone ? "Anyone in the chat can tick and add items." : `Only ${ownerName} can edit. Others can ask for access.`}</small>
          </span>
          <Toggle on={everyone} onChange={setEveryone} label="Allow everyone to edit" />
        </label>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   Reminder
--------------------------------------------------------------------------- */

const minutesFromNow = (m: number) => Date.now() + m * 60_000;

function tomorrowAt(h: number) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, 0, 0, 0);
  return d.getTime();
}

export function ReminderBuilder({ onSend, onClose, seed }: { onSend: Send; onClose: () => void; seed: string }) {
  const [text, setText] = useState(seed);
  const [who, setWho] = useState<"me" | "everyone">("everyone");
  const [when, setWhen] = useState("1m");
  const WHENS = [
    { id: "1m", label: "In 1 min", at: () => Date.now() + 60_000 },
    { id: "20m", label: "In 20 min", at: () => Date.now() + 20 * 60_000 },
    { id: "1h", label: "In 1 hour", at: () => Date.now() + 3_600_000 },
    { id: "tm", label: "Tomorrow 9:00", at: () => tomorrowAt(9) },
  ];
  return (
    <Sheet
      title="New reminder"
      onClose={onClose}
      action={{
        label: "Set",
        disabled: !text.trim(),
        onClick: () => onSend({
          type: "reminder",
          text: text.trim(),
          at: WHENS.find((w) => w.id === when)!.at(),
          audience: who,
          firedAt: null,
        }, `Reminder: ${text.trim()}`),
      }}
    >
      <input className={styles.bigInput} data-autofocus placeholder="Remind about…" value={text} onChange={(e) => setText(e.target.value)} />
      <p className={styles.sheetLabel}>Who</p>
      <Segmented value={who} options={[{ id: "everyone", label: "Everyone here" }, { id: "me", label: "Only me" }]} onChange={setWho} />
      <p className={styles.sheetLabel}>When</p>
      <div className={styles.chipGrid}>
        {WHENS.map((w) => (
          <button key={w.id} className={`${styles.choice} ${when === w.id ? styles.choiceOn : ""}`} onClick={() => setWhen(w.id)}>
            {w.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   Location — only reachable once permission is settled
--------------------------------------------------------------------------- */

const PLACES = [
  { place: "NOD Studio", address: "Mariahilfer Str. 88, Vienna", x: .52, y: .46 },
  { place: "Konjō Ramen", address: "Kettenbrückengasse 7, Vienna", x: .34, y: .62 },
  { place: "The Mexicano", address: "Neubaugasse 12, Vienna", x: .66, y: .3 },
  { place: "Westbahnhof", address: "Europaplatz 2, Vienna", x: .22, y: .38 },
];

export function LocationBuilder({ onSend, onClose, granted, onEnable }: {
  onSend: Send;
  onClose: () => void;
  granted: boolean;
  onEnable: () => void;
}) {
  const [live, setLive] = useState<"off" | "15" | "60">("off");
  const here = PLACES[0];
  const send = (p: typeof PLACES[number], isLive: boolean, minutes = 0) => onSend({
    type: "location",
    place: isLive ? "Live location" : p.place,
    address: p.address,
    live: isLive,
    until: isLive ? minutesFromNow(minutes) : null,
    x: p.x,
    y: p.y,
  }, isLive ? "Shared live location" : `Location: ${p.place}`);

  return (
    <Sheet title="Location" onClose={onClose}>
      {(close) => (<>
      {granted ? (
        <>
          <div className={styles.mapFrame}><MiniMap x={here.x} y={here.y} live /></div>
          <button className={styles.primaryWide} onClick={() => close(() => send(here, false))}>
            Send current location
            <small>{here.address}</small>
          </button>
          <p className={styles.sheetLabel}>Share live location</p>
          <Segmented value={live} options={[{ id: "off", label: "Off" }, { id: "15", label: "15 min" }, { id: "60", label: "1 hour" }]} onChange={setLive} />
          {live !== "off" && (
            <button className={styles.secondaryWide} onClick={() => close(() => send(here, true, Number(live)))}>
              Start sharing for {live === "15" ? "15 minutes" : "1 hour"}
            </button>
          )}
        </>
      ) : (
        <div className={styles.permissionOff}>
          <span className={styles.accessIcon} aria-hidden="true"><IconLocation size={24} /></span>
          <b>Location access is off</b>
          <p>NOD can’t see where you are. You can still pick a place, or turn location on.</p>
          <button className={styles.secondaryWide} onClick={onEnable}>Turn on location</button>
        </div>
      )}
      <p className={styles.sheetLabel}>Or choose a place</p>
      <div className={styles.placeList}>
        {PLACES.map((p) => (
          <button key={p.place} onClick={() => close(() => send(p, false))}>
            <span className={styles.placePin}><IconLocation size={18} /></span>
            <span><b>{p.place}</b><small>{p.address}</small></span>
          </button>
        ))}
      </div>
      </>)}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   Event
--------------------------------------------------------------------------- */

export function EventBuilder({ onSend, onClose }: { onSend: Send; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const days = [0, 1, 2, 3, 4].map((d) => {
    const date = new Date();
    date.setDate(date.getDate() + d);
    return { id: String(d), label: d === 0 ? "Today" : d === 1 ? "Tomorrow" : date.toLocaleDateString(undefined, { weekday: "short" }), date };
  });
  const times = ["09:00", "12:30", "18:00", "20:00"];
  const [day, setDay] = useState("1");
  const [time, setTime] = useState("12:30");
  const startsAt = () => {
    const d = new Date(days.find((x) => x.id === day)!.date);
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  return (
    <Sheet
      title="New event"
      onClose={onClose}
      action={{
        label: "Send",
        disabled: !title.trim(),
        onClick: () => onSend({ type: "event", title: title.trim(), startsAt: startsAt(), place: place.trim() || "To be decided", rsvps: {} }, `Event: ${title.trim()}`),
      }}
    >
      <input className={styles.bigInput} data-autofocus placeholder="What’s happening?" value={title} onChange={(e) => setTitle(e.target.value)} />
      <p className={styles.sheetLabel}>Day</p>
      <div className={styles.chipGrid}>
        {days.map((d) => (
          <button key={d.id} className={`${styles.choice} ${day === d.id ? styles.choiceOn : ""}`} onClick={() => setDay(d.id)}>{d.label}</button>
        ))}
      </div>
      <p className={styles.sheetLabel}>Time</p>
      <div className={styles.chipGrid}>
        {times.map((t) => (
          <button key={t} className={`${styles.choice} ${time === t ? styles.choiceOn : ""}`} onClick={() => setTime(t)}>{t}</button>
        ))}
      </div>
      <p className={styles.sheetLabel}>Where</p>
      <input className={styles.plainInput} placeholder="Add a place" value={place} onChange={(e) => setPlace(e.target.value)} />
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   Pay / Request — with a confirmation step before any "money" moves.
   A request can carry an invoice: its items set the amount, and it's billed
   to the one person it's sent to.
--------------------------------------------------------------------------- */

type Line = { id: string; description: string; quantity: string; unit: string };
const blankLine = (): Line => ({ id: uid(), description: "", quantity: "1", unit: "" });
const toCents = (v: string) => Math.round((Number(v.replace(",", ".")) || 0) * 100);
const TERMS = [
  { id: "0", label: "On receipt" },
  { id: "7", label: "7 days" },
  { id: "14", label: "14 days" },
  { id: "30", label: "30 days" },
];
const VAT_RATES = [{ id: "0", label: "No VAT" }, { id: "10", label: "10%" }, { id: "20", label: "20%" }];

export function PaymentBuilder({ mode, members, onSend, onClose }: {
  mode: "pay" | "request";
  members: User[];
  onSend: Send;
  onClose: () => void;
}) {
  const { state, me } = useChat();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [who, setWho] = useState<string[]>(members.length === 1 ? [members[0].id] : []);
  const [confirming, setConfirming] = useState(false);
  // Cancel during the Face ID step wins, even in the last moments of the scan.
  const cancelled = useRef(false);

  const [invoicing, setInvoicing] = useState(false);
  const [lines, setLines] = useState<Line[]>(() => [blankLine()]);
  const [vat, setVat] = useState("20");
  const [terms, setTerms] = useState("14");
  const [footnote, setFootnote] = useState("");
  const [number] = useState(() => nextInvoiceNumber(state.data, me));

  const filled = lines
    .filter((l) => l.description.trim() && toCents(l.unit) > 0)
    .map((l) => ({ id: l.id, description: l.description.trim(), quantity: Math.max(1, Number(l.quantity) || 1), unit: toCents(l.unit) }));
  const totals = invoiceTotals({ lines: filled, taxRate: Number(vat) });
  const value = invoicing ? totals.total / 100 : Number(amount.replace(",", "."));
  // An invoice goes to one person; a plain request can go to several.
  const valid = value > 0 && value < (invoicing ? 100_000 : 10_000) && (invoicing ? who.length === 1 && filled.length > 0 : who.length > 0);
  const fmt = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "EUR" });
  const billTo = who.length === 1 ? members.find((m) => m.id === who[0]) : undefined;

  const card = (): Card => {
    const base = { type: "payment" as const, mode: mode === "pay" ? "sent" as const : "request" as const, amount: value, note: note.trim(), from: who, paidBy: [] };
    if (!invoicing) return base;
    const issuedAt = Date.now();
    const invoice: Invoice = {
      number,
      issuedAt,
      dueAt: issuedAt + Number(terms) * 86_400_000,
      lines: filled,
      taxRate: Number(vat),
      note: footnote.trim() || undefined,
    };
    return { ...base, note: base.note || filled[0].description, invoice };
  };
  const toggle = (id: string) => setWho((prev) => (mode === "pay" || invoicing ? [id] : prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const setLine = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const startInvoice = (on: boolean) => {
    setInvoicing(on);
    // Billed to one person: keep the first pick if several were chosen.
    if (on && who.length > 1) setWho([who[0]]);
    // Carry a typed amount into the first item, so nothing's lost.
    if (on && amount && !lines.some((l) => l.unit)) setLines((ls) => [{ ...ls[0], description: ls[0].description || note, unit: amount }, ...ls.slice(1)]);
  };

  return (
    <Sheet
      title={mode === "pay" ? "Pay" : invoicing ? "Send an invoice" : "Request money"}
      onClose={onClose}
      onClosing={() => { cancelled.current = true; }}
      action={mode === "request" ? {
        label: "Send",
        disabled: !valid,
        onClick: () => onSend(card(), invoicing ? `Invoice ${number} · ${fmt(value)}` : `Requested ${fmt(value)}${note.trim() ? ` · ${note.trim()}` : ""}`),
      } : undefined}
      footer={mode === "pay" ? (
        <div className={styles.sheetFooter}>
          {confirming ? (
            <ConfirmPay amount={fmt(value)} onDone={() => {
              if (cancelled.current) return;
              onSend(card(), `Sent ${fmt(value)}${note.trim() ? ` · ${note.trim()}` : ""}`);
              onClose();
            }} />
          ) : (
            <button className={styles.primaryWide} disabled={!valid} onClick={() => setConfirming(true)}>
              {valid ? `Pay ${fmt(value)}` : "Enter an amount"}
            </button>
          )}
        </div>
      ) : undefined}
    >
      {invoicing ? (
        <div className={iv.total} aria-live="polite">
          <b>{fmt(value)}</b>
          <span>{totals.tax ? `Includes ${fmt(totals.tax / 100)} VAT` : "Total"}</span>
        </div>
      ) : (
        <div className={styles.amountRow}>
          <span>€</span>
          <input
            inputMode="decimal"
            data-autofocus
            placeholder="0"
            disabled={confirming}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 7))}
            aria-label="Amount in euros"
          />
        </div>
      )}
      <input className={styles.plainInput} placeholder={invoicing ? "What’s it for? e.g. Website, September" : "What’s it for?"} value={note} disabled={confirming} onChange={(e) => setNote(e.target.value)} />
      <p className={styles.sheetLabel}>{mode === "pay" ? "To" : invoicing ? "Bill to" : "From"}</p>
      <div className={styles.memberPick}>
        {members.map((m) => (
          <button key={m.id} className={who.includes(m.id) ? styles.memberOn : undefined} disabled={confirming} onClick={() => toggle(m.id)}>
            <Avatar glyph={initials(m.fullName)} tone={m.tone} photo={m.photo} size={40} shape="circle" />
            <span>{m.name}</span>
            {who.includes(m.id) && <i className={styles.memberTick}><IconCheck size={10} /></i>}
          </button>
        ))}
      </div>

      {mode === "request" && (
        <div className={iv.switchRow}>
          <span className={iv.switchIcon}><IconReceipt size={18} /></span>
          <span className={iv.switchText}>
            <b>Add an invoice</b>
            <small>{invoicing ? `${number} · ${billTo ? `billed to ${billTo.fullName}` : "pick who it’s for"}` : "Itemised, with VAT and a due date"}</small>
          </span>
          <Toggle on={invoicing} onChange={startInvoice} label="Add an invoice" />
        </div>
      )}

      {invoicing && (
        <div className={iv.builder}>
          <p className={styles.sheetLabel}>Items</p>
          <div className={iv.lines}>
            {lines.map((l, i) => (
              <div key={l.id} className={iv.line}>
                <input
                  className={iv.desc}
                  placeholder={i === 0 ? "e.g. Logo design" : "Item"}
                  value={l.description}
                  onChange={(e) => setLine(l.id, { description: e.target.value })}
                  aria-label={`Item ${i + 1}`}
                />
                <label className={iv.qty}>
                  <input inputMode="numeric" value={l.quantity} onChange={(e) => setLine(l.id, { quantity: e.target.value.replace(/\D/g, "").slice(0, 3) })} aria-label={`Quantity, item ${i + 1}`} />
                  <span aria-hidden="true">×</span>
                </label>
                <label className={iv.price}>
                  <span aria-hidden="true">€</span>
                  <input inputMode="decimal" placeholder="0" value={l.unit} onChange={(e) => setLine(l.id, { unit: e.target.value.replace(/[^0-9.,]/g, "").slice(0, 8) })} aria-label={`Price each, item ${i + 1}`} />
                </label>
                <button className={iv.remove} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== l.id) : [blankLine()]))} aria-label={`Remove item ${i + 1}`}>
                  <IconClose size={14} />
                </button>
              </div>
            ))}
            <button className={iv.addLine} onClick={() => setLines((ls) => [...ls, blankLine()])} disabled={lines.length >= 12}>
              <IconPlus size={14} /> Add an item
            </button>
          </div>
          <p className={styles.sheetLabel}>VAT</p>
          <Segmented value={vat} options={VAT_RATES} onChange={setVat} />
          <p className={styles.sheetLabel}>Due</p>
          <Segmented value={terms} options={TERMS} onChange={setTerms} />
          <textarea
            className={`${styles.plainInput} ${iv.footnote}`}
            rows={2}
            placeholder="Payment details or a thank-you (optional)"
            value={footnote}
            onChange={(e) => setFootnote(e.target.value)}
            aria-label="Note on the invoice"
          />
          <dl className={iv.sums}>
            <div><dt>Subtotal</dt><dd>{fmt(totals.subtotal / 100)}</dd></div>
            {totals.tax > 0 && <div><dt>VAT {vat}%</dt><dd>{fmt(totals.tax / 100)}</dd></div>}
            <div className={iv.sumTotal}><dt>Total</dt><dd>{fmt(totals.total / 100)}</dd></div>
          </dl>
        </div>
      )}
      <p className={styles.demoNote}>Demo payments — no real money moves.</p>
    </Sheet>
  );
}

/** A Face ID-style confirmation: scan ring, then a check. */
export function ConfirmPay({ amount, onDone }: { amount: string; onDone: () => void }) {
  const [phase, setPhase] = useState<"scan" | "ok">("scan");
  useEffect(() => {
    const a = setTimeout(() => setPhase("ok"), 1100);
    const b = setTimeout(onDone, 1900);
    return () => { clearTimeout(a); clearTimeout(b); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={styles.confirmPay} role="status">
      <span className={`${styles.faceRing} ${phase === "ok" ? styles.faceOk : ""}`}>
        {phase === "ok" ? <IconCheck size={22} /> : <IconSmile size={28} />}
      </span>
      <b>{phase === "ok" ? `${amount} sent` : "Confirm with Face ID"}</b>
    </div>
  );
}
