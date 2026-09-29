import { dayStart, HOUR, MINUTE, msg } from "./seedkit";
import type { Message, ProjectCard, Subtask, Task } from "./types";

/** Due at the end of a working day, `offset` days from now (like "due Friday"). */
const dueIn = (now: number, offset: number) => dayStart(now, offset) + 18 * HOUR;

function task(
  id: string,
  fields: Pick<Task, "title" | "column" | "order" | "assignee"> & Partial<Pick<Task, "due" | "fromMessageId" | "priority" | "category" | "progress" | "subtasks">>,
  createdBy: string,
  createdAt: number,
  movedAt?: number,
): Task {
  return {
    id,
    due: null,
    priority: "moderate",
    category: null,
    progress: 0,
    subtasks: [],
    ...fields,
    createdBy,
    createdAt,
    updatedAt: movedAt ? { column: movedAt, order: movedAt } : {},
  };
}

const sub = (title: string, done: boolean): Subtask => ({ id: `st-${Math.random().toString(36).slice(2, 8)}`, title, done });

const tasks = (list: Task[]) => Object.fromEntries(list.map((t) => [t.id, t]));

/** Demo messages for this feature, placed into their chats by buildSeedState. */
export function projectSeed(now: number): Message[] {
  // The team's launch board, started by Charles just after the QR code idea (g-3).
  const made = now - 5 * HOUR + 12 * MINUTE;
  const launch: ProjectCard = {
    type: "project",
    name: "Spaces launch",
    columns: [{ id: "todo", name: "To do" }, { id: "doing", name: "Doing" }, { id: "done", name: "Done" }],
    categories: [{ id: "cat-eng", name: "Engineering" }, { id: "cat-copy", name: "Copy" }, { id: "cat-design", name: "Design" }],
    tasks: tasks([
      task("pj-g-qr", {
        title: "QR code on the client handoff screen", column: "todo", order: 1, assignee: "me", due: dueIn(now, 1), fromMessageId: "g-3", priority: "urgent", category: "cat-eng", progress: 20,
        subtasks: [sub("Mock the placement", true), sub("Generate the code", false), sub("Wire it into the handoff screen", false)],
      }, "charles", made + 20_000),
      task("pj-g-store", { title: "App Store description", column: "todo", order: 2, assignee: "reema", due: dueIn(now, 3), priority: "low", category: "cat-copy", progress: 10 }, "charles", made + 40_000),
      task("pj-g-investor", { title: "Send investor preview", column: "todo", order: 3, assignee: "charles", due: dueIn(now, 5), priority: "low" }, "charles", made + 60_000),
      task("pj-g-demo", { title: "Record the demo video", column: "todo", order: 4, assignee: "salman", category: "cat-design" }, "charles", made + 80_000),
      task("pj-g-pricing", {
        title: "Finalise pricing page copy", column: "doing", order: 1, assignee: "me", due: dueIn(now, -1), priority: "moderate", category: "cat-copy", progress: 80,
        subtasks: [sub("First draft", true), sub("Dana's review", true), sub("Final polish", false)],
      }, "charles", made + 100_000, now - 2 * HOUR),
      task("pj-g-android", { title: "QA Spaces flow on Android", column: "doing", order: 2, assignee: "jamshad", due: dueIn(now, 0), priority: "urgent", category: "cat-eng", progress: 60 }, "reema", made + 30 * MINUTE, now - 70 * MINUTE),
      task("pj-g-empty", { title: "Empty states for Spaces", column: "doing", order: 3, assignee: "reema", due: dueIn(now, 2), priority: "low", category: "cat-design", progress: 35 }, "reema", made + 32 * MINUTE),
      task("pj-g-reqs", { title: "Requirements doc", column: "done", order: 1, assignee: "charles", category: "cat-eng", progress: 100 }, "charles", made + 10_000, now - 4 * HOUR),
      task("pj-g-mood", { title: "Moodboard for the launch", column: "done", order: 2, assignee: "reema", category: "cat-design", progress: 100 }, "charles", made + 120_000, now - 35 * MINUTE),
    ]),
  };

  // A small board between two people, from Charles asking for a review (dm-5).
  const dmMade = now - 78 * MINUTE;
  const pair: ProjectCard = {
    type: "project",
    name: "Our board",
    columns: [{ id: "todo", name: "To do" }, { id: "doing", name: "Doing" }, { id: "done", name: "Done" }],
    categories: [{ id: "cat-qa", name: "QA" }],
    tasks: tasks([
      task("pj-dm-review", { title: "Review the latest implementation", column: "doing", order: 1, assignee: "me", due: dueIn(now, 0), fromMessageId: "dm-5", priority: "low", category: "cat-qa", progress: 50 }, "me", dmMade + 10_000, now - 70 * MINUTE),
      task("pj-dm-edge", { title: "Share the edge-case list with QA", column: "todo", order: 1, assignee: "charles", due: dueIn(now, 2), category: "cat-qa" }, "me", dmMade + 30_000),
    ]),
  };

  return [
    msg({ id: "pj-general", chatId: "general", authorId: "charles", kind: "card", body: `Board: ${launch.name}`, createdAt: made, card: launch }),
    msg({ id: "pj-dm", chatId: "dm", authorId: "me", kind: "card", body: `Board: ${pair.name}`, createdAt: dmMade, card: pair }),
  ];
}
