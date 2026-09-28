import { MINUTE, msg } from "./seedkit";
import type { BillCard, Message } from "./types";

/**
 * Team lunch at Konjō Ramen, paid by Charles: everything is claimed (the
 * gyoza split between you and Charles), Reema and Jamshad have paid, and you
 * and Salman still owe, so the chat's Live tab shows what you owe.
 */
export function billSeed(now: number): Message[] {
  const items = [
    { id: "bl-i1", name: "Tonkotsu Ramen", quantity: 1, total: 1490 },
    { id: "bl-i2", name: "Shoyu Ramen", quantity: 1, total: 1350 },
    { id: "bl-i3", name: "Spicy Miso Ramen", quantity: 1, total: 1450 },
    { id: "bl-i4", name: "Vegan Tantanmen", quantity: 1, total: 1390 },
    { id: "bl-i5", name: "Gyoza (6 pcs)", quantity: 1, total: 680 },
    { id: "bl-i6", name: "Karaage Don", quantity: 1, total: 1240 },
  ];
  const subtotal = items.reduce((n, it) => n + it.total, 0);
  const tax = Math.round(subtotal * 0.1);
  const tip = 600;
  const card: BillCard = {
    type: "bill",
    merchant: "Konjō Ramen",
    currency: "EUR",
    items,
    tax,
    tip,
    total: subtotal + tax + tip,
    paidBy: "charles",
    claims: {
      "bl-i1": ["charles"],
      "bl-i2": ["me"],
      "bl-i3": ["jamshad"],
      "bl-i4": ["reema"],
      "bl-i5": ["me", "charles"],
      "bl-i6": ["salman"],
    },
    paid: ["charles", "reema", "jamshad"],
  };
  const at = now - 135 * MINUTE;
  return [
    msg({ id: "bl-1", chatId: "general", authorId: "charles", kind: "card", body: "Bill: Konjō Ramen · €89.60", createdAt: at, card }),
    msg({ id: "bl-2", chatId: "general", authorId: "reema", body: "Paid mine. Thanks for getting lunch, Charles!", createdAt: at + 6 * MINUTE, replyToId: "bl-1" }),
  ];
}
