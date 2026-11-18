import {
  collectionItems, isUnassigned, makeCollection, newId, peopleMinds, place, tagOf, tagsOf,
  type Block, type BlockKind, type Collection, type Mind, type MindView,
} from "./mind";
import { groupInfo } from "./groups";
import { land } from "./landing";
import type { AvatarTone, Chat } from "./types";

/**
 * Explore: what's public on NOD, ranked for you. Collections other people
 * made, what your friends have been saving and joining, and groups that fit
 * what you keep. The "algorithm" is plain and local: words from your Mind
 * (collection names weigh most), your groups and your friends become topic
 * weights, and everything public is scored against them, with a nudge for
 * friends and for popular things. Every card says why it's there.
 */

export type Topic =
  | "film" | "editing" | "photography"
  | "german" | "language" | "travel" | "vienna" | "design" | "work" | "home" | "plants"
  | "coffee" | "food" | "hiking" | "startups" | "reading";

export const TOPIC_LABEL: Record<Topic, string> = {
  film: "Cinematography", editing: "Video editing", photography: "Photography",
  german: "German", language: "Languages", travel: "Travel", vienna: "Vienna", design: "Design", work: "Work",
  home: "Home", plants: "Plants", coffee: "Coffee", food: "Food", hiking: "Hiking", startups: "Startups", reading: "Reading",
};

/** The topics as the first visit offers them, in groups. */
export const TOPIC_GROUPS: { title: string; topics: Topic[] }[] = [
  { title: "Film and video", topics: ["film", "editing", "photography"] },
  { title: "Making things", topics: ["design", "home", "plants", "reading"] },
  { title: "Going places", topics: ["travel", "hiking", "food", "coffee", "vienna"] },
  { title: "Learning", topics: ["language", "german"] },
  { title: "Work", topics: ["work", "startups"] },
];

const TOPIC_WORDS: Record<Topic, string[]> = {
  film: ["film", "films", "cinema", "cinematic", "cinematography", "lighting", "shot", "shots", "scene", "lens", "lenses", "set", "director", "dop"],
  editing: ["edit", "editing", "cut", "cuts", "timeline", "premiere", "resolve", "transition", "transitions", "grade", "grading", "colour"],
  photography: ["photo", "photos", "photography", "camera", "cameras", "portrait", "portraits", "golden", "drone", "aerial"],
  german: ["german", "deutsch", "vocab", "grammar", "verb", "verbs", "flashcard", "goethe", "dative", "separable", "gemütlich"],
  language: ["language", "languages", "vocab", "grammar", "tandem", "words", "listening", "phrases"],
  travel: ["trip", "trips", "travel", "weekend", "holiday", "train", "flight", "lisbon", "ideas"],
  vienna: ["vienna", "wien", "austria", "naschmarkt"],
  design: ["design", "type", "figma", "moodboard", "palette", "inbox", "brand", "redesign", "website", "ui"],
  work: ["work", "launch", "client", "clients", "project", "invoice", "invoices", "board", "admin", "spaces", "ios", "app"],
  home: ["home", "living", "bedroom", "room", "house", "sofa", "interior", "dream", "furniture"],
  plants: ["plant", "plants", "monstera", "garden", "jungle"],
  coffee: ["coffee", "café", "cafe", "espresso"],
  food: ["food", "lunch", "recipe", "recipes", "ramen", "cook", "cooking", "dinner"],
  hiking: ["hike", "hiking", "alps", "mountain", "mountains", "trail"],
  startups: ["startup", "founder", "founders", "investor", "pitch", "launch", "pricing"],
  reading: ["book", "books", "read", "reading", "library"],
};

/** The topics a piece of text touches, by the words in it. */
export function topicsIn(text: string): Topic[] {
  const words = new Set(text.toLowerCase().match(/[a-zà-ÿß]{3,}/g) ?? []);
  return (Object.keys(TOPIC_WORDS) as Topic[]).filter((t) => TOPIC_WORDS[t].some((w) => words.has(w)));
}

/* ---------------------------------------------------------------------------
   Who made things: people on NOD (the demo's users) and people you don't know yet
--------------------------------------------------------------------------- */

export interface Stranger { id: string; name: string; username: string; tone: AvatarTone }
export const STRANGERS: Stranger[] = [
  { id: "lena", name: "Lena Vogt", username: "lenavogt", tone: "sage" },
  { id: "tomas", name: "Tomás Rivera", username: "tomas", tone: "clay" },
  { id: "aiko", name: "Aiko Tanaka", username: "aiko", tone: "plum" },
  { id: "nadia", name: "Nadia Haddad", username: "nadiacooks", tone: "ochre" },
  { id: "maya", name: "Maya Chen", username: "mayaframes", tone: "denim" },
  { id: "jonas", name: "Jonas Brandt", username: "jonasedits", tone: "graphite" },
  { id: "sofia", name: "Sofia Lima", username: "sofialima", tone: "clay" },
];

/* ---------------------------------------------------------------------------
   Public collections
--------------------------------------------------------------------------- */

/** One thing in a public collection: a Mind item without its dates, its tags kept (they're how a collection is browsed). */
/** Where a place is, for a link to somewhere you can go: a map shows it. */
export interface Geo { lat: number; lng: number; zoom?: number; area?: string }
export type PublicItem = Omit<Block, "createdAt" | "tags"> & { tags?: string[]; geo?: Geo };
export interface PublicCollection {
  id: string;
  name: string;
  emoji: string;
  /** A hex colour, like a Mind collection's. */
  tone: string;
  cover: string;
  by: string;
  description: string;
  topics: Topic[];
  saves: number;
  updatedAt: number;
  /** How it's laid out, as its owner left it. */
  view: MindView;
  /** Everything in it, on one level; tags group it. */
  items: PublicItem[];
}

