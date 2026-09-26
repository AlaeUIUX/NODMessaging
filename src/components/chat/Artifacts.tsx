"use client";

import { useEffect, useRef, useState } from "react";
import { initials, TONES } from "@/lib/chat/avatar";
import { Emoji } from "@/lib/chat/emoji";
import { useChat, userById } from "@/lib/chat/store";
import type { Card, Message, SketchStroke } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconBrush, IconClose, IconGame, IconHeart, IconPlus, IconSparkles, IconUndo, IconWheel } from "./Icons";
import { Sheet, uid, useChatUi } from "./ui";
import styles from "./chat.module.css";

/**
 * Artifacts: small, playful apps that live inside a message. Each one is just
 * a card with shared state — every tap syncs as a whole-card replace, so they
 * work across tabs exactly like polls and checklists do.
 */

type Of<T extends Card["type"]> = Extract<Card, { type: T }>;
type Send = (card: Card, summary: string) => void;

const nameOf = (id: string, me: string) => (id === me ? "You" : userById(id).name);

function Faces({ ids }: { ids: string[] }) {
  return (
    <span className={styles.faces}>
      {ids.slice(0, 4).map((id) => {
        const u = userById(id);
        return <Avatar key={id} glyph={initials(u.fullName)} tone={u.tone} size={18} shape="circle" />;
      })}
    </span>
  );
}

/** Keeps pointer gestures inside an artifact from reaching the bubble (long-press, swipe-to-reply). */
const contain = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onPointerMove: (e: React.PointerEvent) => e.stopPropagation(),
  onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
  onContextMenu: (e: React.MouseEvent) => e.stopPropagation(),
};

/* ===========================================================================
   Doodle — a shared sketchpad everyone in the chat can draw on
   =========================================================================== */

const W = 300;
const H = 220;
export const INKS: Record<string, string> = {
  ink: "var(--ink)",
  red: "#E5484D",
  blue: "#0B68CB",
  green: "#30A46C",
  amber: "#F5A524",
};

/** Smooth a polyline through the midpoints of its segments. */
export function pathOf(pts: number[]) {
  if (pts.length < 4) return `M${pts[0]} ${pts[1]} l.01 0`;
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length - 2; i += 2) {
    d += ` Q${pts[i]} ${pts[i + 1]} ${(pts[i] + pts[i + 2]) / 2} ${(pts[i + 1] + pts[i + 3]) / 2}`;
  }
  return `${d} L${pts[pts.length - 2]} ${pts[pts.length - 1]}`;
}

