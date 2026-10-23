"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { modifiedAt, tagsOf, type Block, type BlockKind } from "@/lib/chat/mind";
import { IconCheck, IconClose, IconFilter, IconMore, IconSearch } from "./Icons";
import { KIND_LABEL } from "./MindBlocks";
import type { HoldAction } from "./MindHold";
import { useDialog } from "./ui";
import styles from "./chat.module.css";

/**
 * Finding your way around a collection once it gets big: a search
 * that looks only inside it, a filter (by tag, by when it last changed, by
 * kind) and the "…" menu, side by side at the top right. Tags aren't places:
 * they're your own words on each item, the same #tag in every collection, so
 * the filter offers the tags found here and Mind's search finds them anywhere.
 */

export type Since = "any" | "today" | "week" | "month";
export interface MindFilter { tags: string[]; kinds: BlockKind[]; since: Since }
export const NO_FILTER: MindFilter = { tags: [], kinds: [], since: "any" };
export const isFiltering = (f: MindFilter) => f.tags.length > 0 || f.kinds.length > 0 || f.since !== "any";

const DAY = 86_400_000;
const SINCE: { id: Since; label: string }[] = [
  { id: "any", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "week", label: "Past 7 days" },
  { id: "month", label: "Past 30 days" },
];
function sinceMs(s: Since) {
  if (s === "today") { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  return s === "week" ? Date.now() - 7 * DAY : s === "month" ? Date.now() - 30 * DAY : 0;
}

/** Whether an item stays in view: any of the picked tags, any of the picked kinds, changed recently enough. */
export function passes(f: MindFilter, b: Block) {
  if (f.tags.length && !f.tags.some((t) => (b.tags ?? []).includes(t))) return false;
  if (f.kinds.length && !f.kinds.includes(b.kind)) return false;
  return f.since === "any" || modifiedAt(b) >= sinceMs(f.since);
}

/** Search, Filter and More in one glass capsule, where a chat has its call and board buttons. */
export function ScopeTools({ searching, filtering, moreLabel, onSearch, onFilter, onMore }: {
  searching: boolean;
  filtering: boolean;
  moreLabel: string;
  onSearch: () => void;
  onFilter: (anchor: HTMLElement) => void;
  onMore: (anchor: HTMLElement) => void;
}) {
  return (
    <div className={`${styles.mindTools} ${styles.glass}`}>
      <button className={searching ? styles.mindToolOn : undefined} onClick={onSearch} aria-label="Search in here" aria-pressed={searching}><IconSearch size={18} /></button>
      <button className={filtering ? styles.mindToolOn : undefined} onClick={(e) => onFilter(e.currentTarget)} aria-label={filtering ? "Filter, on" : "Filter"} aria-haspopup="menu">
        <IconFilter size={18} />
        {filtering && <i className={styles.mindToolDot} aria-hidden="true" />}
      </button>
      <button onClick={(e) => onMore(e.currentTarget)} aria-label={moreLabel} aria-haspopup="menu"><IconMore size={18} /></button>
    </div>
  );
}

/** A field under the header that searches only what's in here; Cancel puts the page back. */
export function ScopeSearch({ value, placeholder, onChange, onCancel }: { value: string; placeholder: string; onChange: (v: string) => void; onCancel: () => void }) {
  return (
    <div className={styles.mindScopeSearch}>
      <label className={styles.searchBar}>
        <IconSearch size={16} />
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
          placeholder={placeholder}
          enterKeyHint="search"
        />
        {value && <button className={styles.mindClear} onClick={() => onChange("")} aria-label="Clear search"><IconClose size={14} /></button>}
      </label>
      <button className={styles.mindSearchDone} onClick={onCancel}>Cancel</button>
    </div>
  );
}

/** A menu hanging from a button at the top right, the way iOS pulls one down. A tap outside closes it. */
export function AnchorMenu({ anchor, label, onClose, children }: {
  anchor: HTMLElement;
  label: string;
  onClose: () => void;
  children: (close: (after?: () => void) => void) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; right: number; maxHeight: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const done = useRef(false);
  useLayoutEffect(() => {
    const host = rootRef.current?.getBoundingClientRect();
    if (!host) return;
    const r = anchor.getBoundingClientRect();
    const top = r.bottom - host.top + 8;
    setPlace({ top, right: Math.max(8, host.right - r.right), maxHeight: Math.max(160, host.height - top - 28) });
  }, [anchor]);
  const close = (after?: () => void) => {
    if (done.current) return;
    done.current = true;
    setClosing(true);
    setTimeout(() => { onClose(); after?.(); }, 160);
  };
  useDialog(rootRef, () => close());
  return (
    <div ref={rootRef} className={`${styles.overlay} ${closing ? styles.closing : ""}`} role="dialog" aria-modal="true" aria-label={label}>
      <div className={styles.mindMenuScrim} onClick={() => close()} />
      {place && (
        <div className={`${styles.menu} ${styles.glassStrong} ${styles.mindMenu}`} style={place} role="menu">
          {/* `close` reads its ref only when called from an event handler, never while rendering (as in Sheet). */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {children(close)}
        </div>
      )}
    </div>
  );
}

/** The "…" menu: the same actions as holding the thing, minus Open (it's already open). */
export function ActionMenu({ anchor, title, actions, onClose }: { anchor: HTMLElement; title: ReactNode; actions: HoldAction[]; onClose: () => void }) {
  return (
    <AnchorMenu anchor={anchor} label={typeof title === "string" ? title : "Actions"} onClose={onClose}>
      {(close) => (
        <>
          <p className={styles.mindHoldTitle}>{title}</p>
          {actions.map((a, i) => a === "sep"
            ? <div key={`sep-${i}`} className={styles.menuSep} />
            : (
              <button key={a.id} role="menuitem" className={`${styles.menuItem} ${a.danger ? styles.danger : ""}`} onClick={() => close(a.run)}>
                {a.label}
                {a.icon}
              </button>
            ))}
        </>
      )}
    </AnchorMenu>
  );
}

/**
 * What to keep in view: tags (any of them), when it last changed, what kind it
 * is. It stays open while you pick, and shows only what's actually in here.
 */
export function FilterMenu({ anchor, items, filter, onChange, onClose }: {
  anchor: HTMLElement;
  /** Everything in scope, to offer only the tags and kinds there are. */
  items: Block[];
  filter: MindFilter;
  onChange: (f: MindFilter) => void;
  onClose: () => void;
}) {
  // The menu was opened with the filter as it was; it keeps its own copy in step from here.
  const [f, setF] = useState(filter);
  const set = (next: MindFilter) => { setF(next); onChange(next); };
  const flip = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const tags = tagsOf(items);
  const kinds = [...new Set(items.map((b) => b.kind))].sort((a, b) => KIND_LABEL[a].localeCompare(KIND_LABEL[b]));
  const option = (key: string, label: ReactNode, on: boolean, run: () => void) => (
    <button key={key} role="menuitemcheckbox" aria-checked={on} className={`${styles.menuItem} ${styles.mindMenuOpt}`} onClick={run}>
      <span>{label}</span>
      {on ? <IconCheck size={16} /> : null}
    </button>
  );
  return (
    <AnchorMenu anchor={anchor} label="Filter" onClose={onClose}>
      {() => (
        <>
          <p className={styles.mindMenuHead}>Tags</p>
          {tags.length
            ? tags.map((t) => option(`t:${t}`, `#${t}`, f.tags.includes(t), () => set({ ...f, tags: flip(f.tags, t) })))
            : <p className={styles.mindMenuNote}>No tags in here yet. Add them when you make something, or from its page.</p>}
          <div className={styles.menuSep} />
          <p className={styles.mindMenuHead}>Modified</p>
          {SINCE.map((s) => option(`s:${s.id}`, s.label, f.since === s.id, () => set({ ...f, since: s.id })))}
          {kinds.length > 1 && (
            <>
              <div className={styles.menuSep} />
              <p className={styles.mindMenuHead}>Type</p>
              {kinds.map((k) => option(`k:${k}`, KIND_LABEL[k], f.kinds.includes(k), () => set({ ...f, kinds: flip(f.kinds, k) })))}
            </>
          )}
          {isFiltering(f) && (
            <>
              <div className={styles.menuSep} />
              <button className={`${styles.menuItem} ${styles.mindMenuClear}`} onClick={() => set(NO_FILTER)}>Clear filters</button>
            </>
          )}
        </>
      )}
    </AnchorMenu>
  );
}

/** What's filtering the page right now, each one a chip that takes it off. */
export function FilterBar({ filter, onChange }: { filter: MindFilter; onChange: (f: MindFilter) => void }) {
  if (!isFiltering(filter)) return null;
  const chips = [
    ...filter.tags.map((t) => ({ key: `t:${t}`, label: `#${t}`, off: () => onChange({ ...filter, tags: filter.tags.filter((x) => x !== t) }) })),
    ...(filter.since !== "any" ? [{ key: "since", label: SINCE.find((s) => s.id === filter.since)!.label, off: () => onChange({ ...filter, since: "any" as const }) }] : []),
    ...filter.kinds.map((k) => ({ key: `k:${k}`, label: KIND_LABEL[k], off: () => onChange({ ...filter, kinds: filter.kinds.filter((x) => x !== k) }) })),
  ];
  return (
    <div className={styles.mindFilterBar}>
      <IconFilter size={15} />
      {chips.map((c) => (
        <button key={c.key} className={styles.mindFilterChip} onClick={c.off} aria-label={`Stop filtering by ${c.label}`}>
          {c.label}<IconClose size={12} />
        </button>
      ))}
      <button className={styles.mindFilterClear} onClick={() => onChange(NO_FILTER)}>Clear</button>
    </div>
  );
}
