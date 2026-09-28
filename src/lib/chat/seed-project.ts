import { dayStart, HOUR, MINUTE, msg } from "./seedkit";
import type { Message, ProjectCard, Task } from "./types";

/** Due at the end of a working day, `offset` days from now (like "due Friday"). */
const dueIn = (now: number, offset: number) => dayStart(now, offset) + 18 * HOUR;

function task(
  id: string,
  fields: Pick<Task, "title" | "column" | "order" | "assignee"> & Partial<Pick<Task, "due" | "fromMessageId">>,
  createdBy: string,
  createdAt: number,
  movedAt?: number,
): Task {
  return {
    id,
    due: null,
    ...fields,
    createdBy,
    createdAt,
    updatedAt: movedAt ? { column: movedAt, order: movedAt } : {},
  };
}

const tasks = (list: Task[]) => Object.fromEntries(list.map((t) => [t.id, t]));

/** Demo messages for this feature, placed into their chats by buildSeedState. */
export function projectSeed(now: number): Message[] {
  // The team's launch board, started by Charles just after the QR code idea (g-3).
  const made = now - 5 * HOUR + 12 * MINUTE;
  const launch: ProjectCard = {
    type: "project",
    name: "Spaces launch",
    columns: [{ id: "todo", name: "To do" }, { id: "doing", name: "Doing" }, { id: "done", name: "Done" }],
    tasks: tasks([
      task("pj-g-qr", { title: "QR code on the client handoff screen", column: "todo", order: 1, assignee: "me", due: dueIn(now, 1), fromMessageId: "g-3" }, "charles", made + 20_000),
      task("pj-g-store", { title: "App Store description", column: "todo", order: 2, assignee: "reema", due: dueIn(now, 3) }, "charles", made + 40_000),
      task("pj-g-investor", { title: "Send investor preview", column: "todo", order: 3, assignee: "charles", due: dueIn(now, 5) }, "charles", made + 60_000),
      task("pj-g-demo", { title: "Record the demo video", column: "todo", order: 4, assignee: "salman" }, "charles", made + 80_000),
      task("pj-g-pricing", { title: "Finalise pricing page copy", column: "doing", order: 1, assignee: "me", due: dueIn(now, -1) }, "charles", made + 100_000, now - 2 * HOUR),
      task("pj-g-android", { title: "QA Spaces flow on Android", column: "doing", order: 2, assignee: "jamshad", due: dueIn(now, 0) }, "reema", made + 30 * MINUTE, now - 70 * MINUTE),
      task("pj-g-empty", { title: "Empty states for Spaces", column: "doing", order: 3, assignee: "reema", due: dueIn(now, 2) }, "reema", made + 32 * MINUTE),
      task("pj-g-reqs", { title: "Requirements doc", column: "done", order: 1, assignee: "charles" }, "charles", made + 10_000, now - 4 * HOUR),
      task("pj-g-mood", { title: "Moodboard for the launch", column: "done", order: 2, assignee: "reema" }, "charles", made + 120_000, now - 35 * MINUTE),
    ]),
  };

  // A small board between two people, from Charles asking for a review (dm-5).
  const dmMade = now - 78 * MINUTE;
  const pair: ProjectCard = {
    type: "project",
    name: "Our board",
    columns: [{ id: "todo", name: "To do" }, { id: "doing", name: "Doing" }, { id: "done", name: "Done" }],
    tasks: tasks([
      task("pj-dm-review", { title: "Review the latest implementation", column: "doing", order: 1, assignee: "me", due: dueIn(now, 0), fromMessageId: "dm-5" }, "me", dmMade + 10_000, now - 70 * MINUTE),
      task("pj-dm-edge", { title: "Share the edge-case list with QA", column: "todo", order: 1, assignee: "charles", due: dueIn(now, 2) }, "me", dmMade + 30_000),
    ]),
  };

  return [
    msg({ id: "pj-general", chatId: "general", authorId: "charles", kind: "card", body: `Board: ${launch.name}`, createdAt: made, card: launch }),
    msg({ id: "pj-dm", chatId: "dm", authorId: "me", kind: "card", body: `Board: ${pair.name}`, createdAt: dmMade, card: pair }),
  ];
}
