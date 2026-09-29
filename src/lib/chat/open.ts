import { dueLabel } from "./invoice";
import { billShares, doneColumn, money, unclaimedItems } from "./ops";
import type { Message } from "./types";

/**
 * One answer, for every card, to "is this still open, what's left, and does
 * it need you". The header's blue dot, the contact page's Live tab and the
 * Dashboard all read it, so a new card type only answers once, here.
 */
export interface OpenState {
  /** Still unfinished. */
  open: boolean;
  /** Unfinished in a way only you can move forward (vote, tick, pay, answer). */
  needsMe: boolean;
  /** What's left, in a few words: "2 of 6 left", "You owe €18.40". */
  summary: string;
  /** The card's title, for lists. */
  title: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "in 3h", "in 2 days": for deadlines in summaries. */
export function until(ms: number) {
  if (ms <= 0) return "now";
  if (ms < HOUR) return `in ${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < DAY) return `in ${Math.round(ms / HOUR)}h`;
  const d = Math.round(ms / DAY);
  return `in ${d} ${d === 1 ? "day" : "days"}`;
}

/** Null for messages that have nothing to finish (text, photos, doodles, sent payments…). */
export function openState(message: Message, me: string, now = Date.now()): OpenState | null {
  const c = message.card;
  if (!c || message.deletedAt) return null;
  const isAuthor = message.authorId === me;

  switch (c.type) {
    case "checklist": {
      const left = c.items.filter((i) => !i.doneBy).length;
      const canEdit = c.everyoneCanEdit || isAuthor || c.editors.includes(me);
      return { open: left > 0, needsMe: left > 0 && canEdit, summary: `${left} of ${c.items.length} left`, title: c.title };
    }
    case "poll": {
      const open = c.closedAt === null && now < c.closesAt;
      const voted = c.options.some((o) => o.votes.includes(me));
      return {
        open,
        needsMe: open && !voted,
        summary: open ? `${voted ? "You voted · " : ""}Closes ${until(c.closesAt - now)}` : "Closed",
        title: c.question,
      };
    }
    case "event": {
      const open = c.startsAt > now;
      return { open, needsMe: open && !c.rsvps[me], summary: open ? `Starts ${until(c.startsAt - now)}` : "Over", title: c.title };
    }
    case "payment": {
      if (c.mode !== "request") return null;
      const unpaid = c.from.filter((id) => !c.paidBy.includes(id));
      const mine = c.from.includes(me) && !c.paidBy.includes(me);
      const owed = money(Math.round(c.amount * 100));
      if (c.invoice) {
        const due = dueLabel(c.invoice.dueAt, now);
        return {
          open: unpaid.length > 0,
          needsMe: mine,
          summary: unpaid.length === 0 ? "Paid" : mine ? `You owe ${owed} · ${due.toLowerCase()}` : `${owed} · ${due.toLowerCase()}`,
          title: `Invoice ${c.invoice.number}${c.note ? ` · ${c.note}` : ""}`,
        };
      }
      return {
        open: unpaid.length > 0,
        needsMe: mine,
        summary: mine ? `You owe ${owed}` : `${c.paidBy.length} of ${c.from.length} paid`,
        title: c.note || `Request · ${owed}`,
      };
    }
    case "reminder": {
      const open = c.firedAt === null && c.at > now;
      return { open, needsMe: open && (c.audience === "everyone" || isAuthor), summary: open ? until(c.at - now) : "Done", title: c.text };
    }
    case "location": {
      const open = c.live && (c.until ?? 0) > now;
      return open ? { open, needsMe: false, summary: `Sharing live · ends ${until((c.until ?? now) - now)}`, title: c.place } : null;
    }
    case "tictactoe": {
      const moves = c.board.filter(Boolean).length;
      const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      const won = lines.some(([a, b, d]) => c.board[a] && c.board[a] === c.board[b] && c.board[a] === c.board[d]);
      const open = !won && moves < 9;
      const turn = moves % 2 === 0 ? c.players[0] : c.players[1];
      return { open, needsMe: open && turn === me, summary: open ? (turn === me ? "Your move" : "Waiting for a move") : "Game over", title: "Tic-tac-toe" };
    }
    case "plan": {
      const stops = c.days.flatMap((d) => d.stops);
      const left = stops.filter((s) => !s.doneBy);
      const lastDay = c.days[c.days.length - 1]?.date ?? 0;
      const open = left.length > 0 && lastDay + DAY > now;
      const next = left.find((s) => s.at === null || s.at >= now) ?? left[0];
      return {
        open,
        needsMe: open && left.some((s) => s.owner === me),
        summary: open ? `${left.length} of ${stops.length} left${next ? ` · next: ${next.title}` : ""}` : "Done",
        title: c.title,
      };
    }
    case "bill": {
      const shares = billShares(c);
      const owing = Object.keys(shares).filter((id) => id !== c.paidBy && shares[id] > 0 && !c.paid.includes(id));
      const unclaimed = unclaimedItems(c).length;
      const mine = owing.includes(me);
      return {
        open: owing.length > 0 || unclaimed > 0,
        needsMe: mine || (unclaimed > 0 && me !== c.paidBy && !shares[me]),
        summary: mine ? `You owe ${money(shares[me], c.currency)}`
          : unclaimed ? `${unclaimed} ${unclaimed === 1 ? "item" : "items"} unclaimed`
          : owing.length ? `${owing.length} still to pay` : "Settled",
        title: c.merchant,
      };
    }
    case "project": {
      const done = doneColumn(c);
      const live = Object.values(c.tasks).filter((t) => !t.deleted && t.column !== done);
      const mine = live.filter((t) => t.assignee === me);
      return {
        open: live.length > 0,
        needsMe: mine.length > 0,
        summary: `${live.length} open${mine.length ? ` · ${mine.length} yours` : ""}`,
        title: c.name,
      };
    }
    default:
      return null;
  }
}

/** Every unfinished card in a thread, newest first. */
export function openItems(messages: Message[], me: string, now = Date.now()) {
  const out: { message: Message; state: OpenState }[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const state = openState(messages[i], me, now);
    if (state?.open) out.push({ message: messages[i], state });
  }
  return out;
}
