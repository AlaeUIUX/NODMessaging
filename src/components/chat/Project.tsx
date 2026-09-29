"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chatIdentity, initials } from "@/lib/chat/avatar";
import { stripFormatting } from "@/lib/chat/markdown";
import { openState } from "@/lib/chat/open";
import { doneColumn, tasksIn } from "@/lib/chat/ops";
import { newProject, newTask, parseDue, parseTaskCommand, projectsOf, type BoardMessage } from "@/lib/chat/project";
import { useChat, userById } from "@/lib/chat/store";
import type { Card, Chat, Message, ProjectCard, Task, User } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconBack, IconBoard, IconCheck, IconChevron, IconChevronDown, IconClock, IconEdit, IconLink, IconMore, IconPlus, IconTrash } from "./Icons";
import StatusBar from "./StatusBar";
import { relative, Sheet, smooth, uid, useChatUi, useDialog, useNow } from "./ui";
import styles from "./chat.module.css";
import s from "./project.module.css";

type Send = (card: Card, summary: string) => void;

const DAY = 86_400_000;
/** How long a finger rests on a task before it lifts. */
const HOLD_MS = 350;
/** Room left between orders when a task goes to either end of a column. */
const GAP = 1024;
/** Edit time for ops; only ever called from event handlers. */
const stamp = () => Date.now();

/* ---------------------------------------------------------------------------
   Shared bits: people, due dates, pickers
--------------------------------------------------------------------------- */

/** You first, then everyone else in the chat. */
function peopleOf(memberIds: string[], me: string): User[] {
  return [me, ...memberIds.filter((id) => id !== me)].map(userById);
}

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Due dates mean the end of that working day, like `parseDue`. */
const endOfDay = (t: number) => { const d = new Date(t); d.setHours(18, 0, 0, 0); return d.getTime(); };

function dueInfo(due: number, now: number) {
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  const label = days === 0 ? "Today"
    : days === 1 ? "Tomorrow"
    : days === -1 ? "Yesterday"
    : days > 1 && days < 7 ? new Date(due).toLocaleDateString(undefined, { weekday: "short" })
    : new Date(due).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const tone = due < now ? "late" : days <= 1 ? "soon" : "later";
  return { label, tone } as const;
}

function DueChip({ due, now }: { due: number; now: number }) {
  const { label, tone } = dueInfo(due, now);
  return (
    <span className={`${s.due} ${tone === "late" ? s.dueLate : tone === "soon" ? s.dueSoon : ""}`}>
      <IconClock size={12} />
      {label}
      {tone === "late" && <span className={s.srOnly}>, overdue</span>}
    </span>
  );
}

/** Sorts by due date: overdue first (they're the earliest), no date last. */
const byDue = (a: Task, b: Task) => (a.due ?? Infinity) - (b.due ?? Infinity) || a.order - b.order;

function AssigneePicker({ people, me, value, onChange }: { people: User[]; me: string; value: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className={styles.chipGrid} role="group" aria-label="Assignee">
      {people.map((u) => (
        <button key={u.id} className={`${styles.choice} ${s.person} ${value === u.id ? styles.choiceOn : ""}`} aria-pressed={value === u.id} onClick={() => onChange(u.id)}>
          <Avatar glyph={initials(u.fullName)} tone={u.tone} size={22} shape="circle" />
          {u.id === me ? "You" : u.name}
        </button>
      ))}
      <button className={`${styles.choice} ${value === null ? styles.choiceOn : ""}`} aria-pressed={value === null} onClick={() => onChange(null)}>Nobody</button>
    </div>
  );
}

const toDateInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function DuePicker({ value, onChange }: { value: number | null; onChange: (due: number | null) => void }) {
  // Worked out on each render, so "Tomorrow" stays right across midnight.
  const presets = [
    { label: "Today", at: parseDue("today") },
    { label: "Tomorrow", at: parseDue("tomorrow") },
    { label: "Friday", at: parseDue("friday") },
    { label: "Next week", at: parseDue("monday") },
  ];
  const matched = presets.some((p) => p.at === value);
  return (
    <>
      <div className={styles.chipGrid} role="group" aria-label="Due">
        {presets.map((p) => (
          <button key={p.label} className={`${styles.choice} ${p.at === value ? styles.choiceOn : ""}`} aria-pressed={p.at === value} onClick={() => onChange(p.at)}>
            {p.label}
          </button>
        ))}
        {value !== null && <button className={`${styles.choice} ${s.clear}`} onClick={() => onChange(null)}>Clear</button>}
      </div>
      <label className={`${s.dateField} ${value !== null && !matched ? s.dateFieldOn : ""}`}>
        <span>On a date</span>
        <input
          type="date"
          value={value !== null ? toDateInput(value) : ""}
          onChange={(e) => {
            const [y, m, d] = e.target.value.split("-").map(Number);
            onChange(y ? endOfDay(new Date(y, m - 1, d).getTime()) : null);
          }}
        />
      </label>
    </>
  );
}

