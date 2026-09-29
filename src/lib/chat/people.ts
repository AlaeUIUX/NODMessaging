"use client";

import { useSyncExternalStore } from "react";
import { USERS } from "./seed";
import type { AvatarTone, User } from "./types";

/**
 * Everyone on NOD: the demo people, plus anyone who signs up with a new
 * number in this browser, plus the edits people make to their own profile.
 * Stored in localStorage, which every tab shares — the way a server would.
 */

const KEY = "nod.people.v1";

interface PeopleData {
  created: User[];
  /** Profile changes to the demo people (name, username, photo, bio, tone). */
  edits: Record<string, Partial<User>>;
}

let raw: string | null = null;
let data: PeopleData = { created: [], edits: {} };
/** Off until the app has mounted: the prerendered HTML only knows the demo people. */
let live = false;
export function enablePeople() { live = true; }
const listeners = new Set<() => void>();
let watching = false;

function read(): PeopleData {
  let text = "";
  try { text = localStorage.getItem(KEY) ?? ""; } catch { /* storage blocked */ }
  if (text !== raw) {
    raw = text;
    try {
      const parsed = text ? JSON.parse(text) : null;
      data = { created: Array.isArray(parsed?.created) ? parsed.created : [], edits: parsed?.edits && typeof parsed.edits === "object" ? parsed.edits : {} };
    } catch {
      data = { created: [], edits: {} };
    }
  }
  return data;
}
function write(next: PeopleData) {
  data = next;
  const text = JSON.stringify(next);
  try { localStorage.setItem(KEY, text); raw = text; } catch { /* storage full: this tab keeps it */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  if (!watching && typeof window !== "undefined") {
    watching = true;
    window.addEventListener("storage", (e) => { if (e.key === KEY || e.key === null) listeners.forEach((x) => x()); });
  }
  return () => { listeners.delete(l); };
}
/** Changes whenever anyone's profile changes, so views re-render with the new name or photo. */
export function usePeopleVersion() {
  return useSyncExternalStore(subscribe, () => { read(); return raw ?? ""; }, () => "");
}

const fallback = (id: string): User => ({ id, name: id, fullName: id, tone: "graphite" });

export function personById(id: string): User {
  const d = live ? read() : data;
  const seed = USERS.find((u) => u.id === id);
  if (seed) return { ...seed, ...(d.edits[id] ?? {}) };
  return d.created.find((u) => u.id === id) ?? fallback(id);
}

export function allPeople(): User[] {
  const d = live ? read() : data;
  return [...USERS.map((u) => ({ ...u, ...(d.edits[u.id] ?? {}) })), ...d.created];
}

export const findByPhone = (phone: string) => allPeople().find((u) => u.phone === phone) ?? null;

/** Null when it's a good username (or, since usernames are optional, none at all); otherwise what's wrong with it. */
export function usernameProblem(name: string, exceptId?: string): string | null {
  if (!name) return null;
  if (name.length < 3) return "At least 3 characters";
  if (name.length > 20) return "20 characters at most";
  if (!/^[a-z0-9_]+$/.test(name)) return "Only letters, numbers and _";
  if (/^_|_$/.test(name)) return "Can’t start or end with _";
  if (allPeople().some((u) => u.username === name && u.id !== exceptId)) return `@${name} is taken`;
  return null;
}

/** A username suggestion from a name: "Sam Lee" → "samlee", then samlee2… if taken. */
export function suggestUsername(fullName: string, exceptId?: string) {
  const base = fullName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || "nod";
  let name = base.length >= 3 ? base : `${base}user`;
  for (let i = 2; usernameProblem(name, exceptId); i++) name = `${base}${i}`;
  return name;
}

/**
 * A new account. Its id is the phone number: that's what identifies you on
 * NOD. Name, username, photo and bio are all optional; without a name,
 * people see the number.
 */
export function createPerson(p: { fullName?: string; username?: string; tone: AvatarTone; phone: string; photo?: string; bio?: string }): User {
  const d = read();
  const fullName = p.fullName?.trim() || formatPhone(p.phone);
  const named = !!p.fullName?.trim();
  const user: User = {
    id: p.phone,
    name: named ? fullName.split(/\s+/)[0] : fullName,
    fullName,
    tone: p.tone,
    username: p.username || undefined,
    phone: p.phone,
    photo: p.photo,
    bio: p.bio?.trim() || undefined,
  };
  write({ ...d, created: [...d.created, user] });
  return user;
}

export function updatePerson(id: string, patch: Partial<Omit<User, "id">>) {
  const d = read();
  const next = { ...patch };
  if (next.fullName !== undefined) {
    const named = !!next.fullName.trim();
    // No name: people see the number instead.
    next.fullName = named ? next.fullName.trim() : formatPhone(personById(id).phone) || id;
    next.name = named ? next.fullName.split(/\s+/)[0] : next.fullName;
  }
  if (next.username !== undefined && !next.username) next.username = undefined;
  if (USERS.some((u) => u.id === id)) write({ ...d, edits: { ...d.edits, [id]: { ...(d.edits[id] ?? {}), ...next } } });
  else write({ ...d, created: d.created.map((u) => (u.id === id ? { ...u, ...next } : u)) });
}

/* ---------------------------------------------------------------------------
   Phone numbers
--------------------------------------------------------------------------- */

export interface Country { code: string; name: string; flag: string; dial: string }
export const COUNTRIES: Country[] = [
  { code: "AT", name: "Austria", flag: "🇦🇹", dial: "+43" },
  { code: "DE", name: "Germany", flag: "🇩🇪", dial: "+49" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭", dial: "+41" },
  { code: "FR", name: "France", flag: "🇫🇷", dial: "+33" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", dial: "+44" },
  { code: "IT", name: "Italy", flag: "🇮🇹", dial: "+39" },
  { code: "MA", name: "Morocco", flag: "🇲🇦", dial: "+212" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", dial: "+966" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", dial: "+971" },
  { code: "US", name: "United States", flag: "🇺🇸", dial: "+1" },
];

/** +43 and "0660 111 2233" → +436601112233 (a leading trunk 0 is dropped). */
export const toE164 = (dial: string, local: string) => `${dial}${local.replace(/\D/g, "").replace(/^0+/, "")}`;

/** +436601112233 → "+43 660 111 2233": the country code, then groups of three with the rest at the end. */
export function formatPhone(e164?: string) {
  if (!e164) return "";
  const c = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((x) => e164.startsWith(x.dial));
  if (!c) return e164;
  const rest = e164.slice(c.dial.length);
  const groups: string[] = [];
  for (let i = 0; i < rest.length; i += 3) groups.push(rest.slice(i, i + 3));
  if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2] += groups.pop();
  return `${c.dial} ${groups.join(" ")}`;
}

/* ---------------------------------------------------------------------------
   The phone's address book (a demo one): the people on NOD, and a few who aren't yet.
--------------------------------------------------------------------------- */

export interface AddressEntry { name: string; phone: string }
export const ADDRESS_BOOK: AddressEntry[] = [
  { name: "Alae", phone: "+43123456789" },
  { name: "Charles", phone: "+436601112233" },
  { name: "Jamshad", phone: "+436602223344" },
  { name: "Reema", phone: "+436603334455" },
  { name: "Salman", phone: "+436604445566" },
  { name: "Dana Weber", phone: "+436645550192" },
  { name: "Lukas Brandl", phone: "+436765550137" },
  { name: "Mira Hofer", phone: "+436505550181" },
  { name: "Omar Haddad", phone: "+212661555014" },
  { name: "Sofia Rossi", phone: "+393475550164" },
];
