import { addDays, atMinutes } from "./plan";
import { dayStart, HOUR, MINUTE, msg } from "./seedkit";
import type { Message, PlanStop } from "./types";

const QUARTER = 15 * MINUTE;

const stop = (id: string, at: number | null, title: string, extra: Partial<PlanStop> = {}): PlanStop =>
  ({ id, at, title, doneBy: null, ...extra });

/** Demo messages for this feature, placed into their chats by buildSeedState. */
export function planSeed(now: number): Message[] {
  const today = dayStart(now);

  // Today's offsite, laid out around the current time so two stops are behind
  // us, lunch is coming up and the rest is later. Clamped so every stop stays
  // on today whatever time the demo is opened.
  const lo = today + 150 * MINUTE;
  const hi = today + 18 * HOUR + 15 * MINUTE;
  const t = Math.min(hi, Math.max(lo, Math.round(now / QUARTER) * QUARTER));
  const offsite = msg({
    id: "pl-1",
    chatId: "general",
    authorId: "reema",
    kind: "card",
    body: "Plan: Team offsite",
    createdAt: now - 3 * HOUR,
    card: {
      type: "plan",
      title: "Team offsite",
      days: [{
        id: "pl-1-d1",
        date: today,
        stops: [
          stop("pl-1-s1", t - 150 * MINUTE, "Coffee and kickoff", { place: "Studio Loft, 4th floor", doneBy: "reema" }),
          stop("pl-1-s2", t - 90 * MINUTE, "H2 review: where we are", { place: "Studio Loft", note: "Charles has the deck", doneBy: "charles" }),
          stop("pl-1-s3", t + 30 * MINUTE, "Lunch", { place: "Nour, Rue de la Paix", cost: 22 }),
          stop("pl-1-s4", t + 120 * MINUTE, "Workshop: next quarter’s bets", { place: "Studio Loft", owner: "me", note: "Bring the three bets and a rough timeline for each" }),
          stop("pl-1-s5", t + 240 * MINUTE, "Walk by the river", { place: "Quai des Bergues" }),
          stop("pl-1-s6", t + 330 * MINUTE, "Dinner", { place: "Maison Lune", cost: 45, owner: "reema", note: "Table for five under Reema" }),
        ],
      }],
      rsvps: { reema: "going", charles: "going", jamshad: "going", salman: "maybe" },
      everyoneCanEdit: true,
      editors: [],
    },
  });

  // The coming weekend in Vienna (next week's, if today is already the weekend).
  const toSat = (6 - new Date(today).getDay() + 7) % 7 || 7;
  const sat = addDays(today, toSat);
  const sun = addDays(today, toSat + 1);
  const on = (day: number, h: number, m = 0) => atMinutes(day, h * 60 + m);
  // Sent yesterday: older messages in this DM live in the archive page, and a
  // seed older than those would sit out of order once "load earlier" runs.
  const sentAt = now - 22 * HOUR;
  const vienna = msg({
    id: "pl-2",
    chatId: "dm",
    authorId: "charles",
    kind: "card",
    body: "Plan: Vienna weekend",
    createdAt: sentAt,
    card: {
      type: "plan",
      title: "Vienna weekend",
      days: [
        {
          id: "pl-2-d1",
          date: sat,
          stops: [
            stop("pl-2-s1", on(sat, 9, 30), "Breakfast", { place: "Café Sperl", cost: 14 }),
            stop("pl-2-s2", on(sat, 11), "The Kiss and the Klimts", { place: "Upper Belvedere", cost: 16, owner: "charles", note: "Tickets booked for 11:00, QR codes in Charles’s email" }),
            stop("pl-2-s3", on(sat, 13, 30), "Schnitzel lunch", { place: "Figlmüller Wollzeile", cost: 24 }),
            stop("pl-2-s4", on(sat, 15, 30), "Wander the Naschmarkt", { place: "Naschmarkt" }),
            stop("pl-2-s5", on(sat, 19, 30), "Standing tickets at the opera", { place: "Wiener Staatsoper", cost: 18, note: "Queue opens 80 minutes before" }),
          ],
        },
        {
          id: "pl-2-d2",
          date: sun,
          stops: [
            stop("pl-2-s6", on(sun, 10), "Brunch", { place: "Café Central", cost: 19 }),
            stop("pl-2-s7", on(sun, 12), "Prater and the Riesenrad", { place: "Prater", cost: 15 }),
            stop("pl-2-s8", on(sun, 14, 30), "Sachertorte", { place: "Hotel Sacher", cost: 9 }),
            stop("pl-2-s9", on(sun, 17, 15), "Railjet home", { place: "Wien Hauptbahnhof" }),
            stop("pl-2-s10", null, "Manner wafers for the office"),
          ],
        },
      ],
      rsvps: { charles: "going" },
      everyoneCanEdit: true,
      editors: [],
    },
  });

  return [
    offsite,
    vienna,
    msg({ id: "pl-2-note", chatId: "dm", authorId: "charles", body: "Rough plan for Vienna. Add anything you want to do, I’ll book the rest.", createdAt: sentAt + 40_000 }),
  ];
}