export function SketchCard({ message, card, interactive }: { message: Message; card: Of<"sketch">; interactive: boolean }) {
  const { me, updateCard } = useChat();
  const svgRef = useRef<SVGSVGElement>(null);
  const [ink, setInk] = useState("ink");
  const [live, setLive] = useState<number[] | null>(null);
  const drawing = useRef<number[] | null>(null);
  const isOwner = message.authorId === me;
  const artists = [...new Set(card.strokes.map((s) => s.by))];
  const mine = card.strokes.filter((s) => s.by === me);

  const point = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return [+(((e.clientX - r.left) / r.width) * W).toFixed(1), +(((e.clientY - r.top) / r.height) * H).toFixed(1)];
  };
  const set = (fn: (c: Of<"sketch">) => Of<"sketch">) => updateCard(message, (c) => (c.type === "sketch" ? fn(c) : c));

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    e.stopPropagation();
    if (!interactive) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    drawing.current = point(e);
    setLive(drawing.current);
  };
  const move = (e: React.PointerEvent) => {
    e.stopPropagation();
    const pts = drawing.current;
    if (!pts) return;
    const [x, y] = point(e);
    const dx = x - pts[pts.length - 2];
    const dy = y - pts[pts.length - 1];
    if (dx * dx + dy * dy < 4) return;
    drawing.current = [...pts, x, y];
    setLive(drawing.current);
  };
  const up = (e: React.PointerEvent) => {
    e.stopPropagation();
    const pts = drawing.current;
    drawing.current = null;
    setLive(null);
    if (!pts) return;
    const stroke: SketchStroke = { id: uid(), by: me, color: ink, size: ink === "ink" ? 3.5 : 4.5, pts };
    set((c) => ({ ...c, strokes: [...c.strokes, stroke] }));
  };

  return (
    <div className={`${styles.card} ${styles.artifact}`}>
      <p className={styles.cardKicker}><span><IconBrush size={14} /> Doodle</span><span>Everyone can draw</span></p>
      <h4 className={styles.cardTitle}>{card.prompt}</h4>
      <svg
        ref={svgRef}
        className={`${styles.sketchPad} ${interactive ? styles.sketchLive : ""}`}
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        role="img"
        aria-label={`Shared doodle: ${card.prompt}`}
      >
        {card.strokes.map((s) => (
          <path key={s.id} className={styles.stroke} d={pathOf(s.pts)} stroke={INKS[s.color] ?? INKS.ink} strokeWidth={s.size} />
        ))}
        {live && <path className={styles.stroke} d={pathOf(live)} stroke={INKS[ink]} strokeWidth={ink === "ink" ? 3.5 : 4.5} />}
        {!card.strokes.length && !live && (
          <text x={W / 2} y={H / 2} className={styles.sketchHint} textAnchor="middle">{interactive ? "Draw here" : "Empty canvas"}</text>
        )}
      </svg>
      {interactive && (
        <div className={styles.sketchTools} {...contain}>
          <div className={styles.inks} role="radiogroup" aria-label="Pen colour">
            {Object.entries(INKS).map(([k, v]) => (
              <button
                key={k}
                role="radio"
                aria-checked={ink === k}
                aria-label={k}
                className={`${styles.inkDot} ${ink === k ? styles.inkOn : ""}`}
                style={{ ["--ink-c" as string]: v }}
                onClick={() => setInk(k)}
              />
            ))}
          </div>
          <button
            className={`${styles.toolChip} ${styles.toolIcon}`}
            aria-label="Undo my last stroke"
            title="Undo"
            disabled={!mine.length}
            onClick={() => set((c) => {
              const last = [...c.strokes].reverse().find((s) => s.by === me);
              return last ? { ...c, strokes: c.strokes.filter((s) => s.id !== last.id) } : c;
            })}
          >
            <IconUndo size={16} />
          </button>
          {isOwner && card.strokes.length > 0 && (
            <button className={styles.toolChip} onClick={() => set((c) => ({ ...c, strokes: [] }))}>Clear</button>
          )}
        </div>
      )}
      <div className={styles.cardFoot}>
        {artists.length ? <><Faces ids={artists} /><span>{artists.map((id) => nameOf(id, me)).join(", ")}</span></> : <span>No one has drawn yet</span>}
        <span className={styles.cardMuted}>{card.strokes.length} {card.strokes.length === 1 ? "stroke" : "strokes"}</span>
      </div>
    </div>
  );
}

const PROMPTS = ["Draw our weekend", "Guess my mood", "Sign Reema's birthday card", "The launch, in one picture", "Redesign our logo"];

export function SketchBuilder({ onSend, onClose }: { onSend: Send; onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  return (
    <Sheet
      title="New doodle"
      onClose={onClose}
      action={{
        label: "Send",
        disabled: !prompt.trim(),
        onClick: () => onSend({ type: "sketch", prompt: prompt.trim(), strokes: [] }, `Doodle: ${prompt.trim()}`),
      }}
    >
      <input className={styles.bigInput} autoFocus placeholder="What are we drawing?" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <p className={styles.sheetLabel}>Ideas</p>
      <div className={styles.chipGrid}>
        {PROMPTS.map((p) => (
          <button key={p} className={`${styles.choice} ${prompt === p ? styles.choiceOn : ""}`} onClick={() => setPrompt(p)}>{p}</button>
        ))}
      </div>
      <p className={styles.sheetNote}>Everyone in the chat can draw on it. You can clear it; each person can undo their own strokes.</p>
    </Sheet>
  );
}

/* ===========================================================================
   Tic-tac-toe — challenge anyone; the first person to answer plays O
   =========================================================================== */

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function outcome(board: (string | null)[]) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a]!, line };
  }
  return board.every(Boolean) ? { winner: "draw" as const, line: [] as number[] } : null;
}

/** A friendly opponent: wins when it can, blocks when it must, and sometimes just plays. */
function botMove(board: (string | null)[], bot: string, human: string) {
  const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const finishing = (who: string) => empty.find((i) => {
    const next = [...board];
    next[i] = who;
    return outcome(next)?.winner === who;
  });
  const win = finishing(bot);
  if (win !== undefined) return win;
  if (Math.random() < 0.8) {
    const block = finishing(human);
    if (block !== undefined) return block;
  }
  if (!board[4] && Math.random() < 0.7) return 4;
  return empty[Math.floor(Math.random() * empty.length)];
}

