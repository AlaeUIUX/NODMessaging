/**
 * Palettes the way Coolors makes them: lock the colours you like, generate
 * the rest around them, add one, take one away, step back through what you
 * generated. The maths is in OKLCH (lightness, chroma, hue), where equal steps
 * look equal, so a generated palette spreads evenly from dark to light and its
 * hues follow a colour-wheel scheme seeded by a locked colour.
 */

/** One colour of a palette being made. The id stays put while its colour changes, so a band can animate. */
export interface Swatch { id: string; hex: string; locked?: boolean }

export const MIN_COLORS = 2;
export const MAX_COLORS = 8;

let lastId = 0;
export const swatchId = () => `sw${++lastId}`;
export const swatchesOf = (colors: string[]): Swatch[] => colors.map((hex) => ({ id: swatchId(), hex }));

type Rgb = [number, number, number];
type Lab = [number, number, number];

/* ---------------------------------------------------------------------------
   Hex, sRGB and OKLab
--------------------------------------------------------------------------- */

export const isHex = (s: string) => /^#?([\da-f]{3}|[\da-f]{6})$/i.test(s.trim());

export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const byte = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
export const rgbToHex = ([r, g, b]: Rgb) => `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
/** "#abc" or "8a9a7b" as "#8A9A7B". */
export const normalHex = (s: string) => rgbToHex(hexToRgb(s));

const toLinear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toByte = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklab([r8, g8, b8]: Rgb): Lab {
  const r = toLinear(r8), g = toLinear(g8), b = toLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
/** OKLab to linear sRGB, unclamped: values outside 0–1 are out of gamut. */
function oklabToLinear([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const labToHex = (lab: Lab) => rgbToHex(oklabToLinear(lab).map((v) => toByte(Math.min(1, Math.max(0, v)))) as Rgb);

export function toOklch(hex: string) {
  const [l, a, b] = rgbToOklab(hexToRgb(hex));
  return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** The colour at this lightness, chroma and hue, with chroma lowered until it can be shown. */
export function fromOklch(l: number, c: number, h: number) {
  const rad = (h * Math.PI) / 180;
  const at = (chroma: number): Lab => [l, chroma * Math.cos(rad), chroma * Math.sin(rad)];
  const fits = (lab: Lab) => oklabToLinear(lab).every((v) => v >= -0.0005 && v <= 1.0005);
  if (fits(at(c))) return labToHex(at(c));
  let lo = 0;
  let hi = c;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (fits(at(mid))) lo = mid; else hi = mid;
  }
  return labToHex(at(lo));
}

/** Dark text on light colours, light text on dark ones. */
export const inkOn = (hex: string) => (toOklch(hex).l > 0.7 ? "#1C1917" : "#FFFFFF");

/* ---------------------------------------------------------------------------
   Generating
--------------------------------------------------------------------------- */

/**
 * Hue offsets per position, and how often each scheme comes up: mostly
 * neighbours on the wheel and one opposite accent, which is what makes most
 * good palettes; now and then something bolder.
 */
const SCHEMES: { weight: number; offsets: number[] }[] = [
  { weight: 30, offsets: [0, 24, 48, -24, -48, 12, 36, -12] }, // analogous
  { weight: 15, offsets: [0, 0, 10, -10, 0, 6, -6, 0] }, // one hue
  { weight: 25, offsets: [0, 180, 16, -16, 196, 8, 172, 0] }, // complementary
  { weight: 15, offsets: [0, 150, 210, 20, -20, 160, 200, 0] }, // split complementary
  { weight: 10, offsets: [0, 120, 240, 16, 136, 256, 0, 120] }, // triad
  { weight: 5, offsets: [0, 90, 180, 270, 45, 135, 225, 315] }, // square
];
const pickScheme = (random: () => number) => {
  let r = random() * SCHEMES.reduce((n, s) => n + s.weight, 0);
  for (const s of SCHEMES) if ((r -= s.weight) < 0) return s.offsets;
  return SCHEMES[0].offsets;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Which lightness step each position gets: dark to light, light to dark, or mixed up. */
function arrangement(n: number, random: () => number) {
  const steps = Array.from({ length: n }, (_, i) => i);
  const r = random();
  if (r < 0.35) return steps;
  if (r < 0.6) return steps.reverse();
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [steps[i], steps[j]] = [steps[j], steps[i]];
  }
  return steps;
}

/**
 * New colours for every unlocked swatch. Locked ones stay exactly as they are
 * and set the hue the others are built around.
 */
export function generate(current: Swatch[], random: () => number = Math.random): Swatch[] {
  const n = current.length;
  const anchors = current.filter((s) => s.locked).map((s) => toOklch(s.hex)).filter((c) => c.c > 0.025);
  const base = anchors.length ? anchors[Math.floor(random() * anchors.length)].h : random() * 360;
  const offsets = pickScheme(random);
  // One saturation for the whole palette, from muted to vivid, so the colours sit together.
  const vivid = anchors.length ? clamp(anchors.reduce((n, a) => n + a.c, 0) / anchors.length, 0.04, 0.17) : 0.04 + random() * 0.13;
  const lo = 0.24 + random() * 0.14;
  const hi = 0.88 + random() * 0.08;
  const steps = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / Math.max(1, n - 1));
  const order = arrangement(n, random);
  return current.map((s, i) => {
    if (s.locked) return s;
    const l = clamp(steps[order[i]] + (random() - 0.5) * 0.05, 0.14, 0.97);
    // The ends of the ladder can't hold much colour; often they're near-neutral, like a good off-white.
    const room = Math.max(0.25, 1 - Math.abs(l - 0.6) * 1.6);
    const neutral = (l > 0.88 || l < 0.3) && random() < 0.55;
    const c = neutral ? 0.006 + random() * 0.02 : vivid * (0.8 + random() * 0.4) * room;
    const h = (base + offsets[i % offsets.length] + (random() - 0.5) * 12 + 360) % 360;
    return { ...s, hex: fromOklch(l, c, h) };
  });
}

/** A fresh palette of `n` colours. */
export const randomPalette = (n = 5) => generate(swatchesOf(Array.from({ length: n }, () => "#000000")));

/** The colour halfway between two others (in OKLab, so it looks halfway), the way Coolors adds one between. */
export function between(a: string, b: string) {
  const x = rgbToOklab(hexToRgb(a));
  const y = rgbToOklab(hexToRgb(b));
  return labToHex([(x[0] + y[0]) / 2, (x[1] + y[1]) / 2, (x[2] + y[2]) / 2]);
}

/** One more colour that belongs with these. */
export function another(colors: string[], random: () => number = Math.random) {
  const out = generate([...colors.map((hex) => ({ id: "", hex, locked: true })), { id: "", hex: "#000000" }], random);
  return out[out.length - 1].hex;
}

/* ---------------------------------------------------------------------------
   Names: the nearest of a few well-known colours, like Coolors shows
--------------------------------------------------------------------------- */

const NAMES: [string, string][] = [
  ["Black", "#000000"], ["Jet", "#343434"], ["Onyx", "#353935"], ["Charcoal", "#36454F"], ["Gunmetal", "#2A3439"],
  ["Slate", "#708090"], ["Grey", "#808080"], ["Silver", "#C0C0C0"], ["Platinum", "#E5E4E2"], ["Gainsboro", "#DCDCDC"],
  ["White", "#FFFFFF"], ["Snow", "#FFFAFA"], ["Ivory", "#FFFFF0"], ["Cream", "#FFFDD0"], ["Eggshell", "#F0EAD6"],
  ["Linen", "#FAF0E6"], ["Bone", "#E3DAC9"], ["Beige", "#F5F5DC"], ["Champagne", "#F7E7CE"], ["Sand", "#C2B280"],
  ["Khaki", "#C3B091"], ["Tan", "#D2B48C"], ["Taupe", "#483C32"], ["Mushroom", "#BDACA3"], ["Umber", "#635147"],
  ["Coffee", "#6F4E37"], ["Chocolate", "#7B3F00"], ["Espresso", "#4E312D"], ["Walnut", "#5C4033"], ["Brown", "#964B00"],
  ["Caramel", "#AF6E4D"], ["Russet", "#80461B"], ["Rust", "#B7410E"], ["Burnt sienna", "#E97451"], ["Burnt orange", "#CC5500"],
  ["Terracotta", "#E2725B"], ["Clay", "#B66A50"], ["Copper", "#B87333"], ["Bronze", "#CD7F32"], ["Sienna", "#882D17"],
  ["Mahogany", "#C04000"], ["Chestnut", "#954535"], ["Maroon", "#800000"], ["Burgundy", "#800020"], ["Wine", "#722F37"],
  ["Oxblood", "#4A0000"], ["Rosewood", "#65000B"], ["Crimson", "#DC143C"], ["Cardinal", "#C41E3A"], ["Scarlet", "#FF2400"],
  ["Red", "#FF0000"], ["Vermilion", "#E34234"], ["Tomato", "#FF6347"], ["Coral", "#FF7F50"], ["Salmon", "#FA8072"],
  ["Peach", "#FFE5B4"], ["Apricot", "#FBCEB1"], ["Melon", "#FDBCB4"], ["Tangerine", "#F28500"], ["Orange", "#FF8C00"],
  ["Pumpkin", "#FF7518"], ["Amber", "#FFBF00"], ["Saffron", "#F4C430"], ["Marigold", "#EAA221"], ["Mustard", "#E1AD01"],
  ["Honey", "#EBA937"], ["Gold", "#FFD700"], ["Goldenrod", "#DAA520"], ["Ochre", "#CC7722"], ["Flax", "#EEDC82"],
  ["Vanilla", "#F3E5AB"], ["Butter", "#FFF1B5"], ["Lemon", "#FFF44F"], ["Yellow", "#FFFF00"], ["Lime", "#BFFF00"],
  ["Chartreuse", "#7FFF00"], ["Olive", "#808000"], ["Olive drab", "#6B8E23"], ["Moss", "#8A9A5B"], ["Sage", "#9CAF88"],
  ["Pistachio", "#93C572"], ["Celadon", "#ACE1AF"], ["Mint", "#3EB489"], ["Seafoam", "#9FE2BF"], ["Jade", "#00A86B"],
  ["Emerald", "#50C878"], ["Kelly green", "#4CBB17"], ["Green", "#008000"], ["Forest", "#228B22"], ["Hunter green", "#355E3B"],
  ["Pine", "#01796F"], ["Bottle green", "#006A4E"], ["Viridian", "#40826D"], ["Sea green", "#2E8B57"], ["Teal", "#008080"],
  ["Deep teal", "#0A4D4F"], ["Persian green", "#00A693"], ["Turquoise", "#40E0D0"], ["Aquamarine", "#7FFFD4"], ["Cyan", "#00FFFF"],
  ["Celeste", "#B2FFFF"], ["Powder blue", "#B0E0E6"], ["Sky blue", "#87CEEB"], ["Baby blue", "#89CFF0"], ["Steel blue", "#4682B4"],
  ["Cerulean", "#007BA7"], ["Azure", "#007FFF"], ["Cornflower", "#6495ED"], ["Denim", "#1560BD"], ["Royal blue", "#4169E1"],
  ["Cobalt", "#0047AB"], ["Sapphire", "#0F52BA"], ["Blue", "#0000FF"], ["Ultramarine", "#120A8F"], ["Navy", "#000080"],
  ["Midnight", "#191970"], ["Oxford blue", "#002147"], ["Prussian blue", "#003153"], ["Space cadet", "#1D2951"], ["Indigo", "#4B0082"],
  ["Periwinkle", "#CCCCFF"], ["Lavender", "#E6E6FA"], ["Lilac", "#C8A2C8"], ["Wisteria", "#C9A0DC"], ["Thistle", "#D8BFD8"],
  ["Mauve", "#E0B0FF"], ["Orchid", "#DA70D6"], ["Amethyst", "#9966CC"], ["Violet", "#8F00FF"], ["Purple", "#800080"],
  ["Plum", "#8E4585"], ["Eggplant", "#614051"], ["Byzantium", "#702963"], ["Magenta", "#FF00FF"], ["Rose", "#FF007F"],
  ["Raspberry", "#E30B5C"], ["Cerise", "#DE3163"], ["Hot pink", "#FF69B4"], ["Pink", "#FFC0CB"], ["Blush", "#DE5D83"],
  ["Puce", "#CC8899"], ["Old rose", "#C08081"], ["Dusty rose", "#C9A9A6"],
];
const NAMED = NAMES.map(([name, hex]) => ({ name, lab: rgbToOklab(hexToRgb(hex)) }));

export function colorName(hex: string) {
  const [l, a, b] = rgbToOklab(hexToRgb(hex));
  let best = NAMED[0];
  let dist = Infinity;
  for (const n of NAMED) {
    const d = (n.lab[0] - l) ** 2 + (n.lab[1] - a) ** 2 + (n.lab[2] - b) ** 2;
    if (d < dist) { dist = d; best = n; }
  }
  return best.name;
}

/** "Sage & Rust": the two most colourful names in a palette, for when it isn't given one. */
export function paletteName(colors: string[]) {
  const names = [...colors]
    .sort((x, y) => toOklch(y).c - toOklch(x).c)
    .map(colorName)
    .filter((n, i, all) => all.indexOf(n) === i);
  return names.length > 1 ? `${names[0]} & ${names[1]}` : names[0] ?? "Palette";
}