/** Reads the board fresh from the store, so a sheet opened earlier shows changes from other tabs. */
function useLiveBoard(chatId: string, messageId: string) {
  const { state } = useChat();
  const m = state.data.messages[chatId]?.find((x) => x.id === messageId);
  return m?.card?.type === "project" && !m.deletedAt ? (m as BoardMessage) : null;
}

/** Where a task lands at the end of a column: after everything, including tasks added later with `Date.now()`. */
const endOrder = (list: Task[]) => Math.max(Date.now(), (list[list.length - 1]?.order ?? 0) + GAP);

/* ---------------------------------------------------------------------------
   New board
--------------------------------------------------------------------------- */

const PRESETS = [
  { id: "simple", columns: [{ id: "todo", name: "To do" }, { id: "doing", name: "Doing" }, { id: "done", name: "Done" }] },
  { id: "review", columns: [{ id: "backlog", name: "Backlog" }, { id: "progress", name: "In progress" }, { id: "review", name: "Review" }, { id: "done", name: "Done" }] },
] as const;

/** Start the chat's board (one per DM or Space). */
export function ProjectBuilder({ onSend, onClose }: { onSend: Send; onClose: () => void }) {
  const { me } = useChat();
  const ui = useChatUi();
  const [name, setName] = useState(ui.chat.kind === "group" ? ui.chat.name : "Our board");
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>("simple");
  const [lines, setLines] = useState("");
  const people = peopleOf(ui.chat.memberIds, me);

  const create = () => {
    const card = newProject(name);
    card.columns = PRESETS.find((p) => p.id === preset)!.columns.map((c) => ({ ...c }));
    const base = Date.now();
    lines.split("\n").map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
      const parsed = parseTaskCommand(`/task ${line}`, people);
      if (!parsed) return;
      const task = newTask({ ...parsed, column: card.columns[0].id, order: base + i }, me);
      card.tasks[task.id] = task;
    });
    onSend(card, `Board: ${card.name}`);
  };

  return (
    <Sheet title="New board" onClose={onClose} action={{ label: "Create", disabled: !name.trim(), onClick: create }}>
      <input className={styles.bigInput} data-autofocus placeholder="Board name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Board name" />
      <p className={styles.sheetLabel}>Columns</p>
      <div className={styles.chipGrid} role="radiogroup" aria-label="Columns">
        {PRESETS.map((p) => (
          <button key={p.id} role="radio" aria-checked={preset === p.id} className={`${styles.choice} ${preset === p.id ? styles.choiceOn : ""}`} onClick={() => setPreset(p.id)}>
            {p.columns.map((c) => c.name).join(" · ")}
          </button>
        ))}
      </div>
      <p className={styles.sheetLabel}>First tasks</p>
      <textarea
        className={styles.plainInput}
        rows={4}
        placeholder={"One per line\nHero copy @Reema fri"}
        value={lines}
        onChange={(e) => setLines(e.target.value)}
        aria-label="First tasks, one per line"
      />
      <p className={styles.sheetNote}>End a line with @name or a day (today, fri, 12/10) to assign it and set a due date. You can add more on the board.</p>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   The card in the thread
--------------------------------------------------------------------------- */

/** Column colours step up from a faint grey to ink; the done column is the accent. */
const shade = (i: number, n: number) =>
  i === n - 1 ? "var(--accent)" : `color-mix(in srgb, var(--ink) ${Math.round(18 + (i / Math.max(1, n - 2)) * 40)}%, transparent)`;

function movedLabel(ms: number) {
  return ms < 60_000 ? "just now" : `${relative(ms)} ago`;
}

/** The pinned summary in the thread: counts per column, your tasks, recent moves. */
export function ProjectCardView({ message, card, interactive }: { message: Message; card: ProjectCard; interactive: boolean }) {
  void message;
  const { me } = useChat();
  const ui = useChatUi();
  const now = useNow(60_000);
  const done = doneColumn(card);
  const live = Object.values(card.tasks).filter((t) => !t.deleted);
  const counts = card.columns.map((c) => live.filter((t) => t.column === c.id).length);
  const yours = live.filter((t) => t.assignee === me && t.column !== done).sort(byDue);
  const moved = live
    .filter((t) => t.updatedAt.column)
    .sort((a, b) => b.updatedAt.column! - a.updatedAt.column!)
    .slice(0, 3);
  const colName = (id: string) => card.columns.find((c) => c.id === id)?.name ?? "";
  const open = live.length - (counts[counts.length - 1] ?? 0);

  return (
    <div className={styles.card}>
      <p className={styles.cardKicker}>
        <span><IconBoard size={14} /> Board</span>
        <span>{live.length ? `${open} open` : "No tasks yet"}</span>
      </p>
      <h4 className={styles.cardTitle}>{card.name}</h4>

      <div className={s.bar} aria-hidden="true">
        {live.length > 0 && card.columns.map((c, i) => counts[i] > 0 && (
          <span key={c.id} style={{ flexGrow: counts[i], background: shade(i, card.columns.length) }} />
        ))}
      </div>
      <ul className={s.legend}>
        {card.columns.map((c, i) => (
          <li key={c.id}>
            <i style={{ background: shade(i, card.columns.length) }} />
            {c.name} <b>{counts[i]}</b>
          </li>
        ))}
      </ul>

      {yours.length > 0 && (
        <div className={s.cardGroup}>
          <p className={s.cardLabel}>Yours</p>
          <ul className={s.cardList}>
            {yours.slice(0, 3).map((t) => (
              <li key={t.id}>
                <span className={s.cardTask}>{t.title}</span>
                {t.due !== null && <DueChip due={t.due} now={now} />}
              </li>
            ))}
          </ul>
          {yours.length > 3 && <p className={s.cardMore}>and {yours.length - 3} more</p>}
        </div>
      )}

      {moved.length > 0 && (
        <div className={s.cardGroup}>
          <p className={s.cardLabel}>Recently moved</p>
          <ul className={s.cardList}>
            {moved.map((t) => (
              <li key={t.id} className={s.movedLine}>
                <span className={s.cardTask}>{t.title}</span>
                <small>moved to {colName(t.column)} {movedLabel(now - t.updatedAt.column!)}</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button className={`${styles.secondaryWide} ${s.openBtn}`} onClick={() => ui.openBoard(message.id)} disabled={!interactive}>
        Open board
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Task sheet: edit one task
--------------------------------------------------------------------------- */

function TaskSheet({ chatId, messageId, taskId, onClose, onShowInChat }: {
  chatId: string;
  messageId: string;
  taskId: string;
  onClose: () => void;
  onShowInChat: (messageId: string) => void;
}) {
  const { state, me, cardOp } = useChat();
  const ui = useChatUi();
  const now = useNow(60_000);
  const board = useLiveBoard(chatId, messageId);
  const task = board?.card.tasks[taskId];
  const [title, setTitle] = useState(task?.title ?? "");
  const [confirming, setConfirming] = useState(false);
  const chat = state.data.chats.find((c) => c.id === chatId);
  const people = peopleOf(chat?.memberIds ?? [me], me);
  const gone = !board || !task || task.deleted;

  const update = (patch: Partial<Pick<Task, "title" | "column" | "order" | "assignee" | "due">>) => {
    if (!board || gone) return;
    cardOp(board, { kind: "task.update", id: taskId, patch, at: stamp() });
  };
  // The title saves when the sheet goes, however it's closed.
  const saveTitle = () => {
    const next = title.trim();
    if (!gone && next && next !== task.title) update({ title: next });
  };
  const move = (column: string) => {
    if (!board || gone || column === task.column) return;
    update({ column, order: endOrder(tasksIn(board.card, column).filter((t) => t.id !== taskId)) });
  };

  return (
    <Sheet title="Task" onClose={onClose} onClosing={saveTitle} action={{ label: "Done", onClick: () => {} }}>
      {(close) => gone ? (
        <p className={s.gone}>This task was deleted.</p>
      ) : (
        <>
          <input
            className={`${styles.bigInput} ${s.titleInput}`}
            data-autofocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            aria-label="Task title"
          />
          <p className={styles.sheetNote}>
            Added by {task.createdBy === me ? "you" : userById(task.createdBy).name} · {movedLabel(now - task.createdAt)}
          </p>

          <p className={styles.sheetLabel}>Assignee</p>
          <AssigneePicker people={people} me={me} value={task.assignee} onChange={(assignee) => update({ assignee })} />

          <p className={styles.sheetLabel}>Due</p>
          <DuePicker value={task.due} onChange={(due) => update({ due })} />

          <p className={styles.sheetLabel}>Move to</p>
          <div className={styles.chipGrid} role="radiogroup" aria-label="Column">
            {board.card.columns.map((c) => (
              <button key={c.id} role="radio" aria-checked={task.column === c.id} className={`${styles.choice} ${task.column === c.id ? styles.choiceOn : ""}`} onClick={() => move(c.id)}>
                {c.name}
              </button>
            ))}
          </div>

          <div className={s.sheetActions}>
            {task.fromMessageId && (
              <button className={styles.secondaryWide} onClick={() => close(() => onShowInChat(task.fromMessageId!))}>Show in chat</button>
            )}
            {confirming ? (
              <div className={s.confirm} role="group" aria-label="Delete this task?">
                <p>Delete “{task.title}” for everyone in the chat?</p>
                <div>
                  <button className={styles.secondaryWide} onClick={() => setConfirming(false)}>Keep</button>
                  <button
                    className={`${styles.secondaryWide} ${s.danger}`}
                    data-autofocus
                    onClick={() => close(() => { cardOp(board, { kind: "task.remove", id: taskId }); ui.toast("Task deleted"); })}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <button className={`${styles.secondaryWide} ${s.danger}`} onClick={() => setConfirming(true)}>Delete task</button>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   The board
--------------------------------------------------------------------------- */

function TaskBody({ task, now, done, onShow }: { task: Task; now: number; done: boolean; onShow?: (id: string) => void }) {
  const who = task.assignee ? userById(task.assignee) : null;
  return (
    <>
      <p className={`${s.taskTitle} ${done ? s.taskDone : ""}`}>
        {done && <span className={s.doneMark} aria-hidden="true"><IconCheck size={10} /></span>}
        {task.title}
      </p>
      {(task.due !== null || task.fromMessageId || who) && (
        <div className={s.taskMeta}>
          {task.due !== null && !done && <DueChip due={task.due} now={now} />}
          {task.fromMessageId && (
            onShow ? (
              <button
                className={s.fromChat}
                aria-label="Show the message in the chat"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onShow(task.fromMessageId!); }}
              >
                <IconLink size={13} /> From chat
              </button>
            ) : <span className={s.fromChat}><IconLink size={13} /> From chat</span>
          )}
          {who && (
            <span className={s.assignee} title={who.fullName}>
              <Avatar glyph={initials(who.fullName)} tone={who.tone} size={22} shape="circle" />
              <span className={s.srOnly}>Assigned to {who.name}</span>
            </span>
          )}
        </div>
      )}
    </>
  );
}

/**
 * A column's name (tap to rename) and its menu: rename, or delete the group
 * with its tasks after a confirm. A new group opens straight into renaming.
 */
function ColumnHead({ name, count, renameNow, canDelete, menuOpen, onMenu, onRename, onDelete, onRenamed }: {
  name: string;
  count: number;
  /** Start in the name field (a group that was just added). */
  renameNow: boolean;
  canDelete: boolean;
  /** The board keeps one menu open at a time; this says whether it's this one. */
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onRenamed: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(renameNow ? name : null);
  const [confirming, setConfirming] = useState(false);
  // Closed from elsewhere (another menu, a tap outside): the next open starts at the menu, not the confirm.
  if (!menuOpen && confirming) setConfirming(false);
  const menu = !menuOpen ? "closed" : confirming ? "confirm" : "open";
  const setMenu = (next: "closed" | "open" | "confirm") => {
    setConfirming(next === "confirm");
    onMenu(next !== "closed");
  };
  const ref = useRef<HTMLInputElement>(null);
  const editing = draft !== null;
  // The field replaces the name the person just tapped.
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  const commit = () => {
    const next = draft?.trim();
    setDraft(null);
    onRenamed();
    if (next && next !== name) onRename(next);
  };
  const tasks = `${count} ${count === 1 ? "task" : "tasks"}`;
  return (
    <header className={s.colHead}>
      {draft === null ? (
        <button className={s.colName} onClick={() => setDraft(name)} aria-label={`${name}, ${tasks}. Rename group`}>
          {name}
        </button>
      ) : (
        <input
          ref={ref}
          className={s.colInput}
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            // Handled here, so the board itself stays open.
            if (e.key === "Escape") { e.preventDefault(); setDraft(null); onRenamed(); }
          }}
          aria-label="Group name"
        />
      )}
      <em aria-hidden="true">{count}</em>
      <button
        className={s.colMore}
        onClick={() => setMenu(menu === "closed" ? "open" : "closed")}
        aria-haspopup="menu"
        aria-expanded={menu !== "closed"}
        aria-label={`${name} options`}
      >
        <IconMore size={18} />
      </button>
      {menu !== "closed" && (
        <>
          <div
            className={`${s.colMenu} ${styles.glassStrong}`}
            role="menu"
            aria-label={`${name} options`}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setMenu("closed"); } }}
          >
            {menu === "open" ? (
              <>
                <button role="menuitem" className={s.pickRow} autoFocus onClick={() => { setMenu("closed"); setDraft(name); }}>
                  <span className={s.pickIcon}><IconEdit size={16} /></span>
                  <span className={s.pickText}><b>Rename group</b></span>
                </button>
                <button
                  role="menuitem"
                  className={`${s.pickRow} ${s.pickDanger}`}
                  disabled={!canDelete}
                  onClick={() => setMenu("confirm")}
                >
                  <span className={s.pickIcon}><IconTrash size={16} /></span>
                  <span className={s.pickText}>
                    <b>Delete group</b>
                    <small>{canDelete ? (count ? `Its ${tasks} go too` : "It's empty") : "A board keeps at least one group"}</small>
                  </span>
                </button>
              </>
            ) : (
              <div className={s.confirm} role="alertdialog" aria-label={`Delete ${name}?`}>
                <b>Delete “{name}”?</b>
                <p>{count ? `Its ${tasks} will be deleted for everyone in this chat.` : "It has no tasks."}</p>
                <div className={s.confirmRow}>
                  <button className={s.confirmCancel} autoFocus onClick={() => setMenu("closed")}>Cancel</button>
                  <button className={s.confirmDelete} onClick={() => { setMenu("closed"); onDelete(); }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </header>
  );
}

function AddTask({ open, onOpen, onClose, onAdd, first }: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAdd: (text: string) => boolean;
  first: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "nearest", behavior: smooth() });
  }, [open]);
  if (!open) {
    return (
      <button className={s.addTask} onClick={onOpen}>
        <IconPlus size={16} /> Add a task
      </button>
    );
  }
  return (
    <div className={s.addField}>
      <input
        ref={ref}
        value={text}
        placeholder={first ? "Hero copy @Reema fri" : "Add a task"}
        enterKeyHint="done"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (!text.trim()) onClose(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) { if (onAdd(text)) setText(""); }
          if (e.key === "Escape") { e.preventDefault(); setText(""); onClose(); }
        }}
        aria-label="New task. End with @name or a day to assign it or set a due date"
      />
      <button
        className={s.addGo}
        disabled={!text.trim()}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => { if (onAdd(text)) setText(""); ref.current?.focus({ preventScroll: true }); }}
        aria-label="Add"
      >
        <IconChevron size={16} />
      </button>
    </div>
  );
}

type Drop = { col: string; before: string | null };

/** Counts for a board in the switcher. */
function boardCounts(card: ProjectCard) {
  const done = doneColumn(card);
  const live = Object.values(card.tasks).filter((t) => !t.deleted);
  return { open: live.filter((t) => t.column !== done).length, total: live.length };
}

/** The full-screen board for one project card; the title switches between the chat's boards. */
export function ProjectBoard({ message, boards, onSwitch, onNew, onClose }: {
  message: BoardMessage;
  /** Every board in this chat, oldest first. */
  boards: BoardMessage[];
  onSwitch: (messageId: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const { me, cardOp } = useChat();
  const ui = useChatUi();
  const now = useNow(60_000);
  const card = message.card;
  const done = doneColumn(card);
  const people = useMemo(() => peopleOf(ui.chat.memberIds, me), [ui.chat.memberIds, me]);
  const live = Object.values(card.tasks).filter((t) => !t.deleted);
  const openCount = live.filter((t) => t.column !== done).length;

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  // Which menu is open: "boards" (the switcher), a column id, or none. Opening one closes the rest.
  const [menu, setMenu] = useState<string | null>(null);
  const picking = menu === "boards";
  const setPicking = (open: boolean | ((v: boolean) => boolean)) =>
    setMenu((cur) => ((typeof open === "function" ? open(cur === "boards") : open) ? "boards" : null));
  // A group just added from the header: it opens with its name ready to type.
  const [renaming, setRenaming] = useState<string | null>(null);

  // A different board: start at its first group, with nothing half-added.
  const [shown, setShown] = useState(message.id);
  if (shown !== message.id) {
    setShown(message.id);
    setAdding(null);
    setMenu(null);
  }
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [message.id]);


  const close = (after?: () => void) => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => { onClose(); after?.(); }, 220);
  };
  useDialog(rootRef, () => close());
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, []);

  const showInChat = (id: string) => close(() => setTimeout(() => ui.jumpTo(id), 40));
  const openTask = (t: Task) => ui.openSheet(
    <TaskSheet chatId={message.chatId} messageId={message.id} taskId={t.id} onClose={ui.closeSheet} onShowInChat={showInChat} />,
  );

  /** A new group, before Done, named and ready to rename; the board scrolls to it. */
  const addGroup = () => {
    const id = `col-${uid()}`;
    cardOp(message, { kind: "column.add", column: { id, name: "New group" } });
    setRenaming(id);
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector<HTMLElement>(`[data-col="${id}"]`)?.scrollIntoView({ behavior: smooth(), block: "center" });
    });
  };
  const removeGroup = (id: string) => {
    const col = card.columns.find((c) => c.id === id);
    cardOp(message, { kind: "column.remove", id });
    if (col) ui.toast(`Deleted “${col.name}”`);
  };

  const addTo = (column: string, text: string) => {
    const parsed = parseTaskCommand(`/task ${text}`, people);
    if (!parsed) return false;
    const task = newTask({ ...parsed, column, order: endOrder(tasksIn(card, column)) }, me);
    cardOp(message, { kind: "task.add", task });
    return true;
  };

  /* ---- drag and drop ---- */
  const drag = useRef<{
    id: string; x0: number; y0: number; x: number; y: number; offX: number; offY: number;
    active: boolean; timer: ReturnType<typeof setTimeout>; frame: number;
  } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; w: number; h: number } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const dropRef = useRef<Drop | null>(null);
  // A drop can be followed by a click on the same task (mouse), or not (touch): ignore clicks just after one.
  const droppedAt = useRef(0);

  // Tasks let the board scroll (React's touch listeners are passive), so once a
  // hold lifts one a native listener keeps the groups still under the finger.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const hold = (e: TouchEvent) => { if (drag.current?.active && e.cancelable) e.preventDefault(); };
    el.addEventListener("touchmove", hold, { passive: false });
    return () => {
      el.removeEventListener("touchmove", hold);
      const d = drag.current;
      if (d) { clearTimeout(d.timer); cancelAnimationFrame(d.frame); }
    };
  }, []);

  const moveGhost = () => {
    const root = rootRef.current?.getBoundingClientRect();
    const d = drag.current;
    if (!root || !d || !ghostRef.current) return;
    ghostRef.current.style.transform = `translate(${d.x - root.left - d.offX}px, ${d.y - root.top - d.offY}px) rotate(-1.5deg) scale(1.03)`;
  };

  const findDrop = (x: number, y: number): Drop | null => {
    const d = drag.current!;
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    const colEl = hit?.closest<HTMLElement>("[data-col]");
    if (!colEl) return null;
    const col = colEl.dataset.col!;
    const list = tasksIn(card, col).filter((t) => t.id !== d.id);
    // The first task whose middle is below the finger goes after it.
    for (const t of list) {
      const el = colEl.querySelector<HTMLElement>(`[data-task="${t.id}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) return { col, before: t.id };
    }
    return { col, before: null };
  };

  const setTarget = (t: Drop | null) => {
    const prev = dropRef.current;
    if (prev?.col === t?.col && prev?.before === t?.before) return;
    dropRef.current = t;
    setDrop(t);
  };

  // Near the top or bottom the board keeps scrolling while the finger rests there,
  // so a task can travel from To do down to Done in one hold.
  const tick = () => {
    const d = drag.current;
    const board = scrollRef.current;
    if (!d?.active || !board) return;
    const r = board.getBoundingClientRect();
    const edge = 72;
    if (d.y < r.top + edge) board.scrollTop -= Math.ceil((r.top + edge - d.y) / 5);
    else if (d.y > r.bottom - edge) board.scrollTop += Math.ceil((d.y - (r.bottom - edge)) / 5);
    setTarget(findDrop(d.x, d.y));
    d.frame = requestAnimationFrame(tick);
  };

  const onTaskDown = (e: React.PointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const r = el.getBoundingClientRect();
    drag.current = {
      id, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top,
      active: false, frame: 0,
      timer: setTimeout(() => {
        const d = drag.current;
        if (!d) return;
        d.active = true;
        try { el.setPointerCapture(pointerId); } catch { /* pointer gone */ }
        navigator.vibrate?.(8);
        setDragging({ id, w: r.width, h: r.height });
        requestAnimationFrame(moveGhost);
        d.frame = requestAnimationFrame(tick);
      }, HOLD_MS),
    };
  };

  const onRootMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (!d.active) {
      // Moving first means scrolling, not picking up.
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8) { clearTimeout(d.timer); drag.current = null; }
      return;
    }
    e.preventDefault();
    moveGhost();
    setTarget(findDrop(d.x, d.y));
  };

  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return null;
    clearTimeout(d.timer);
    cancelAnimationFrame(d.frame);
    if (!d.active) return null;
    droppedAt.current = stamp();
    const t = dropRef.current;
    dropRef.current = null;
    setDrop(null);
    setDragging(null);
    return t ? { id: d.id, ...t } : null;
  };

  /** The browser took the pointer (a scroll, a system gesture): the task goes back where it was. */
  const onRootCancel = () => { endDrag(); };

  const onRootUp = () => {
    const t = endDrag();
    if (!t) return;
    const task = card.tasks[t.id];
    if (!task || task.deleted) return;
    const list = tasksIn(card, t.col).filter((x) => x.id !== t.id);
    const at = t.before ? list.findIndex((x) => x.id === t.before) : list.length;
    const prev = list[at - 1];
    const next = list[at];
    if (task.column === t.col) {
      // Dropped back where it was: nothing to send.
      const original = tasksIn(card, t.col);
      const i = original.findIndex((x) => x.id === t.id);
      if (original[i - 1]?.id === prev?.id && original[i + 1]?.id === next?.id) return;
    }
    const order = prev && next ? (prev.order + next.order) / 2 : prev ? endOrder(list) : next ? next.order - GAP : stamp();
    cardOp(message, { kind: "task.update", id: t.id, patch: { column: t.col, order }, at: stamp() });
    if (task.column !== t.col) ui.toast(`Moved to ${card.columns.find((c) => c.id === t.col)?.name}`);
  };

  const draggingTask = dragging ? card.tasks[dragging.id] : null;

  return (
    <div
      ref={rootRef}
      className={`${s.board} ${leaving ? s.boardLeaving : ""} ${dragging ? s.boardDragging : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Board: ${card.name}`}
      tabIndex={-1}
      onPointerMove={onRootMove}
      onPointerUp={onRootUp}
      onPointerCancel={onRootCancel}
    >
      <StatusBar />
      <header className={s.head}>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={() => close()} aria-label="Back to chat">
          <IconBack />
        </button>
        <div className={s.headTitle}>
          <button
            className={`${s.headName} ${s.headSwitch} ${styles.glass}`}
            onClick={() => setPicking((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={picking}
            aria-label={`${card.name}. Switch board`}
          >
            <IconBoard size={15} /><span>{card.name}</span><IconChevronDown size={14} />
          </button>
          <span className={s.headSub}>
            {openCount} open · {live.length - openCount} done{boards.length > 1 ? ` · ${boards.length} boards` : ""}
          </span>
        </div>
        <button className={`${styles.circleBtn} ${styles.glass}`} onClick={addGroup} aria-label="New group">
          <IconPlus />
        </button>
      </header>

      {/* One tap-away layer for whichever menu is open, over the whole board. */}
      {menu && <div className={s.pickScrim} onClick={() => setMenu(null)} aria-hidden="true" />}
      {picking && (
        <>
          <div
            className={`${s.picker} ${styles.glassStrong}`}
            role="menu"
            aria-label="Boards in this chat"
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setPicking(false); } }}
          >
            <p className={s.pickLabel}>Boards in this chat</p>
            {[...boards].reverse().map((b) => {
              const n = boardCounts(b.card);
              const on = b.id === message.id;
              return (
                <button
                  key={b.id}
                  role="menuitemradio"
                  aria-checked={on}
                  className={`${s.pickRow} ${on ? s.pickOn : ""}`}
                  onClick={() => { setPicking(false); if (!on) onSwitch(b.id); }}
                  autoFocus={on}
                >
                  <span className={s.pickIcon}><IconBoard size={16} /></span>
                  <span className={s.pickText}><b>{b.card.name}</b><small>{n.open} open · {n.total - n.open} done</small></span>
                  {on && <IconCheck size={16} />}
                </button>
              );
            })}
            <button role="menuitem" className={`${s.pickRow} ${s.pickNew}`} onClick={() => { setPicking(false); onNew(); }}>
              <span className={s.pickIcon}><IconPlus size={16} /></span>
              <span className={s.pickText}><b>New board</b><small>Another project in this chat</small></span>
            </button>
          </div>
        </>
      )}

      {/* Groups stack top to bottom (To do, then Doing, then Done) and the board scrolls as one. */}
      <div className={s.columns} ref={scrollRef}>
        {card.columns.map((col, ci) => {
          const list = tasksIn(card, col.id);
          const isDone = col.id === done;
          const target = drop?.col === col.id ? drop : null;
          return (
            <section key={col.id} className={`${s.column} ${target ? s.columnInto : ""}`} data-col={col.id} aria-label={col.name}>
              <ColumnHead
                name={col.name}
                count={list.length}
                renameNow={renaming === col.id}
                canDelete={card.columns.length > 1}
                menuOpen={menu === col.id}
                onMenu={(open) => setMenu(open ? col.id : null)}
                onRename={(name) => cardOp(message, { kind: "column.rename", id: col.id, name })}
                onRenamed={() => setRenaming(null)}
                onDelete={() => removeGroup(col.id)}
              />
              <div className={s.colBody}>
                {list.map((t) => (
                  <div
                    key={t.id}
                    data-task={t.id}
                    className={[
                      s.task,
                      dragging?.id === t.id ? s.taskSource : "",
                      target?.before === t.id ? s.dropAbove : "",
                    ].filter(Boolean).join(" ")}
                    role="button"
                    tabIndex={0}
                    aria-label={`${t.title}${t.assignee ? `, ${t.assignee === me ? "yours" : userById(t.assignee).name}` : ""}${t.due !== null && !isDone ? `, due ${dueInfo(t.due, now).label}` : ""}. Open task`}
                    onPointerDown={(e) => onTaskDown(e, t.id)}
                    onClick={() => {
                      if (stamp() - droppedAt.current < 400) return;
                      openTask(t);
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                      e.preventDefault();
                      openTask(t);
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {/* No button inside the tile (it's a button itself); the task sheet has "Show in chat". */}
                    <TaskBody task={t} now={now} done={isDone} />
                  </div>
                ))}
                {target && target.before === null && <div className={s.dropEnd} aria-hidden="true" />}
                {!list.length && !target && (
                  <p className={s.empty}>{isDone ? "Finished tasks land here." : ci === 0 ? "Nothing here yet. Add the first task below." : "Hold a task and drag it here."}</p>
                )}
              </div>
              <AddTask
                open={adding === col.id}
                first={ci === 0}
                onOpen={() => setAdding(col.id)}
                onClose={() => setAdding((a) => (a === col.id ? null : a))}
                onAdd={(text) => addTo(col.id, text)}
              />
            </section>
          );
        })}
      </div>

      {dragging && draggingTask && (
        <div ref={ghostRef} className={`${s.task} ${s.ghost}`} style={{ width: dragging.w, minHeight: dragging.h }} aria-hidden="true">
          <TaskBody task={draggingTask} now={now} done={draggingTask.column === done} />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Make a task from a message
--------------------------------------------------------------------------- */

function titleFrom(message: Message, me: string) {
  if (message.card) return openState(message, me)?.title ?? stripFormatting(message.body);
  const line = stripFormatting(message.body).split("\n").map((l) => l.trim()).find(Boolean);
  if (line) return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line;
  if (message.kind === "voice") return `Voice note from ${message.authorId === me ? "you" : userById(message.authorId).name}`;
  const first = message.attachments[0];
  return first ? (first.kind === "image" ? "Look at the photos" : first.name) : "";
}

/** "Make a task" from a message: title prefilled from the message, pick who and when. */
export function TaskFromMessage({ message, chat, onClose }: { message: Message; chat: Chat; onClose: () => void }) {
  const { me } = useChat();
  const ui = useChatUi();
  const [title, setTitle] = useState(() => titleFrom(message, me));
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState<number | null>(null);
  const people = peopleOf(chat.memberIds, me);
  const author = message.authorId === me ? "You" : userById(message.authorId).name;
  const quote = stripFormatting(message.body).replace(/\s+/g, " ").trim();
  const add = () => ui.addTask({ title: title.trim(), assignee, due, fromMessageId: message.id });

  return (
    <Sheet title="Make a task" onClose={onClose} action={{ label: "Add task", disabled: !title.trim(), onClick: add }}>
      {(close) => (
        <>
          <input
            className={styles.bigInput}
            data-autofocus
            value={title}
            placeholder="What needs doing?"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) close(add); }}
            aria-label="Task title"
          />
          {quote && (
            <p className={s.source}><b>{author}</b> {quote}</p>
          )}
          <p className={styles.sheetLabel}>Assignee</p>
          <AssigneePicker people={people} me={me} value={assignee} onChange={setAssignee} />
          <p className={styles.sheetLabel}>Due</p>
          <DuePicker value={due} onChange={setDue} />
          <p className={styles.sheetNote}>It goes on this chat’s board, linked back to the message.</p>
        </>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------------
   Your tasks, across every board (Dashboard)
--------------------------------------------------------------------------- */

const MINE_SHOWN = 4;

/** Everything assigned to you, across every chat's board (on the Dashboard). */
export function MyTasks({ onOpenChat }: { onOpenChat: (chat: Chat) => void }) {
  const { state, me } = useChat();
  const now = useNow(60_000);
  const [all, setAll] = useState(false);

  const items = useMemo(() => {
    const out: { task: Task; chat: Chat; board: string; label: string }[] = [];
    for (const chat of state.data.chats) {
      if (!chat.memberIds.includes(me)) continue;
      const label = chatIdentity(chat, me, userById).label;
      for (const board of projectsOf(state.data.messages[chat.id] ?? [])) {
        const done = doneColumn(board.card);
        for (const task of Object.values(board.card.tasks)) {
          if (!task.deleted && task.column !== done && task.assignee === me) out.push({ task, chat, board: board.card.name, label });
        }
      }
    }
    return out.sort((a, b) => byDue(a.task, b.task));
  }, [state.data.chats, state.data.messages, me]);

  const shown = all ? items : items.slice(0, MINE_SHOWN);

  return (
    <section className={s.mine} aria-labelledby="my-tasks-title">
      <p className={s.mineHead}>
        <span id="my-tasks-title">Your tasks</span>
        {items.length > 0 && <em>{items.length}</em>}
      </p>
      {items.length === 0 ? (
        <p className={s.mineHint}>Tasks assigned to you in any chat show up here.</p>
      ) : (
        <div className={s.mineList}>
          {shown.map(({ task, chat, board, label }) => (
            <button key={`${chat.id}-${task.id}`} className={s.mineRow} onClick={() => onOpenChat(chat)}>
              <span className={s.mineDot} aria-hidden="true" />
              <span className={s.mineText}>
                <b>{task.title}</b>
                <small>{label === board ? label : `${label} · ${board}`}</small>
              </span>
              {task.due !== null && <DueChip due={task.due} now={now} />}
            </button>
          ))}
          {items.length > MINE_SHOWN && (
            <button className={s.mineMore} onClick={() => setAll((v) => !v)} aria-expanded={all}>
              {all ? "Show fewer" : `Show all ${items.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