export function TicTacToeCard({ message, card, interactive }: { message: Message; card: Of<"tictactoe">; interactive: boolean }) {
  const { me, peers, updateCard } = useChat();
  const ui = useChatUi();
  const [x, o] = card.players;
  const moves = card.board.filter(Boolean).length;
  const turn = moves % 2 === 0 ? x : o;
  const result = outcome(card.board);
  const opponent = o ?? ui.chat.memberIds.find((id) => id !== x) ?? null;
  const set = (fn: (c: Of<"tictactoe">) => Of<"tictactoe">) => updateCard(message, (c) => (c.type === "tictactoe" ? fn(c) : c));

  const canPlay = (i: number) => {
    if (!interactive || result || card.board[i]) return false;
    if (moves % 2 === 0) return me === x;
    return o === null ? me !== x : me === o;
  };
  const play = (i: number) => {
    if (!canPlay(i)) return;
    set((c) => {
      const board = [...c.board];
      const joining = c.players[1] === null && me !== c.players[0];
      board[i] = me;
      return { ...c, board, players: joining ? [c.players[0], me] : c.players };
    });
  };

  // With nobody else online, the other person in the chat plays back.
  const bot = !peers.length && interactive && me === x && opponent && opponent !== me ? opponent : null;
  const botsTurn = !!bot && !result && moves % 2 === 1;
  const boardKey = card.board.map((v) => v ?? "-").join("");
  useEffect(() => {
    if (!botsTurn || !bot) return;
    const t = setTimeout(() => {
      set((c) => {
        if (outcome(c.board) || c.board.filter(Boolean).length % 2 === 0) return c;
        const board = [...c.board];
        board[botMove(c.board, bot, c.players[0])] = bot;
        return { ...c, board, players: [c.players[0], bot] };
      });
    }, 900 + Math.random() * 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botsTurn, boardKey]);

  const status = result
    ? result.winner === "draw" ? "It's a draw" : `${nameOf(result.winner, me)} ${result.winner === me ? "win" : "wins"}!`
    : turn === null ? (me === x ? "Waiting for someone to join…" : "Tap a square to join as O")
    : turn === me ? "Your move"
    : `${nameOf(turn, me)} ${bot && turn === bot ? "is thinking…" : "to move"}`;

  return (
    <div className={`${styles.card} ${styles.artifact}`}>
      <p className={styles.cardKicker}><span><IconGame size={14} /> Tic-tac-toe</span></p>
      <h4 className={styles.cardTitle}>
        {nameOf(x, me)} <em className={styles.vs}>vs</em> {o ? nameOf(o, me) : "anyone"}
      </h4>
      <div className={styles.ttt} {...contain} role="grid" aria-label="Tic-tac-toe board">
        {card.board.map((v, i) => (
          <button
            key={i}
            className={`${styles.tttCell} ${result?.line.includes(i) ? styles.tttWin : ""}`}
            onClick={() => play(i)}
            disabled={!canPlay(i)}
            aria-label={v ? `${v === x ? "X" : "O"} by ${nameOf(v, me)}` : `Square ${i + 1}`}
          >
            {v === x && <svg viewBox="0 0 40 40" className={styles.markX}><path d="M10 10 L30 30" /><path d="M30 10 L10 30" /></svg>}
            {v && v !== x && <svg viewBox="0 0 40 40" className={styles.markO}><circle cx="20" cy="20" r="11" /></svg>}
          </button>
        ))}
      </div>
      <div className={styles.cardFoot}>
        <span className={turn === me && !result ? styles.yourTurn : undefined}>{status}</span>
        {result && interactive && (card.players.includes(me)) && (
          <button
            className={styles.cardLink}
            onClick={() => set((c) => ({ ...c, board: Array(9).fill(null), players: c.players[1] ? [c.players[1], c.players[0]] : c.players }))}
          >
            Rematch
          </button>
        )}
      </div>
    </div>
  );
}

/* ===========================================================================
   Decision wheel — "where do we eat?", settled by physics instead of debate
   =========================================================================== */

const WHEEL_TONES = [TONES.denim, TONES.clay, TONES.sage, TONES.ochre, TONES.plum, "#4E7C8A", "#B0664F", "#6B6A9A"];

export function WheelCard({ message, card, interactive }: { message: Message; card: Of<"wheel">; interactive: boolean }) {
  const { me, updateCard } = useChat();
  const n = card.options.length;
  const slice = 360 / n;
  const last = card.spins[card.spins.length - 1];

  // Each spin lands its slice under the pointer, after a few full turns.
  const rotation = last
    ? card.spins.length * 5 * 360 - (last.index + 0.5) * slice + ((last.at % 13) / 13 - 0.5) * slice * 0.6
    : 0;

  const [seen, setSeen] = useState(card.spins.length);
  const [spinning, setSpinning] = useState(false);
  if (seen !== card.spins.length) {
    setSeen(card.spins.length);
    setSpinning(true);
  }

  const spin = () => {
    if (!interactive || spinning) return;
    updateCard(message, (c) => (c.type === "wheel"
      ? { ...c, spins: [...c.spins, { by: me, index: Math.floor(Math.random() * c.options.length), at: Date.now() }] }
      : c));
  };

  const r = 100;
  const arc = (i: number) => {
    const a0 = ((i * slice - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * slice - 90) * Math.PI) / 180;
    const large = slice > 180 ? 1 : 0;
    return `M0 0 L${r * Math.cos(a0)} ${r * Math.sin(a0)} A${r} ${r} 0 ${large} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`;
  };

  return (
    <div className={`${styles.card} ${styles.artifact}`}>
      <p className={styles.cardKicker}><span><IconWheel size={14} /> Decision wheel</span><span>{n} options</span></p>
      <h4 className={styles.cardTitle}>{card.question}</h4>
      <div className={styles.wheelWrap} {...contain}>
        <span className={styles.wheelPointer} aria-hidden="true" />
        <svg
          viewBox="-104 -104 208 208"
          className={styles.wheel}
          style={{ transform: `rotate(${rotation}deg)` }}
          onTransitionEnd={() => setSpinning(false)}
          aria-hidden="true"
        >
          {card.options.map((opt, i) => {
            const mid = (i + 0.5) * slice;
            return (
              <g key={i}>
                <path d={arc(i)} fill={WHEEL_TONES[i % WHEEL_TONES.length]} />
                <text
                  transform={`rotate(${mid - 90}) translate(${r * 0.58} 0)`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={styles.wheelText}
                >
                  {opt.length > 11 ? `${opt.slice(0, 10)}…` : opt}
                </text>
              </g>
            );
          })}
          <circle r={r} className={styles.wheelRim} />
        </svg>
        <button className={styles.wheelHub} onClick={spin} disabled={!interactive || spinning} aria-label="Spin the wheel">
          {spinning ? "…" : "Spin"}
        </button>
      </div>
      <div className={styles.cardFoot}>
        {last && !spinning ? (
          <span className={styles.wheelResult} key={card.spins.length}>
            <b>{card.options[last.index]}</b> · spun by {nameOf(last.by, me)}
          </span>
        ) : (
          <span>{spinning ? "Round and round…" : "Nobody has spun yet"}</span>
        )}
        {card.spins.length > 1 && !spinning && <span className={styles.cardMuted}>{card.spins.length} spins</span>}
      </div>
    </div>
  );
}

const WHEEL_IDEAS: { q: string; options: string[] }[] = [
  { q: "Where do we eat?", options: ["Sushi Sora", "Tacos", "Pizza Nova", "Ramen", "Salad bar"] },
  { q: "Who presents the demo?", options: ["Charles", "Jamshad", "Reema", "Salman", "Alae"] },
  { q: "Friday team activity", options: ["Bowling", "Karaoke", "Board games", "Escape room"] },
];

export function WheelBuilder({ onSend, onClose }: { onSend: Send; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState([{ id: uid(), label: "" }, { id: uid(), label: "" }]);
  const filled = options.filter((o) => o.label.trim());
  const valid = question.trim() && filled.length >= 2;

  return (
    <Sheet
      title="Decision wheel"
      onClose={onClose}
      action={{
        label: "Send",
        disabled: !valid,
        onClick: () => onSend({ type: "wheel", question: question.trim(), options: filled.map((o) => o.label.trim()), spins: [] }, `Wheel: ${question.trim()}`),
      }}
    >
      <input className={styles.bigInput} autoFocus placeholder="What are we deciding?" value={question} onChange={(e) => setQuestion(e.target.value)} />
      <div className={styles.chipGrid}>
        {WHEEL_IDEAS.map((idea) => (
          <button
            key={idea.q}
            className={styles.choice}
            onClick={() => { setQuestion(idea.q); setOptions(idea.options.map((label) => ({ id: uid(), label }))); }}
          >
            {idea.q}
          </button>
        ))}
      </div>
      <p className={styles.sheetLabel}>Slices</p>
      <div className={styles.fieldStack}>
        {options.map((o, i) => (
          <div key={o.id} className={styles.optionField}>
            <span className={styles.optionDot} style={{ background: WHEEL_TONES[i % WHEEL_TONES.length], boxShadow: "none" }} />
            <input
              placeholder={`Option ${i + 1}`}
              value={o.label}
              onChange={(e) => setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))}
              onKeyDown={(e) => { if (e.key === "Enter" && options.length < 8) setOptions((prev) => [...prev, { id: uid(), label: "" }]); }}
            />
            {options.length > 2 && (
              <button onClick={() => setOptions((prev) => prev.filter((x) => x.id !== o.id))} aria-label="Remove option"><IconClose size={14} /></button>
            )}
          </div>
        ))}
        {options.length < 8 && (
          <button className={styles.addRow} onClick={() => setOptions((prev) => [...prev, { id: uid(), label: "" }])}>
            <IconPlus size={16} /> Add a slice
          </button>
        )}
      </div>
    </Sheet>
  );
}

/* ===========================================================================
   Gallery — what ships today, and what the community could build next
   =========================================================================== */

export type ArtifactKind = "sketch" | "tictactoe" | "wheel";

const READY: { kind: ArtifactKind; name: string; blurb: string; icon: React.ReactNode; tone: string }[] = [
  { kind: "sketch", name: "Doodle", blurb: "A shared sketchpad the whole chat draws on.", icon: <IconBrush size={20} />, tone: TONES.clay },
  { kind: "tictactoe", name: "Tic-tac-toe", blurb: "Challenge anyone; the first to answer plays.", icon: <IconGame size={20} />, tone: TONES.denim },
  { kind: "wheel", name: "Decision wheel", blurb: "Spin to settle it. Everyone sees it land.", icon: <IconWheel size={20} />, tone: TONES.sage },
];

const CONCEPTS: { name: string; by: string; blurb: string; emoji: string; votes: number }[] = [
  { name: "Split the bill", by: "@reema", blurb: "Snap the receipt, tap what you had, everyone gets their share.", emoji: "🧾", votes: 214 },
  { name: "Pictionary relay", by: "@mika.draws", blurb: "One person draws, the chat guesses, points on a leaderboard.", emoji: "🎨", votes: 187 },
  { name: "Countdown", by: "@jamshad", blurb: "A shared countdown to launch day, with confetti at zero.", emoji: "⏳", votes: 142 },
  { name: "Team pulse", by: "@salman", blurb: "A weekly anonymous mood check-in, with the trend over time.", emoji: "📈", votes: 128 },
  { name: "Hot-take meter", by: "@theo", blurb: "Slide how spicy an opinion is and see where the group lands.", emoji: "🌶️", votes: 96 },
  { name: "Trivia duel", by: "@quizqueen", blurb: "Five quick questions on any topic; best score takes the crown.", emoji: "🏆", votes: 83 },
  { name: "Async stand-up", by: "@charles", blurb: "Three prompts for everyone, one tidy summary for the lead.", emoji: "☀️", votes: 71 },
];

export function ArtifactGallery({ onPick, onClose }: { onPick: (k: ArtifactKind) => void; onClose: () => void }) {
  const [voted, setVoted] = useState<string[]>([]);
  return (
    <Sheet title="Artifacts" onClose={onClose}>
      {(close) => (
        <>
          <div className={styles.galleryHero}>
            <span className={styles.galleryBadge}><IconSparkles size={16} /></span>
            <p>Little apps that live inside a message. Built by NOD today, and by the community next.</p>
          </div>

          <p className={styles.sheetLabel}>Ready to play</p>
          <div className={styles.listGroup}>
            {READY.map((a) => (
              <button key={a.kind} className={styles.actionRow} onClick={() => close(() => onPick(a.kind))}>
                <span className={styles.actionIcon} style={{ background: a.tone, color: "#fff" }}>{a.icon}</span>
                <span className={styles.contactText}><b>{a.name}</b><small>{a.blurb}</small></span>
                <span className={styles.addPill}>Add</span>
              </button>
            ))}
          </div>

          <p className={styles.sheetLabel}>From the community · coming soon</p>
          <div className={styles.listGroup}>
            {CONCEPTS.map((c) => {
              const on = voted.includes(c.name);
              return (
                <div key={c.name} className={styles.actionRow}>
                  <span className={styles.conceptEmoji}><Emoji char={c.emoji} /></span>
                  <span className={styles.contactText}><b>{c.name} <em>{c.by}</em></b><small>{c.blurb}</small></span>
                  <button
                    className={`${styles.voteBtn} ${on ? styles.voteOn : ""}`}
                    onClick={() => setVoted((v) => (on ? v.filter((x) => x !== c.name) : [...v, c.name]))}
                    aria-pressed={on}
                    aria-label={`Want ${c.name}`}
                  >
                    <IconHeart size={14} /> {c.votes + (on ? 1 : 0)}
                  </button>
                </div>
              );
            })}
          </div>
          <p className={styles.sheetNote}>
            Artifacts are tiny web apps with shared state. Publish one, and anyone can drop it into a chat.
          </p>
        </>
      )}
    </Sheet>
  );
}