/* The collections made for Explore are written as groups of things; each group's name becomes its things' tag. */
type AuthoredGroup = { title: string; emoji: string; view: string; defaultKind: BlockKind; items: PublicItem[] };
type Authored = Omit<PublicCollection, "items" | "view"> & { stacks: AuthoredGroup[] };
const flat = ({ stacks, ...pc }: Authored): PublicCollection => ({
  ...pc,
  view: stacks[0]?.view === "grid" || stacks[0]?.view === "shelf" ? stacks[0].view : "list",
  items: stacks.flatMap((g) => g.items.map((item) => ({ ...item, tags: [...new Set([tagOf(g.title), ...(item.tags ?? [])])] }))),
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const pic = (q: string, w = 700) => `https://images.unsplash.com/${q}?w=${w}&q=70&fm=jpg`;
/** Each picture's height over its width, as the real app gets from the server, so the wall lays out before they load. */
const SHAPES: Record<string, number> = {
  "1765045038226-43d7cd5cfd29": 1.5, "1659473651020-a143ff0d6e47": 1.33, "1757534932627-539a974d4b93": 0.67, "1700225540831-7072e38ec7d5": 0.67,
  "1631182352098-0c29cc345003": 1.25,
  "1489599849927-2ee91cede3ba": 0.67, "1490971588422-52f6262a237a": 1.5, "1506863530036-1efeddceb993": 0.78,
  "1548850174-70a1cf2c5f09": 1.5, "1551302175-952301267d19": 0.67, "1586165877141-3dbcfc059283": 1.5,
  "1594909122845-11baa439b7bf": 0.67, "1602911310167-1b82343f6264": 1.5, "1612548403247-aa2873e9422d": 1.5,
  "1638472432243-901591666239": 0.42, "1681137063068-081072cf04b4": 0.67, "1758461479768-bdbce375e005": 0.75,
  "1758906819465-b2fde39d715d": 1.5, "1761206532410-f0042edbeb9b": 1.33, "1762848498856-f51a9a9fc139": 0.75,
  "1762944084271-c64635a1f3b1": 1.49, "1765200135122-6e0e9e14da76": 1.5, "1765619222435-018d16c202df": 1.18,
  "1774979300738-5c8c05e1db6b": 1.5, "1775405325864-2981439bfe6a": 1.33, "1776294435314-53c9dcdedf6a": 1.5,
  "1776969700630-b51dd0a6f7e7": 0.67, "1777019075773-a231fa4e4534": 0.67, "1777146464379-c527ae8c92f0": 0.78,
  "1778184441641-f14012d0027e": 1.5, "1779896412253-b5c31454aed9": 0.67, "1779896412277-c4fd15c7a89c": 0.73,
  "1780642213026-cf15a7676c6b": 1.5, "1782580601467-1b1a19f516cc": 0.67, "1782582309438-fc97879e2c25": 1.5,
  "1782889187454-a568fe1f20e2": 0.42, "1787540757892-cab3118bd223": 0.75, "1788295031027-a82c7b15b5ae": 1.33,
  "1788359563884-7d6998add45e": 0.67,
  "1440404653325-ab127d49abc1": 0.67, "1453728013993-6d66e9c9123a": 0.67, "1483977399921-6cf94f6fdc3a": 0.63,
  "1485846234645-a62644f84728": 0.68, "1490810194309-344b3661ba39": 0.51, "1493663284031-b7e3aefcae8e": 0.67,
  "1495474472287-4d71bcdd2085": 0.67, "1497366216548-37526070297c": 0.67, "1502982720700-bfff97f2ecac": 0.67,
  "1504674900247-0877df9cc836": 0.67, "1506905925346-21bda4d32df4": 0.67, "1512820790803-83ca734da794": 0.65,
  "1512918728675-ed5a9ecdebfd": 0.67, "1514960919797-5ff58c52e5ba": 1.1, "1515634928627-2a4e0dae3ddf": 0.67,
  "1516035069371-29a1b244cc32": 1.25, "1516550893923-42d28e5677af": 0.67, "1518098268026-4e89f1a2cd8e": 0.75,
  "1518725522904-4b3939358342": 1.5, "1522071820081-009f0129c71c": 0.67, "1526835746352-0b9da4054862": 1.5,
  "1535391879778-3bae11d29a24": 0.67, "1541702467897-41915a07d3a7": 1.5, "1542642839-83adadcbe645": 0.57,
  "1550783663-4c9ad5dee0eb": 1.5, "1574717024653-61fd2cf4d44d": 0.67, "1574923930958-9b653a0e5148": 0.56,
  "1582994254571-52c62d96ebab": 0.67, "1598928506311-c55ded91a20c": 0.67, "1599060052009-24d6d0b0161c": 0.67,
  "1600210492486-724fe5c67fb0": 0.75, "1608690158878-1a96b29b455b": 1.5, "1612544409025-e1f6a56c1152": 0.67,
  "1614963326505-843868e1d83a": 0.67, "1615874959474-d609969a20ed": 1, "1616046229478-9901c5536a45": 1,
  "1616137466211-f939a420be84": 0.56, "1619896849560-f92c4330f1a6": 1.25, "1633886580462-128c8696afd5": 1.55,
  "1635274142658-9260d3bf88c4": 0.75, "1700159357774-8a367f7febfc": 0.67, "1702126952831-2225b214adc4": 0.67,
  "1706073310908-e984f35dc2b9": 0.67, "1707128551040-e512534e499d": 0.67, "1718874380569-7a44071f01c3": 0.67,
  "1719413048888-b66179deb254": 0.56, "1757845524683-611470b2d7ce": 0.67, "1758109683112-de123797b54a": 0.75,
  "1759230766134-e3ff1c27d20e": 1.33, "1759417501248-0aa9489dab3f": 0.67, "1762810543525-189cc724409f": 1.5,
  "1780642203579-e95141277cf4": 0.67, "1785593414189-2e591e4ca6df": 1.4,
};
let n = 0;
const it = (col: string, item: Omit<PublicItem, "id">): PublicItem => ({ ...item, id: `${col}:${++n}` });
const fc = (col: string, front: string, back: string): PublicItem => it(col, { kind: "flashcard", title: front, back });
const link = (col: string, title: string, source: string, note?: string): PublicItem => it(col, { kind: "link", title, source, url: `https://${source}`, ...(note ? { note } : {}) });
/** A link to a place: the same, with where it is. */
const placeLink = (col: string, title: string, source: string, note: string, geo: Geo, photo?: string): PublicItem => ({ ...link(col, title, source, note), geo, ...(photo ? { image: pic(photo) } : {}) });
const img = (col: string, q: string, title: string): PublicItem => it(col, { kind: "image", title, image: pic(q), source: "Explore" });
const note = (col: string, title: string, body: string): PublicItem => it(col, { kind: "note", title, body });
const todo = (col: string, title: string): PublicItem => it(col, { kind: "todo", title });
const book = (col: string, title: string, source: string, image?: string, url?: string): PublicItem => it(col, { kind: "book", title, source, shelf: "want", image, url });

const now = Date.now();

const AUTHORED: Authored[] = [
  /* ---- Film and video: collections made to be browsed as pictures ---- */
  {
    id: "pc-cine-light", name: "Cinematic lighting", emoji: "🎬", tone: "#B4462E", by: "maya",
    cover: pic("photo-1777146464379-c527ae8c92f0", 900),
    description: "One light, a lot of dark. Frames I study before every shoot.",
    topics: ["film", "photography"], saves: 8400, updatedAt: now - 3 * HOUR,
    stacks: [
      { title: "Hard light", emoji: "🔦", view: "grid", defaultKind: "image", items: [
        img("pc-cine-light", "photo-1777146464379-c527ae8c92f0", "Two colours, one face"),
        img("pc-cine-light", "photo-1550783663-4c9ad5dee0eb", "Shadows doing the talking"),
        img("pc-cine-light", "photo-1762848498856-f51a9a9fc139", "A lighter is enough"),
        img("pc-cine-light", "photo-1702126952831-2225b214adc4", "A single beam through haze"),
        img("pc-cine-light", "photo-1788359563884-7d6998add45e", "One fresnel, nothing else"),
      ] },
      { title: "Soft light", emoji: "🌫️", view: "grid", defaultKind: "image", items: [
        img("pc-cine-light", "photo-1638472432243-901591666239", "Window light, eyes closed"),
        img("pc-cine-light", "photo-1788295031027-a82c7b15b5ae", "Overcast does the work"),
        img("pc-cine-light", "photo-1602911310167-1b82343f6264", "Late sun on a bare wall"),
        img("pc-cine-light", "photo-1506863530036-1efeddceb993", "Black and white, one source"),
      ] },
      { title: "Notes", emoji: "📝", view: "list", defaultKind: "note", items: [
        note("pc-cine-light", "Motivate every light", "If the audience can't tell where it comes from, it feels lit. A lamp, a window, a screen: give it a reason."),
        note("pc-cine-light", "Light from the far side", "Put the key on the side of the face away from camera. Instant depth, no extra lights."),
      ] },
    ],
  },
  {
    id: "pc-lenses", name: "Lens choices: 24, 35, 50", emoji: "🔭", tone: "#3E5A7A", by: "maya",
    cover: pic("photo-1779896412253-b5c31454aed9", 900),
    description: "What each focal length does to a face, a room and a feeling.",
    topics: ["film", "photography"], saves: 3600, updatedAt: now - DAY,
    stacks: [
      { title: "Glass", emoji: "📷", view: "grid", defaultKind: "image", items: [
        img("pc-lenses", "photo-1779896412253-b5c31454aed9", "City lights at f/1.4"),
        img("pc-lenses", "photo-1516035069371-29a1b244cc32", "The kit, laid flat"),
        img("pc-lenses", "photo-1612548403247-aa2873e9422d", "Zoom, mic, ready"),
        img("pc-lenses", "photo-1758109683112-de123797b54a", "Reflections in the front element"),
        img("pc-lenses", "photo-1776294435314-53c9dcdedf6a", "A rig for one shot"),
        img("pc-lenses", "photo-1490971588422-52f6262a237a", "Low angle, wide glass"),
      ] },
      { title: "Rules of thumb", emoji: "📐", view: "list", defaultKind: "note", items: [
        note("pc-lenses", "24mm", "Puts you inside the room. Faces stretch near the edges: keep people centred."),
        note("pc-lenses", "35mm", "The storyteller: wide enough for the place, close enough for the person."),
        note("pc-lenses", "50mm", "Closest to how we notice things. Flattering, quiet, honest."),
      ] },
    ],
  },
  {
    id: "pc-night", name: "Neon nights", emoji: "🌃", tone: "#6B4FA3", by: "sofia",
    cover: pic("photo-1541702467897-41915a07d3a7", 900),
    description: "City at night on a small budget: shoot wide open, let the signs light it.",
    topics: ["film", "photography", "travel"], saves: 5100, updatedAt: now - 6 * HOUR,
    stacks: [
      { title: "Streets", emoji: "🌧️", view: "grid", defaultKind: "image", items: [
        img("pc-night", "photo-1541702467897-41915a07d3a7", "Raincoat, orange taxi"),
        img("pc-night", "photo-1765619222435-018d16c202df", "Fog and one sign"),
        img("pc-night", "photo-1599060052009-24d6d0b0161c", "Motorbike through the alley"),
        img("pc-night", "photo-1608690158878-1a96b29b455b", "Crowds as texture"),
        img("pc-night", "photo-1548850174-70a1cf2c5f09", "Alone under the lamp"),
        img("pc-night", "photo-1574923930958-9b653a0e5148", "Cinema sign as the only light"),
        img("pc-night", "photo-1586165877141-3dbcfc059283", "An empty street, lamps on"),
        img("pc-night", "photo-1774979300738-5c8c05e1db6b", "The city in the water"),
      ] },
      { title: "Settings", emoji: "⚙️", view: "list", defaultKind: "note", items: [
        note("pc-night", "Wide open, ISO up", "f/1.8, ISO 1600 to 3200, 1/50s. Grain is fine; blur isn't."),
        note("pc-night", "Wet streets", "After rain every light doubles. Check the forecast, not the clock."),
      ] },
    ],
  },
  {
    id: "pc-edit", name: "Cutting on motion", emoji: "✂️", tone: "#2F6B6B", by: "jonas",
    cover: pic("photo-1780642213026-cf15a7676c6b", 900),
    description: "Editing ideas that make cuts disappear, with the timelines to prove it.",
    topics: ["editing", "film"], saves: 4700, updatedAt: now - 2 * HOUR,
    stacks: [
      { title: "Timelines", emoji: "🎞️", view: "grid", defaultKind: "image", items: [
        img("pc-edit", "photo-1780642213026-cf15a7676c6b", "Picture on top, sound below"),
        img("pc-edit", "photo-1490810194309-344b3661ba39", "Late session, headphones on"),
        img("pc-edit", "photo-1551302175-952301267d19", "Blue and purple: every clip a colour"),
        img("pc-edit", "photo-1779896412277-c4fd15c7a89c", "Three screens, one cut"),
        img("pc-edit", "photo-1574717024653-61fd2cf4d44d", "Waveforms tell you where to cut"),
        img("pc-edit", "photo-1777019075773-a231fa4e4534", "The edit suite"),
      ] },
      { title: "Cuts", emoji: "🔀", view: "list", defaultKind: "note", items: [
        note("pc-edit", "J-cut", "Let the next scene's sound start before its picture. The audience leans in."),
        note("pc-edit", "L-cut", "Keep the voice running over the next shot. Conversations breathe."),
        note("pc-edit", "Cut on the action", "Cut mid-movement and the eye follows the motion, not the cut."),
        link("pc-edit", "Match cuts, explained", "youtube.com", "Ten minutes, worth every one"),
      ] },
    ],
  },
  {
    id: "pc-golden", name: "Golden hour portraits", emoji: "🌅", tone: "#C98A2E", by: "sofia",
    cover: pic("photo-1782580601467-1b1a19f516cc", 900),
    description: "The hour before sunset, backlit, and nothing else in the bag.",
    topics: ["photography", "film"], saves: 6900, updatedAt: now - 2 * DAY,
    stacks: [
      { title: "Backlit", emoji: "☀️", view: "grid", defaultKind: "image", items: [
        img("pc-golden", "photo-1782580601467-1b1a19f516cc", "White dress, low sun"),
        img("pc-golden", "photo-1619896849560-f92c4330f1a6", "Black sweater, warm edges"),
        img("pc-golden", "photo-1778184441641-f14012d0027e", "Walking into the light"),
        img("pc-golden", "photo-1785593414189-2e591e4ca6df", "A red book in a field"),
        img("pc-golden", "photo-1782582309438-fc97879e2c25", "Tall grass, last light"),
        img("pc-golden", "photo-1526835746352-0b9da4054862", "Sun behind, fence in front"),
        img("pc-golden", "photo-1761206532410-f0042edbeb9b", "Two people, one flare"),
        img("pc-golden", "photo-1762810543525-189cc724409f", "Braids in the desert"),
      ] },
    ],
  },
  {
    id: "pc-drone", name: "Drone shots that don't look like drone shots", emoji: "🛸", tone: "#4F7A4F", by: "sofia",
    cover: pic("photo-1787540757892-cab3118bd223", 900),
    description: "Slow, low and with a reason to be up there.",
    topics: ["photography", "film", "travel"], saves: 2300, updatedAt: now - 4 * DAY,
    stacks: [
      { title: "From above", emoji: "🗺️", view: "grid", defaultKind: "image", items: [
        img("pc-drone", "photo-1787540757892-cab3118bd223", "Rice terraces and a dirt road"),
        img("pc-drone", "photo-1518098268026-4e89f1a2cd8e", "Cypress road, Tuscany"),
        img("pc-drone", "photo-1758461479768-bdbce375e005", "A river through the dark"),
        img("pc-drone", "photo-1762944084271-c64635a1f3b1", "Fields at sunrise"),
        img("pc-drone", "photo-1775405325864-2981439bfe6a", "The road down to the harbour"),
        img("pc-drone", "photo-1765200135122-6e0e9e14da76", "A valley, straight down"),
      ] },
      { title: "How", emoji: "🎚️", view: "list", defaultKind: "note", items: [
        note("pc-drone", "Fly slower than feels right", "Half the speed you think. Smooth reads as expensive."),
      ] },
    ],
  },
  {
    id: "pc-set", name: "On set: small crews", emoji: "🎥", tone: "#57534E", by: "jonas",
    cover: pic("photo-1782889187454-a568fe1f20e2", 900),
    description: "How four people make a set feel like forty. Photos and the shot list.",
    topics: ["film", "work"], saves: 1800, updatedAt: now - 3 * DAY,
    stacks: [
      { title: "The set", emoji: "🎬", view: "grid", defaultKind: "image", items: [
        img("pc-set", "photo-1782889187454-a568fe1f20e2", "Four people, one camera"),
        img("pc-set", "photo-1758906819465-b2fde39d715d", "Dolly in the living room"),
        img("pc-set", "photo-1776969700630-b51dd0a6f7e7", "The slate on the chair"),
        img("pc-set", "photo-1612544409025-e1f6a56c1152", "Soundstage, lights rigged"),
        img("pc-set", "photo-1594909122845-11baa439b7bf", "Take one"),
        img("pc-set", "photo-1681137063068-081072cf04b4", "Night exterior"),
        img("pc-set", "photo-1489599849927-2ee91cede3ba", "Where it ends up"),
      ] },
      { title: "Shot list", emoji: "✅", view: "list", defaultKind: "todo", items: [
        todo("pc-set", "Wide: establish the room"),
        todo("pc-set", "Medium: the conversation"),
        todo("pc-set", "Inserts: hands, cups, the door"),
      ] },
    ],
  },
  {
    id: "pc-german-travel", name: "German for travellers", emoji: "🧳", tone: "#C99432", by: "lena",
    cover: pic("photo-1516550893923-42d28e5677af", 900),
    description: "The 40 phrases that get you through cafés, trains and hotels, as flashcards.",
    topics: ["german", "language", "travel"], saves: 2400, updatedAt: now - 2 * DAY,
    stacks: [
      { title: "At the café", emoji: "☕", view: "grid", defaultKind: "flashcard", items: [
        fc("pc-german-travel", "Einen Kaffee, bitte", "A coffee, please"),
        fc("pc-german-travel", "Die Rechnung, bitte", "The bill, please"),
        fc("pc-german-travel", "Zum Mitnehmen", "To take away"),
        fc("pc-german-travel", "Ist hier noch frei?", "Is this seat free?"),
      ] },
      { title: "On the train", emoji: "🚆", view: "grid", defaultKind: "flashcard", items: [
        fc("pc-german-travel", "das Gleis", "the platform"),
        fc("pc-german-travel", "umsteigen", "to change trains"),
        fc("pc-german-travel", "die Verspätung", "the delay"),
      ] },
      { title: "Worth a look", emoji: "🔗", view: "list", defaultKind: "link", items: [
        link("pc-german-travel", "Ordering at a café, slowly", "youtube.com", "Easy German street interview, with subtitles"),
        link("pc-german-travel", "Train tickets without the stress", "bahn.de"),
      ] },
    ],
  },
  {
    id: "pc-grammar", name: "German grammar, one page each", emoji: "📚", tone: "#3E67A6", by: "jamshad",
    cover: pic("photo-1512820790803-83ca734da794", 900),
    description: "Cases, word order and the verbs that split in two. One note per rule.",
    topics: ["german", "language", "reading"], saves: 860, updatedAt: now - 3 * HOUR,
    stacks: [
      { title: "Cases", emoji: "🧩", view: "list", defaultKind: "note", items: [
        note("pc-grammar", "Always dative", "aus, bei, mit, nach, seit, von, zu: after these, it’s always dative."),
        note("pc-grammar", "Two-way prepositions", "Movement takes the accusative, location takes the dative: in, an, auf, über, unter…"),
      ] },
      { title: "Word order", emoji: "🔀", view: "list", defaultKind: "note", items: [
        note("pc-grammar", "Verb second", "In a main clause the verb sits second, whatever comes first."),
        note("pc-grammar", "Verb last", "After weil, dass and wenn, the verb goes to the end."),
        fc("pc-grammar", "anrufen", "to call (ich rufe dich an)"),
      ] },
    ],
  },
  {
    id: "pc-vienna-coffee", name: "Vienna coffee houses", emoji: "☕", tone: "#86507A", by: "reema",
    cover: pic("photo-1495474472287-4d71bcdd2085", 900),
    description: "Where to sit for an hour with one Melange. Classics first, then the new ones.",
    topics: ["vienna", "coffee", "travel", "food"], saves: 1300, updatedAt: now - 2 * HOUR,
    stacks: [
      { title: "The classics", emoji: "🏛️", view: "list", defaultKind: "link", items: [
        placeLink("pc-vienna-coffee", "Café Sperl", "cafesperl.at", "Billiard tables, newspapers, no hurry", { lat: 48.1985, lng: 16.3607, area: "Mariahilf, Vienna" }, "photo-1765045038226-43d7cd5cfd29"),
        placeLink("pc-vienna-coffee", "Café Hawelka", "hawelka.at", "Buchteln after 8pm", { lat: 48.2079, lng: 16.3713, area: "Innere Stadt, Vienna" }, "photo-1659473651020-a143ff0d6e47"),
        placeLink("pc-vienna-coffee", "Café Central", "cafecentral.wien", "Go early, or go at 4", { lat: 48.2104, lng: 16.3654, area: "Innere Stadt, Vienna" }, "photo-1757534932627-539a974d4b93"),
      ] },
      { title: "Newer spots", emoji: "✨", view: "grid", defaultKind: "image", items: [
        img("pc-vienna-coffee", "photo-1495474472287-4d71bcdd2085", "Flat white by the canal"),
        img("pc-vienna-coffee", "photo-1600210492486-724fe5c67fb0", "Light, plants, good chairs"),
      ] },
    ],
  },
  {
    id: "pc-small-space", name: "Small-space living", emoji: "🪴", tone: "#5B8A6B", by: "aiko",
    cover: pic("photo-1616046229478-9901c5536a45", 900),
    description: "Light colours, low furniture and plants that forgive you.",
    topics: ["home", "plants", "design"], saves: 5200, updatedAt: now - DAY,
    stacks: [
      { title: "Rooms", emoji: "🛋️", view: "grid", defaultKind: "image", items: [
        img("pc-small-space", "photo-1616137466211-f939a420be84", "All white, lots of light"),
        img("pc-small-space", "photo-1493663284031-b7e3aefcae8e", "Teal against oak"),
        img("pc-small-space", "photo-1615874959474-d609969a20ed", "Rattan and linen"),
        img("pc-small-space", "photo-1512918728675-ed5a9ecdebfd", "A low bed makes a room taller"),
      ] },
      { title: "Plants that forgive you", emoji: "🌿", view: "list", defaultKind: "note", items: [
        note("pc-small-space", "Snake plant", "Water once a month. Happy in a dark corner."),
        note("pc-small-space", "Pothos", "Trails nicely from a shelf; tells you when it’s thirsty."),
        img("pc-small-space", "photo-1598928506311-c55ded91a20c", "A little jungle by the window"),
      ] },
    ],
  },
  {
    id: "pc-design-reading", name: "Design systems reading list", emoji: "📐", tone: "#3E67A6", by: "charles",
    cover: pic("photo-1497366216548-37526070297c", 900),
    description: "What I hand every new designer and engineer on a team.",
    topics: ["design", "work", "reading"], saves: 3100, updatedAt: now - 5 * HOUR,
    stacks: [
      { title: "Books", emoji: "📖", view: "shelf", defaultKind: "book", items: [
        book("pc-design-reading", "Refactoring UI", "Adam Wathan & Steve Schoger", "https://covers.openlibrary.org/b/id/10527062-L.jpg", "https://openlibrary.org/works/OL23977983W"),
        book("pc-design-reading", "The Design of Everyday Things", "Don Norman", "https://is1-ssl.mzstatic.com/image/thumb/Publication122/v4/c3/e2/a3/c3e2a3ac-a308-18ad-4895-6ce058b56952/9780465072996.jpg/600x600bb.jpg", "https://books.apple.com/us/book/the-design-of-everyday-things/id1209990641"),
        book("pc-design-reading", "Atomic Design", "Brad Frost", "https://covers.openlibrary.org/b/id/12750057-L.jpg", "https://openlibrary.org/works/OL22297494W"),
      ] },
      { title: "Articles", emoji: "📰", view: "list", defaultKind: "link", items: [
        link("pc-design-reading", "Naming colour tokens", "medium.com"),
        link("pc-design-reading", "Spacing systems that scale", "smashingmagazine.com"),
      ] },
    ],
  },
  {
    id: "pc-launch", name: "Launch week, step by step", emoji: "🚀", tone: "#C4573F", by: "tomas",
    cover: pic("photo-1522071820081-009f0129c71c", 900),
    description: "The checklist we use for every launch, from the week before to the week after.",
    topics: ["startups", "work"], saves: 1900, updatedAt: now - 4 * DAY,
    stacks: [
      { title: "The week before", emoji: "🗓️", view: "list", defaultKind: "todo", items: [
        todo("pc-launch", "Freeze scope, write the changelog"),
        todo("pc-launch", "Brief support with the top five questions"),
        todo("pc-launch", "Schedule the announcement"),
      ] },
      { title: "Launch day", emoji: "🎉", view: "list", defaultKind: "todo", items: [
        todo("pc-launch", "Post, then reply to everything for two hours"),
        todo("pc-launch", "Watch sign-ups and errors every hour"),
      ] },
    ],
  },
  {
    id: "pc-alps", name: "Weekend in the Alps", emoji: "🏔️", tone: "#57534E", by: "salman",
    cover: pic("photo-1506905925346-21bda4d32df4", 900),
    description: "Two days, one hut, three routes that don’t need a guide.",
    topics: ["travel", "hiking"], saves: 640, updatedAt: now - 5 * HOUR,
    stacks: [
      { title: "Routes", emoji: "🥾", view: "list", defaultKind: "link", items: [
        placeLink("pc-alps", "Schneeberg loop", "bergfex.at", "5h, steady, best views in Lower Austria", { lat: 47.767, lng: 15.806, zoom: 12, area: "Lower Austria" }, "photo-1700225540831-7072e38ec7d5"),
        placeLink("pc-alps", "Rax plateau", "bergfex.at", "Take the cable car up, walk down", { lat: 47.716, lng: 15.745, zoom: 12, area: "Lower Austria" }, "photo-1631182352098-0c29cc345003"),
      ] },
      { title: "Pack list", emoji: "🎒", view: "list", defaultKind: "todo", items: [
        todo("pc-alps", "Hut booking printed"),
        todo("pc-alps", "Layers, not a big jacket"),
        img("pc-alps", "photo-1506905925346-21bda4d32df4", "Worth the early start"),
      ] },
    ],
  },
  {
    id: "pc-ramen", name: "Ramen at home", emoji: "🍜", tone: "#C99432", by: "nadia",
    cover: pic("photo-1504674900247-0877df9cc836", 900),
    description: "Broth on Sunday, bowls all week.",
    topics: ["food"], saves: 980, updatedAt: now - 6 * DAY,
    stacks: [
      { title: "Basics", emoji: "🥣", view: "list", defaultKind: "note", items: [
        note("pc-ramen", "Tare first", "Soy, mirin, a little sugar. Make a jar; it keeps for weeks."),
        note("pc-ramen", "Soft eggs", "Six and a half minutes, then ice water, then the marinade overnight."),
        img("pc-ramen", "photo-1504674900247-0877df9cc836", "Sunday table"),
      ] },
    ],
  },
];
export const PUBLIC_COLLECTIONS: PublicCollection[] = AUTHORED.map(flat);

/* ---------------------------------------------------------------------------
   What friends have been up to (people you share a chat with)
--------------------------------------------------------------------------- */

export interface Activity {
  id: string;
  by: string;
  kind: "saved" | "made" | "joined";
  collectionId?: string;
  groupId?: string;
  itemIds?: string[];
  at: number;
}

const itemsOf = (colId: string) => PUBLIC_COLLECTIONS.find((c) => c.id === colId)!.items.map((i) => i.id);

export const ACTIVITY: Activity[] = [
  { id: "ac-1", by: "reema", kind: "saved", collectionId: "pc-vienna-coffee", itemIds: itemsOf("pc-vienna-coffee").slice(0, 4), at: now - 2 * HOUR },
  { id: "ac-2", by: "jamshad", kind: "made", collectionId: "pc-grammar", itemIds: itemsOf("pc-grammar").slice(0, 3), at: now - 3 * HOUR },
  { id: "ac-3", by: "salman", kind: "saved", collectionId: "pc-alps", itemIds: itemsOf("pc-alps"), at: now - 5 * HOUR },
  { id: "ac-4", by: "reema", kind: "joined", groupId: "pub-design", at: now - 20 * HOUR },
  { id: "ac-5", by: "charles", kind: "saved", collectionId: "pc-design-reading", itemIds: itemsOf("pc-design-reading").slice(0, 3), at: now - 26 * HOUR },
  { id: "ac-6", by: "charles", kind: "joined", groupId: "pub-founders", at: now - 2 * DAY },
];

/* ---------------------------------------------------------------------------
   Collections people published from their own Mind
--------------------------------------------------------------------------- */

export const publishedId = (owner: string, colId: string) => `pub-${owner}-${colId}`;

/**
 * The topics a published collection is about: its own name counts double,
 * its tags once each, and only a topic named twice is kept, so one stray word
 * never files it under something it isn't.
 */
export function topicsOf(m: Mind, c: Collection): Topic[] {
  const score = new Map<Topic, number>();
  const feel = (text: string, weight: number) => {
    const words = new Set(wordsIn(text));
    for (const [t, list] of Object.entries(TOPIC_WORDS) as [Topic, string[]][]) {
      if (list.some((x) => words.has(x))) score.set(t, (score.get(t) ?? 0) + weight);
    }
  };
  feel(c.name, 2);
  for (const t of tagsOf(collectionItems(m, c))) feel(t.replace(/-/g, " "), 1);
  return [...score.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
}

/** A Mind item as Explore shows it: no dates of its owner's, its tags kept. */
function asPublic(pcId: string, b: Block): PublicItem {
  const item: PublicItem & { createdAt?: number; updatedAt?: number } = { ...b, id: `${pcId}:${b.id}` };
  delete item.createdAt;
  delete item.updatedAt;
  return item;
}

/**
 * Everyone's published collections, live: what Explore shows is what's in the
 * collection right now.
 */
export function publishedCollections(): PublicCollection[] {
  const minds = peopleMinds();
  const out: PublicCollection[] = [];
  for (const [owner, m] of minds) {
    for (const c of m.collections) {
      if (!c.published || isUnassigned(c)) continue;
      const id = publishedId(owner, c.id);
      const all = collectionItems(m, c).map((b) => asPublic(id, b));
      const picture = all.find((b) => b.kind === "image" && (b.image || b.attachment?.url || b.attachment?.dataUrl));
      out.push({
        id, name: c.name, emoji: c.emoji, tone: c.tone,
        cover: picture?.image ?? picture?.attachment?.url ?? picture?.attachment?.dataUrl ?? "",
        by: owner,
        description: c.published.description.trim() || `${all.length} ${all.length === 1 ? "thing" : "things"}`,
        topics: c.published.topics?.length ? (c.published.topics as Topic[]) : topicsOf(m, c),
        // Saves: how many other people have it in their Mind.
        saves: minds.filter(([who, other]) => who !== owner && other.collections.some((x) => x.from?.id === id)).length,
        updatedAt: c.published.at,
        view: c.view ?? "list",
        items: all,
      });
    }
  }
  return out;
}

/** Everything public: the collections made for Explore, and the ones people published. */
export const allPublic = () => [...PUBLIC_COLLECTIONS, ...publishedCollections()];
/** The collections you published, as others see them. */
export const publishedBy = (me: string) => publishedCollections().filter((c) => c.by === me);

export const allPublicItems = () => allPublic().flatMap((c) => c.items.map((item) => ({ item, collection: c })));
export const publicItem = (id: string) => allPublicItems().find((x) => x.item.id === id) ?? null;
export const publicCollection = (id: string) => allPublic().find((c) => c.id === id) ?? null;
/** A public item as a Mind block, for showing it (and saving it). */
export const asBlock = (item: PublicItem, at = now): Block => ({ ...item, tags: item.tags ?? [], createdAt: at });

/* ---------------------------------------------------------------------------
   Interests, and the ranking
--------------------------------------------------------------------------- */

const wordsIn = (s: string) => s.toLowerCase().match(/[a-zà-ÿß]{3,}/g) ?? [];

/** Topic weights from your Mind (collection names count most) and the groups you're in. */
export function interestsOf(mind: Mind | null, chats: Chat[], me: string) {
  const w = new Map<Topic, number>();
  const feel = (text: string, weight: number) => {
    const words = new Set(wordsIn(text));
    for (const [t, list] of Object.entries(TOPIC_WORDS) as [Topic, string[]][]) {
      if (list.some((x) => words.has(x))) w.set(t, (w.get(t) ?? 0) + weight);
    }
  };
  for (const c of mind?.collections ?? []) {
    feel(c.name, 4);
    if (mind) for (const t of tagsOf(collectionItems(mind, c))) feel(t.replace(/-/g, " "), 2);
  }
  for (const b of Object.values(mind?.blocks ?? {}).slice(0, 200)) feel(`${b.title} ${b.tags.join(" ")}`, 0.4);
  for (const c of chats) {
    if (c.kind !== "group" || c.groupId || c.removedAt || !c.memberIds.includes(me)) continue;
    feel(`${c.name} ${c.group?.description ?? ""}`, 1.5);
  }
  return w;
}

/** Your collection that a topic most belongs to, for "Because you collect …". */
function collectionFor(mind: Mind | null, topics: Topic[]) {
  let best: { c: Collection; score: number } | null = null;
  for (const c of mind?.collections ?? []) {
    if (isUnassigned(c)) continue;
    const words = new Set(wordsIn(`${c.name} ${mind ? tagsOf(collectionItems(mind, c)).join(" ").replace(/-/g, " ") : ""}`));
    const score = topics.reduce((s, t) => s + (TOPIC_WORDS[t].some((x) => words.has(x)) ? 1 : 0), 0);
    if (score && (!best || score > best.score)) best = { c, score };
  }
  return best?.c ?? null;
}

/** "Jamshad is here", "Jamshad and Salman are here", "Jamshad, Salman and 3 others are here". */
export function peopleLine(names: string[], where: string) {
  const [a, b] = names;
  const rest = names.length - 2;
  if (names.length === 1) return `${a} is ${where}`;
  if (names.length === 2) return `${a} and ${b} are ${where}`;
  return `${a}, ${b} and ${rest} ${rest === 1 ? "other" : "others"} are ${where}`;
}

/** People you share a chat with. */
export function friendsOf(chats: Chat[], me: string) {
  const out = new Set<string>();
  for (const c of chats) if (!c.removedAt && c.memberIds.includes(me)) c.memberIds.forEach((u) => out.add(u));
  out.delete(me);
  return out;
}

export interface Ranked<T> {
  value: T;
  score: number;
  reason: string;
  /** Your collection it fits, if any: Explore shelves things by it ("Because you collect …"). */
  mine?: { id: string; name: string; emoji: string } | null;
}
const shelfOf = (c: Collection | null) => (c ? { id: c.id, name: c.name, emoji: c.emoji } : null);

const match = (interests: Map<Topic, number>, topics: Topic[]) => topics.reduce((s, t) => s + (interests.get(t) ?? 0), 0);

export function rankCollections(mind: Mind | null, chats: Chat[], me: string, nameOf: (id: string) => string): Ranked<PublicCollection>[] {
  const interests = interestsOf(mind, chats, me);
  const friends = friendsOf(chats, me);
  return allPublic()
    .filter((c) => c.by !== me)
    .map((c) => {
      const mine = collectionFor(mind, c.topics);
      const byFriend = friends.has(c.by);
      const fresh = Math.max(0, 1 - (now - c.updatedAt) / (7 * DAY));
      const score = match(interests, c.topics) + (byFriend ? 6 : 0) + Math.log10(c.saves + 1) + fresh * 2;
      const reason = mine ? `Because you collect ${mine.emoji} ${mine.name}` : byFriend ? `${nameOf(c.by)} made this` : c.saves > 2000 ? "Popular on NOD" : `For ${c.topics.map((t) => TOPIC_LABEL[t]).slice(0, 2).join(" & ")}`;
      return { value: c, score, reason, mine: shelfOf(mine) };
    })
    .sort((a, b) => b.score - a.score);
}

/** Groups listed on Explore that you aren't in yet. */
export function rankGroups(mind: Mind | null, chats: Chat[], me: string, nameOf: (id: string) => string): Ranked<Chat>[] {
  const interests = interestsOf(mind, chats, me);
  const friends = friendsOf(chats, me);
  return chats
    .filter((c) => c.kind === "group" && !c.groupId && !c.removedAt && c.group?.discover && !c.memberIds.includes(me))
    .map((c) => {
      const d = c.group!.discover!;
      const inside = c.memberIds.filter((u) => friends.has(u));
      const mine = collectionFor(mind, d.topics as Topic[]);
      const score = match(interests, d.topics as Topic[]) + inside.length * 4 + Math.log10(d.members);
      const reason = inside.length
        ? peopleLine(inside.map(nameOf), "here")
        : mine ? `For your ${mine.emoji} ${mine.name}` : `${d.members.toLocaleString()} people`;
      return { value: c, score, reason };
    })
    .sort((a, b) => b.score - a.score);
}

/** Single things worth saving, from collections that fit yours, minus what you already have. */
export function rankItems(mind: Mind | null, chats: Chat[], me: string): Ranked<{ item: PublicItem; collection: PublicCollection }>[] {
  const interests = interestsOf(mind, chats, me);
  const have = new Set(Object.values(mind?.blocks ?? {}).map((b) => `${b.kind}:${b.title.toLowerCase()}`));
  return allPublicItems()
    .filter(({ item, collection }) => collection.by !== me && !have.has(`${item.kind}:${item.title.toLowerCase()}`))
    .map((x) => {
      const mine = collectionFor(mind, x.collection.topics);
      // Pictures and cards make the best tiles; a little variety per collection.
      const kindBoost = x.item.kind === "image" ? 1.2 : x.item.kind === "flashcard" || x.item.kind === "book" ? 0.8 : 0.4;
      const score = match(interests, x.collection.topics) + kindBoost + Math.log10(x.collection.saves + 1) / 2;
      return { value: x, score, reason: mine ? `For ${mine.emoji} ${mine.name}` : `From ${x.collection.emoji} ${x.collection.name}`, mine: shelfOf(mine) };
    })
    .filter((r) => r.score > 1.6)
    .sort((a, b) => b.score - a.score)
    // A mix: no more than two things from any one collection.
    .filter((r, _, all) => all.filter((o) => o.value.collection.id === r.value.collection.id).indexOf(r) < 2);
}

/** Friends' activity, newest first. */
export function friendActivity(chats: Chat[], me: string) {
  const friends = friendsOf(chats, me);
  return ACTIVITY.filter((a) => a.by !== me && friends.has(a.by)).sort((a, b) => b.at - a.at);
}

/** The Mind collection a public thing should go into: the best fit, else the one open last. */
export function suggestCollection(mind: Mind | null, topics: Topic[]) {
  return collectionFor(mind, topics) ?? mind?.collections.find((c) => c.id === mind.current && !isUnassigned(c)) ?? mind?.collections.find((c) => !isUnassigned(c)) ?? null;
}

/* ---------------------------------------------------------------------------
   Saving into Mind
--------------------------------------------------------------------------- */

/** One thing, into a collection's top level. Returns the new block id. */
export function saveItem(m: Mind, item: PublicItem, collectionId: string): { mind: Mind; id: string } {
  const id = newId();
  const block: Block = { ...asBlock(item, Date.now()), id, ...(item.kind === "todo" ? { done: false } : {}) };
  land(id);
  return { mind: place({ ...m, blocks: { ...m.blocks, [id]: block } }, id, { collectionId }), id };
}

/** A whole public collection, copied in: its items (and their tags) yours to change, laid out as it was. */
export function addCollection(m: Mind, pc: PublicCollection): { mind: Mind; id: string } {
  const col: Collection = { ...makeCollection(pc.name, pc.emoji, pc.tone), from: { id: pc.id, by: pc.by }, view: pc.view };
  const blocks = { ...m.blocks };
  col.items = pc.items.map((item) => {
    const id = newId();
    blocks[id] = { ...asBlock(item, Date.now()), id };
    return id;
  });
  land(...col.items);
  return { mind: { ...m, blocks, collections: [...m.collections, col] }, id: col.id };
}

/** Already added (by this person) from Explore. */
export const addedFrom = (mind: Mind | null, pcId: string) => mind?.collections.find((c) => c.from?.id === pcId) ?? null;

/** Groups listed on Explore: members can join straight away. */
export const isDiscoverable = (c: Chat) => !!groupInfo(c).discover;

/* ---------------------------------------------------------------------------
   The wall: Explore as one wall of things, with collections in it
--------------------------------------------------------------------------- */

export type WallThing = { kind: "thing"; item: PublicItem; collection: PublicCollection };
export type WallCollection = { kind: "collection"; collection: PublicCollection };
export type WallEntry = WallThing | WallCollection;

/** A stable 0..1 from a string, so the wall mixes the same way every time. */
const jitter = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};
/** Pictures make the wall; words come in now and then. */
const pictureOf = (item: PublicItem) => item.image ?? item.attachment?.url ?? item.attachment?.dataUrl ?? null;
/** A picture's height over its width, when it's known. */
export function shapeOf(item: PublicItem): number | null {
  const src = item.image ?? "";
  const id = src.match(/photo-([0-9a-f]+-[0-9a-f]+)/)?.[1];
  if (id && SHAPES[id]) return SHAPES[id];
  const a = item.attachment;
  return a?.width && a.height ? a.height / a.width : null;
}
export const hasPicture = (item: PublicItem) => !!pictureOf(item) && (item.kind === "image" || item.kind === "book" || item.kind === "video");

/**
 * What Explore shows: things from public collections, and every few rows one
 * of those collections whole. "For you" ranks by what you keep, the topics
 * you picked and the people you follow; a topic shows just that topic.
 */
export function wallFor(mind: Mind | null, chats: Chat[], me: string, opts: { topic: Topic | null; picks: string[]; follows: string[] }): WallEntry[] {
  const interests = interestsOf(mind, chats, me);
  // What you picked leads: anything on a picked topic comes before anything guessed from your Mind.
  const picked = new Set(opts.picks);
  const follows = new Set(opts.follows);
  const cols = allPublic()
    .filter((c) => c.by !== me && (!opts.topic || c.topics.includes(opts.topic)))
    .map((c) => ({ c, score: (c.topics.some((t) => picked.has(t)) ? 1000 : 0) + match(interests, c.topics) + (follows.has(c.by) ? 8 : 0) + Math.log10(c.saves + 1) + jitter(c.id) }))
    .sort((a, b) => b.score - a.score);
  // Things: up to four from each collection, mixed across collections. Pictures make the wall:
  // words come one per collection (a few more on a topic that's mostly words).
  const things = cols.flatMap(({ c, score }) => {
    const pics = c.items.filter(hasPicture);
    const words = c.items.filter((i) => !hasPicture(i) && i.kind !== "todo").slice(0, pics.length || !opts.topic ? 1 : 3);
    return [...pics.slice(0, 4), ...words].map((item) => ({ item, collection: c, score: score + (hasPicture(item) ? 3 : 0) + jitter(item.id) * 2 }));
  }).sort((a, b) => b.score - a.score);
  const out: WallEntry[] = [];
  let ci = 0;
  // A collection shown whole isn't repeated thing by thing right around it: its things wait a run.
  let shown: string | null = null;
  // Collections shown whole: the ones with pictures first, so the wall opens on something to look at.
  const covers = [...cols].sort((a, b) => Number(b.c.items.filter(hasPicture).length >= 2) - Number(a.c.items.filter(hasPicture).length >= 2));
  const strip = () => { const c = covers[ci++]?.c; if (c) { out.push({ kind: "collection", collection: c }); shown = c.id; } };
  strip();
  const queue = [...things];
  for (let i = 0; queue.length; i++) {
    const next = covers[ci]?.c.id;
    const at = queue.findIndex((t) => t.collection.id !== shown && t.collection.id !== next);
    const [t] = queue.splice(at < 0 ? 0 : at, 1);
    out.push({ kind: "thing", item: t.item, collection: t.collection });
    if ((i + 1) % 6 === 0) strip();
  }
  while (covers[ci] && out.length < 4) out.push({ kind: "collection", collection: covers[ci++].c });
  return out;
}

/** Topics that have something on Explore, the ones you picked first. */
export function topicsOnExplore(picks: string[]): Topic[] {
  const live = new Set(allPublic().flatMap((c) => c.topics));
  const all = (Object.keys(TOPIC_LABEL) as Topic[]).filter((t) => live.has(t));
  return [...picks.filter((t): t is Topic => all.includes(t as Topic)), ...all.filter((t) => !picks.includes(t))];
}

/** Collections like this one: sharing topics, then by how many people keep them. */
export function relatedCollections(pc: Pick<PublicCollection, "id" | "topics">, limit = 6): PublicCollection[] {
  return allPublic()
    .filter((c) => c.id !== pc.id)
    .map((c) => ({ c, overlap: c.topics.filter((t) => pc.topics.includes(t)).length }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.c.saves - a.c.saves)
    .slice(0, limit)
    .map((x) => x.c);
}

/** More like a thing: the rest of its collection, then things from collections like it. */
export function moreLike(item: PublicItem, from: PublicCollection, limit = 18): WallThing[] {
  const same = from.items.filter((i) => i.id !== item.id && i.kind !== "todo");
  const near = relatedCollections(from, 4).flatMap((c) => c.items.filter(hasPicture).slice(0, 4).map((i) => ({ i, c })));
  const list: WallThing[] = [
    ...same.filter(hasPicture).map((i) => ({ kind: "thing" as const, item: i, collection: from })),
    ...near.map(({ i, c }) => ({ kind: "thing" as const, item: i, collection: c })),
    ...same.filter((i) => !hasPicture(i)).map((i) => ({ kind: "thing" as const, item: i, collection: from })),
  ];
  return list.slice(0, limit);
}

/** Everything someone has made public. */
export const collectionsBy = (who: string) => allPublic().filter((c) => c.by === who).sort((a, b) => b.saves - a.saves);

/** The demo's numbers for people and things, the same every time (the real app counts them). */
export const followersOf = (who: string) => {
  const own = collectionsBy(who).reduce((s, c) => s + c.saves, 0);
  return Math.round(own / 3 + 40 + jitter(who) * 300);
};
export const savesOf = (item: PublicItem, from: PublicCollection) => Math.max(3, Math.round((from.saves / 12) * (0.4 + jitter(item.id))));

/** Public collections that fit one of your own, for "Related on Explore" under it in Mind. */
export function relatedToMine(m: Mind, c: Collection, me: string, limit = 4): PublicCollection[] {
  const topics = topicsOf(m, c);
  if (!topics.length) return [];
  return relatedCollections({ id: c.published ? publishedId(me, c.id) : c.id, topics }, limit + 8)
    // Not yours, not where this one came from, nothing you've already added.
    .filter((pc) => pc.by !== me && pc.items.length > 0 && pc.id !== c.from?.id && !addedFrom(m, pc.id))
    .slice(0, limit);
}
