/**
 * Where something waiting in Unassigned probably goes, from what's already
 * sorted: the chat it came from, its tags, the words in it and the topics
 * they touch, and what kind of thing it is. The tray offers the best guess as
 * one tap; anything it isn't sure about stays for Sort.
 */

import { topicsIn } from "./explore";
import { collectionItems, isUnassigned, tagsOf, type Block, type Collection, type Mind } from "./mind";

/** Words too common to say anything about where a thing belongs. */
const COMMON = new Set([
  "about", "after", "again", "also", "back", "been", "before", "being", "could", "every", "from", "have", "here", "into", "just",
  "like", "make", "more", "most", "much", "need", "next", "only", "over", "same", "some", "than", "that", "their", "them", "then",
  "there", "these", "they", "thing", "things", "this", "time", "very", "want", "what", "when", "where", "which", "will", "with",
  "would", "your", "yours", "hello", "thanks", "today", "tomorrow", "week",
]);

const wordsOf = (s: string) => new Set((s.toLowerCase().match(/[a-zà-ÿß]{4,}/g) ?? []).filter((w) => !COMMON.has(w)));

/** Everything a thing says about itself, as one piece of text. */
const textOf = (b: Block) => [
  b.title, b.body, b.source, b.back, b.unit,
  ...(b.tags ?? []).map((t) => t.replace(/-/g, " ")),
  ...(b.checklist ?? []).map((s) => s.text),
].filter(Boolean).join(" ");

/** Kinds that say little about a subject on their own: everything has notes and saved messages. */
const PLAIN = new Set(["note", "chat", "todo", "reminder"]);

/** At least this much evidence, and more than the runner-up, before Mind offers a guess. */
const SURE = 3;

/** The collection a waiting thing most likely belongs in, or null when nothing stands out. */
export function suggestPlace(mind: Mind, b: Block): { collection: Collection; score: number } | null {
  const text = textOf(b);
  const mine = wordsOf(text);
  const myTopics = topicsIn(text);
  let best: { collection: Collection; score: number } | null = null;
  let runnerUp = 0;
  for (const c of mind.collections) {
    if (isUnassigned(c)) continue;
    const items = collectionItems(mind, c);
    const tags = tagsOf(items);
    let score = 0;
    // The chat it came from already has a place, or other saves from it are here.
    if (b.ref) {
      if (c.chatIds.includes(b.ref.chatId)) score += 6;
      if (items.some((x) => x.ref?.chatId === b.ref!.chatId)) score += 3;
    }
    // Tags it shares with what's here.
    score += (b.tags ?? []).filter((t) => tags.includes(t)).length * 3;
    // Its words: in the collection's name counts most; in what's there, a little each.
    const name = wordsOf(c.name);
    const theirs = wordsOf(`${items.map(textOf).join(" ")} ${tags.join(" ").replace(/-/g, " ")}`);
    let echoes = 0;
    for (const w of mine) {
      if (name.has(w)) score += 3;
      else if (theirs.has(w)) echoes++;
    }
    score += Math.min(echoes, 3);
    // The same subject in other words (a Tandem link and a German deck are both about languages).
    const theirTopics = topicsIn(`${c.name} ${tags.join(" ").replace(/-/g, " ")} ${items.map((x) => x.title).join(" ")}`);
    score += myTopics.filter((t) => theirTopics.includes(t)).length * 3;
    // The same kind as most of what's here (a flashcard and the deck it belongs to).
    if (!PLAIN.has(b.kind) && items.length >= 3 && items.filter((x) => x.kind === b.kind).length / items.length >= .5) score += 2;

    if (!best || score > best.score) {
      runnerUp = best?.score ?? 0;
      best = { collection: c, score };
    } else if (score > runnerUp) runnerUp = score;
  }
  return best && best.score >= SURE && best.score > runnerUp ? best : null;
}

/** The tray's one-tap sort: the collection the most waiting things fit, and which things. */
export function bestSort(mind: Mind, waiting: Block[]) {
  const groups = new Map<string, { collection: Collection; items: Block[]; score: number }>();
  for (const b of waiting) {
    const s = suggestPlace(mind, b);
    if (!s) continue;
    const g = groups.get(s.collection.id) ?? { collection: s.collection, items: [], score: 0 };
    g.items.push(b);
    g.score += s.score;
    groups.set(s.collection.id, g);
  }
  return [...groups.values()].sort((a, b) => b.items.length - a.items.length || b.score - a.score)[0] ?? null;
}
