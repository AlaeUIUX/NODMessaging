import type { Message, ProjectCard, Subtask, Task, User } from "./types";

export const clampProgress = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export type BoardMessage = Message & { card: ProjectCard };

/** Every board in the chat, oldest first (a chat can hold several). */
export function projectsOf(messages: Message[]): BoardMessage[] {
  return messages.filter((m): m is BoardMessage => !m.deletedAt && m.card?.type === "project");
}

/** The chat's newest board. */
export function projectOf(messages: Message[]): BoardMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m.deletedAt && m.card?.type === "project") return m as BoardMessage;
  }
  return undefined;
}

export function newProject(name: string): ProjectCard {
  return {
    type: "project",
    name: name.trim() || "Board",
    columns: [{ id: "todo", name: "To do" }, { id: "doing", name: "Doing" }, { id: "done", name: "Done" }],
    categories: [],
    tasks: {},
  };
}

const rid = () => Math.random().toString(36).slice(2, 9);

export function newTask(
  fields: {
    title: string; column: string; order?: number; assignee?: string | null; due?: number | null; fromMessageId?: string;
    priority?: Task["priority"]; category?: string | null; progress?: number; subtasks?: Subtask[];
  },
  createdBy: string,
): Task {
  const now = Date.now();
  return {
    id: `t-${now.toString(36)}-${rid()}`,
    title: fields.title.trim(),
    column: fields.column,
    order: fields.order ?? now,
    assignee: fields.assignee ?? null,
    due: fields.due ?? null,
    priority: fields.priority ?? "moderate",
    category: fields.category ?? null,
    progress: clampProgress(fields.progress ?? 0),
    subtasks: fields.subtasks ?? [],
    fromMessageId: fields.fromMessageId,
    createdBy,
    createdAt: now,
    updatedAt: {},
  };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** End of a day (18:00 local), which is when "due Friday" usually means. */
function dueOn(date: Date) {
  const d = new Date(date);
  d.setHours(18, 0, 0, 0);
  return d.getTime();
}

/** Reads a due date from one word: today, tomorrow, a weekday (next one), or 12/10 (day/month). */
export function parseDue(word: string, now = Date.now()): number | null {
  const w = word.toLowerCase().replace(/[.,]$/, "");
  const today = new Date(now);
  if (w === "today") return dueOn(today);
  if (w === "tomorrow" || w === "tmrw") return dueOn(new Date(now + 86_400_000));
  // "fri", "friday", "thurs": at least three letters of a weekday's name.
  const wd = w.length >= 3 ? WEEKDAYS.findIndex((d) => d.startsWith(w)) : -1;
  if (wd >= 0) {
    const ahead = (wd - today.getDay() + 7) % 7 || 7;
    return dueOn(new Date(now + ahead * 86_400_000));
  }
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(w);
  if (m) {
    const d = new Date(today.getFullYear(), Number(m[2]) - 1, Number(m[1]));
    if (d.getTime() < now - 86_400_000) d.setFullYear(d.getFullYear() + 1);
    return dueOn(d);
  }
  return null;
}

/**
 * `/task Hero copy @Reema fri` → a title, an assignee and a due date. The
 * mention and the day are read from the end of the line only, so a title
 * like "Fix sun icon" keeps its words. Returns null when the text isn't a
 * /task command or has no title.
 */
export function parseTaskCommand(text: string, members: User[], now = Date.now()) {
  const m = /^\/task\s+([\s\S]+)$/i.exec(text.trim());
  if (!m) return null;
  let assignee: string | null = null;
  let due: number | null = null;
  const words = m[1].split(/\s+/);
  while (words.length > 1) {
    const last = words[words.length - 1];
    const at = /^@(\w+)$/.exec(last);
    const who: User | undefined = at && !assignee ? members.find((u) => u.name.toLowerCase() === at[1].toLowerCase()) : undefined;
    if (who) { assignee = who.id; words.pop(); continue; }
    const d: number | null = due === null ? parseDue(last, now) : null;
    if (d !== null) { due = d; words.pop(); continue; }
    break;
  }
  const title = words.join(" ").trim();
  return title ? { title, assignee, due } : null;
}
