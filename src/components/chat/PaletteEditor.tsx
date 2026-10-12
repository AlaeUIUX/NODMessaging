"use client";

import { useEffect, useRef, useState } from "react";
import { another, between, colorName, generate, inkOn, MAX_COLORS, MIN_COLORS, normalHex, swatchId, type Swatch } from "@/lib/chat/palette";
import { IconCheck, IconClose, IconCopy, IconPadlock, IconPadlockOpen, IconPlus, IconRedo, IconShuffle, IconUndo } from "./Icons";
import f from "./mindfields.module.css";

/**
 * Making a palette the way Coolors works. Every colour is a band: tap its
 * code to change it, lock it to keep it, copy it, or take it out. Generate
 * (or Space, on a keyboard) replaces every unlocked colour with ones that go
 * with the locked; + adds one (between two, on a computer: hover the palette).
 * Undo and redo step back and forward through everything, as far as you like.
 */
export default function PaletteEditor({ value, onChange }: { value: Swatch[]; onChange: (next: Swatch[]) => void }) {
  const [past, setPast] = useState<Swatch[][]>([]);
  const [future, setFuture] = useState<Swatch[][]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  /** The band whose colour picker is open: its first change is a step to undo, the rest refine it. */
  const editing = useRef<string | null>(null);

  const commit = (next: Swatch[]) => {
    setPast((list) => [...list.slice(-99), value]);
    setFuture([]);
    onChange(next);
  };
  const undo = () => {
    if (!past.length) return;
    setFuture((list) => [value, ...list]);
    setPast((list) => list.slice(0, -1));
    onChange(past[past.length - 1]);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((list) => [...list, value]);
    setFuture((list) => list.slice(1));
    onChange(future[0]);
  };
  const regenerate = () => commit(generate(value));
  const add = (at = value.length) => {
    if (value.length >= MAX_COLORS) return;
    const hex = at > 0 && at < value.length ? between(value[at - 1].hex, value[at].hex) : another(value.map((s) => s.hex));
    commit([...value.slice(0, at), { id: swatchId(), hex }, ...value.slice(at)]);
  };
  const remove = (id: string) => { if (value.length > MIN_COLORS) commit(value.filter((s) => s.id !== id)); };
  // A lock isn't a step: undo goes back through colours, and each palette keeps the locks it had.
  const lock = (id: string) => onChange(value.map((s) => (s.id === id ? { ...s, locked: !s.locked } : s)));
  const recolor = (id: string, hex: string) => {
    const next = value.map((s) => (s.id === id ? { ...s, hex: normalHex(hex) } : s));
    if (editing.current === id) onChange(next);
    else { editing.current = id; commit(next); }
  };
  const copy = async (s: Swatch) => {
    try { await navigator.clipboard.writeText(s.hex); } catch { return; }
    setCopied(s.id);
    setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 1200);
  };

  // Space generates, like Coolors; ⌘Z / ⇧⌘Z undo and redo. Never while typing, or on a button (Space presses it).
  const keys = useRef({ regenerate, undo, redo });
  useEffect(() => { keys.current = { regenerate, undo, redo }; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, button, [contenteditable='true']")) return;
      if (e.key === " " && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        keys.current.regenerate();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) keys.current.redo(); else keys.current.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={f.palette}>
      <div className={`${f.swatches} ${value.length > 6 ? f.swatchesDense : ""}`}>
        {value.map((s, i) => {
          const name = colorName(s.hex);
          return (
            <div key={s.id} className={`${f.swatch} ${s.locked ? f.swatchLocked : ""}`} style={{ background: s.hex, color: inkOn(s.hex) }}>
              <label className={f.swatchCode}>
                <b>{copied === s.id ? "Copied" : s.hex.slice(1)}</b>
                <small>{name}</small>
                <input
                  type="color"
                  value={s.hex.toLowerCase()}
                  onClick={() => { editing.current = null; }}
                  onChange={(e) => recolor(s.id, e.target.value)}
                  onBlur={() => { editing.current = null; }}
                  aria-label={`Change colour ${i + 1}, ${name} ${s.hex}`}
                />
              </label>
              <span className={f.swatchTools}>
                <button type="button" onClick={() => { void copy(s); }} aria-label={`Copy ${s.hex}`}>
                  {copied === s.id ? <IconCheck size={15} /> : <IconCopy size={15} />}
                </button>
                <button type="button" className={s.locked ? f.toolOn : undefined} onClick={() => lock(s.id)} aria-pressed={!!s.locked} aria-label={s.locked ? `Unlock ${s.hex}` : `Lock ${s.hex}`}>
                  {s.locked ? <IconPadlock size={16} /> : <IconPadlockOpen size={16} />}
                </button>
                <button type="button" onClick={() => remove(s.id)} disabled={value.length <= MIN_COLORS} aria-label={`Remove ${s.hex}`}>
                  <IconClose size={14} />
                </button>
              </span>
              {i > 0 && value.length < MAX_COLORS && (
                <button type="button" className={f.insert} onClick={() => add(i)} aria-label={`Add a colour between ${value[i - 1].hex} and ${s.hex}`}>
                  <IconPlus size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className={f.paletteBar}>
        <span className={f.barPair}>
          <button type="button" className={f.barIcon} onClick={undo} disabled={!past.length} aria-label="Undo"><IconUndo size={18} /></button>
          <button type="button" className={f.barIcon} onClick={redo} disabled={!future.length} aria-label="Redo"><IconRedo size={18} /></button>
        </span>
        <button type="button" className={f.generate} onClick={regenerate}><IconShuffle size={17} /> Generate</button>
        <button type="button" className={f.barIcon} onClick={() => add()} disabled={value.length >= MAX_COLORS} aria-label="Add a colour"><IconPlus size={18} /></button>
      </div>
      <p className={f.note}>Lock the colours you like, then generate the rest.<span className={f.onPointer}> Space works too.</span></p>
    </div>
  );
}
