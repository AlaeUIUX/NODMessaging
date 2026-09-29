import type { ChatState, Invoice } from "./types";

/**
 * Invoices ride on payment requests: the lines set the amount, and the card
 * tracks whether it's been paid like any other request.
 */

/** Subtotal, VAT and total, in cents. VAT rounds once, on the subtotal. */
export function invoiceTotals(inv: Pick<Invoice, "lines" | "taxRate">) {
  const subtotal = inv.lines.reduce((sum, l) => sum + l.quantity * l.unit, 0);
  const tax = Math.round((subtotal * inv.taxRate) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

/** The next number in this sender's own sequence: INV-0001, INV-0002… */
export function nextInvoiceNumber(data: Pick<ChatState, "messages">, authorId: string) {
  let max = 0;
  for (const list of Object.values(data.messages)) {
    for (const m of list) {
      const n = m.authorId === authorId && m.card?.type === "payment" ? m.card.invoice?.number.match(/(\d+)$/)?.[1] : undefined;
      if (n) max = Math.max(max, Number(n));
    }
  }
  return `INV-${String(max + 1).padStart(4, "0")}`;
}

const DAY = 86_400_000;

/** "Due today", "Due in 14 days", "3 days overdue". */
export function dueLabel(dueAt: number, now = Date.now()) {
  const a = new Date(now); a.setHours(0, 0, 0, 0);
  const b = new Date(dueAt); b.setHours(0, 0, 0, 0);
  const days = Math.round((b.getTime() - a.getTime()) / DAY);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1) return `Due in ${days} days`;
  return `${-days} ${days === -1 ? "day" : "days"} overdue`;
}

export const isOverdue = (dueAt: number, now = Date.now()) => dueLabel(dueAt, now).endsWith("overdue");

export const longDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
