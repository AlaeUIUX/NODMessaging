"use client";

import { useState } from "react";
import { initials } from "@/lib/chat/avatar";
import { dueLabel, invoiceTotals, isOverdue, longDate } from "@/lib/chat/invoice";
import { money } from "@/lib/chat/ops";
import { useChat, userById } from "@/lib/chat/store";
import type { Card, Invoice, Message } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { ConfirmPay } from "./CardBuilders";
import { IconCheck, IconReceipt } from "./Icons";
import { Sheet, useChatUi, useNow } from "./ui";
import styles from "./chat.module.css";
import iv from "./invoice.module.css";

type Payment = Extract<Card, { type: "payment" }>;

/** Paid, overdue, or when it's due, from where the invoice stands right now. */
function status(card: Payment, inv: Invoice, now: number) {
  if (card.paidBy.includes(card.from[0])) return { label: "Paid", tone: iv.ok };
  return { label: dueLabel(inv.dueAt, now), tone: isOverdue(inv.dueAt, now) ? iv.late : iv.due };
}

/**
 * A request that carries an invoice: the total, who it's billed to, the
 * first few items, and the whole document one tap away.
 */
export function InvoiceCardView({ message, card, invoice, interactive }: { message: Message; card: Payment; invoice: Invoice; interactive: boolean }) {
  const { me } = useChat();
  const ui = useChatUi();
  const now = useNow(60_000);
  const author = userById(message.authorId);
  const to = userById(card.from[0]);
  const paid = card.paidBy.includes(to.id);
  const owes = to.id === me && !paid;
  const st = status(card, invoice, now);
  const { total } = invoiceTotals(invoice);
  const open = () => ui.openSheet(<InvoiceSheet message={message} />);

  return (
    <div className={`${styles.card} ${iv.card}`}>
      <p className={styles.cardKicker}><span><IconReceipt size={14} /> Invoice {invoice.number}</span><span className={st.tone}>{st.label}</span></p>
      <b className={styles.payAmount}>{money(total)}</b>
      {card.note && <p className={styles.cardSub}>{card.note}</p>}
      <ul className={iv.peek}>
        {invoice.lines.slice(0, 3).map((l) => (
          <li key={l.id}>
            <span>{l.quantity > 1 ? `${l.quantity} × ` : ""}{l.description}</span>
            <em>{money(l.quantity * l.unit)}</em>
          </li>
        ))}
        {invoice.lines.length > 3 && <li className={iv.more}>+{invoice.lines.length - 3} more</li>}
      </ul>
      <p className={iv.billed}>
        <Avatar glyph={initials(to.fullName)} tone={to.tone} photo={to.photo} size={22} shape="circle" />
        <span className={iv.billedText}>{message.authorId === me ? `Billed to ${to.id === me ? "you" : to.name}` : owes ? `${author.name} billed you` : `${author.name} billed ${to.name}`}</span>
        <em className={paid ? iv.ok : undefined}>{paid ? "Paid" : "Unpaid"}</em>
      </p>
      <div className={iv.actions}>
        <button className={styles.secondaryWide} onClick={open}>View invoice</button>
        {interactive && owes && <button className={styles.primaryWide} onClick={open}>Pay</button>}
      </div>
    </div>
  );
}

/** The invoice itself, laid out like the paper version, with Pay for whoever it's billed to. */
export function InvoiceSheet({ message }: { message: Message }) {
  const { me, state, updateCard } = useChat();
  const ui = useChatUi();
  const now = useNow(60_000);
  // Read the live message, so a payment from another tab shows here straight away.
  const live = state.data.messages[message.chatId]?.find((m) => m.id === message.id) ?? message;
  const card = live.card;
  if (card?.type !== "payment" || !card.invoice) return null;
  const inv = card.invoice;
  const from = userById(live.authorId);
  const to = userById(card.from[0]);
  const paid = card.paidBy.includes(to.id);
  const owes = to.id === me && !paid;
  const st = status(card, inv, now);
  const { subtotal, tax, total } = invoiceTotals(inv);

  return (
    <Sheet
      title={`Invoice ${inv.number}`}
      onClose={ui.closeSheet}
      footer={owes ? (
        <div className={styles.sheetFooter}>
          <PayStep amount={money(total)} onPaid={() => {
            updateCard(live, (c) => (c.type === "payment" && !c.paidBy.includes(me) ? { ...c, paidBy: [...c.paidBy, me] } : c));
            ui.closeSheet();
            ui.toast(`Paid ${money(total)} to ${from.name}`);
          }} />
        </div>
      ) : undefined}
    >
      <article className={iv.paper} aria-label={`Invoice ${inv.number}`}>
        <header className={iv.paperHead}>
          <div>
            <p className={iv.eyebrow}>Invoice</p>
            <b>{inv.number}</b>
          </div>
          <span className={`${iv.stamp} ${st.tone}`}>{paid ? <><IconCheck size={12} /> Paid</> : st.label}</span>
        </header>
        <div className={iv.parties}>
          <div><p className={iv.eyebrow}>From</p><b>{from.fullName}</b></div>
          <div><p className={iv.eyebrow}>Bill to</p><b>{to.fullName}</b></div>
          <div><p className={iv.eyebrow}>Issued</p><span>{longDate(inv.issuedAt)}</span></div>
          <div><p className={iv.eyebrow}>Due</p><span>{inv.dueAt - inv.issuedAt < 86_400_000 ? "On receipt" : longDate(inv.dueAt)}</span></div>
        </div>
        {card.note && <p className={iv.subject}>{card.note}</p>}
        <table className={iv.table}>
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id}><td>{l.description}</td><td>{l.quantity}</td><td>{money(l.unit)}</td><td>{money(l.quantity * l.unit)}</td></tr>
            ))}
          </tbody>
        </table>
        <dl className={iv.sums}>
          <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
          {inv.taxRate > 0 && <div><dt>VAT {inv.taxRate}%</dt><dd>{money(tax)}</dd></div>}
          <div className={iv.sumTotal}><dt>Total</dt><dd>{money(total)}</dd></div>
        </dl>
        {inv.note && <p className={iv.paperNote}>{inv.note}</p>}
      </article>
      <p className={styles.demoNote}>Demo payments — no real money moves.</p>
    </Sheet>
  );
}

/** Pay, then the Face ID step in place of the button. */
function PayStep({ amount, onPaid }: { amount: string; onPaid: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return confirming
    ? <ConfirmPay amount={amount} onDone={onPaid} />
    : <button className={styles.primaryWide} onClick={() => setConfirming(true)}>Pay {amount}</button>;
}
