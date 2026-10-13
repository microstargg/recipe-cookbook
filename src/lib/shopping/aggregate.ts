/** Turn many recipe ingredient lines into one merged shopping line per item. Client-safe. */

import type { RecipeIngredient } from "@/lib/recipe-schema";
import { formatScaledAmount, parseAmountToNumber } from "@/lib/ingredient-utils";

/** Prep words that don't change what you buy. */
const PREP_WORDS = [
  "chopped", "finely", "roughly", "thinly", "thickly", "diced", "minced", "sliced", "grated",
  "crushed", "peeled", "deseeded", "de-seeded", "trimmed", "halved", "quartered", "shredded",
  "torn", "beaten", "melted", "softened", "cubed", "rinsed", "drained", "washed", "zested",
  "juiced", "fresh", "freshly", "large", "small", "medium", "ripe", "about", "approx",
  "heaped", "level", "packed", "optional", "to taste", "for serving", "to serve", "for garnish",
  "plus extra", "plus more", "room temperature", "at room temperature", "boneless", "skinless",
];

// "chopped tomatoes" is a product (a tin), not prep.
const PREP_RE = new RegExp(
  `\\b(${PREP_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b(?!\\s+tomato)`,
  "gi",
);

/** Container/measure words written into the name: "tin chickpeas", "a pinch of salt". */
const LEADING_MEASURE_RE =
  /^(?:a\s+|an\s+)?(tins?|cans?|jars?|packs?|packets?|bags?|bunch(?:es)?|handfuls?|pinch(?:es)?|dash(?:es)?|sprigs?|knobs?|splash(?:es)?|drizzle)\s+(?:of\s+)?(.+)$/i;
const TRAILING_CLOVE_RE = /^(.+?)\s+cloves?$/i;

/**
 * Move a container or measure out of the name into the unit ("garlic cloves" → garlic, clove).
 * `tinned` marks tins/cans/jars so the item lands in Tins & jars.
 */
export function splitMeasureFromName(
  name: string,
  unit: string | null,
): { name: string; unit: string | null; tinned: boolean } {
  const trimmed = name.trim();
  const lead = trimmed.match(LEADING_MEASURE_RE);
  if (lead) {
    return {
      name: lead[2],
      unit: unit ?? normalizeUnit(lead[1]),
      tinned: /^(tin|can|jar)/i.test(lead[1]),
    };
  }
  const clove = trimmed.match(TRAILING_CLOVE_RE);
  if (clove && (!unit || /^cloves?$/i.test(unit))) {
    return { name: clove[1], unit: "clove", tinned: false };
  }
  return { name: trimmed, unit, tinned: /^(tin|can|jar)s?$/i.test(unit ?? "") };
}

/** Irregular or awkward plurals; everything else just drops a trailing "s"/"es". */
const SINGULAR: Record<string, string> = {
  leaves: "leaf",
  tomatoes: "tomato",
  potatoes: "potato",
  chillies: "chilli",
  chilies: "chili",
  berries: "berry",
  cherries: "cherry",
  anchovies: "anchovy",
  radishes: "radish",
  peaches: "peach",
  sandwiches: "sandwich",
  loaves: "loaf",
  knives: "knife",
};

/** Words that end in "s" but aren't plurals; leave them alone. */
const KEEP_S = new Set([
  "oats", "peas", "chickpeas", "lentils", "noodles", "beans", "greens", "hummus", "houmous",
  "couscous", "asparagus", "molasses", "swiss", "brussels", "lardons", "capers", "olives",
  "sultanas", "raisins", "nuts", "seeds", "flakes", "herbs", "sprouts", "crisps", "biscuits",
  "grass", "cress", "watercress", "bass", "glass", "mussels", "prawns", "breadcrumbs",
  "dates", "walnuts", "pecans", "almonds", "cashews", "peanuts", "chips", "oats",
]);

function singularizeWord(word: string): string {
  if (SINGULAR[word]) return SINGULAR[word];
  if (KEEP_S.has(word) || word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

/**
 * Canonical item name used to merge lines: lowercase, no prep words or notes,
 * last word singular. "2 Large Onions, finely chopped" → "onion".
 */
export function normalizeIngredientName(name: string): string {
  let s = name.toLowerCase();
  s = s.replace(/\([^)]*\)/g, " "); // notes in brackets
  s = s.split(/[,;]| - | – /)[0]; // "onion, chopped"
  s = s.replace(PREP_RE, " ");
  s = s.trim().replace(LEADING_MEASURE_RE, "$2");
  s = s.replace(/^\s*(of|a|an|the)\s+/, " ");
  s = s.replace(/[^a-z0-9àâçéèêëîïôûùüÿñæœ'&\- ]/g, " ");
  s = s.replace(/\s+(and|or)\s*$/, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return name.trim().toLowerCase();
  const words = s.split(" ");
  words[words.length - 1] = singularizeWord(words[words.length - 1]);
  return words.join(" ");
}

type Dimension = "mass" | "volume" | "spoon" | "count";

/** Unit → dimension and multiplier into that dimension's base unit (g, ml, tsp, or the item). */
const UNITS: Record<string, { dim: Dimension; base: string; factor: number }> = {
  g: { dim: "mass", base: "g", factor: 1 },
  gram: { dim: "mass", base: "g", factor: 1 },
  kg: { dim: "mass", base: "g", factor: 1000 },
  kilogram: { dim: "mass", base: "g", factor: 1000 },
  oz: { dim: "mass", base: "g", factor: 28.35 },
  ounce: { dim: "mass", base: "g", factor: 28.35 },
  lb: { dim: "mass", base: "g", factor: 453.6 },
  pound: { dim: "mass", base: "g", factor: 453.6 },
  ml: { dim: "volume", base: "ml", factor: 1 },
  millilitre: { dim: "volume", base: "ml", factor: 1 },
  milliliter: { dim: "volume", base: "ml", factor: 1 },
  l: { dim: "volume", base: "ml", factor: 1000 },
  litre: { dim: "volume", base: "ml", factor: 1000 },
  liter: { dim: "volume", base: "ml", factor: 1000 },
  cup: { dim: "volume", base: "ml", factor: 240 },
  tsp: { dim: "spoon", base: "tsp", factor: 1 },
  teaspoon: { dim: "spoon", base: "tsp", factor: 1 },
  tbsp: { dim: "spoon", base: "tsp", factor: 3 },
  tbs: { dim: "spoon", base: "tsp", factor: 3 },
  tablespoon: { dim: "spoon", base: "tsp", factor: 3 },
};

/** "Cloves" → "clove", "Tbsps." → "tbsp"; size words (large/medium) count as no unit. */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  let u = unit.toLowerCase().replace(/\.$/, "").trim();
  if (!u || ["large", "medium", "small", "whole"].includes(u)) return null;
  if (u === "lbs") return "lb";
  if (u === "pcs" || u === "pc" || u === "piece" || u === "pieces") return null;
  if (u.endsWith("es") && ["pinches", "dashes", "bunches", "boxes"].includes(u)) u = u.slice(0, -2);
  else if (u.endsWith("s") && u.length > 2 && u !== "ls") u = u.slice(0, -1);
  if (u === "ls") u = "l";
  if (u === "tbsp" || u === "tsp" || u === "tb") return u === "tb" ? "tbsp" : u;
  if (u === "package" || u === "pkg") return "pack";
  return u;
}

export type ShoppingSource = { amount: string | null; unit: string | null; name: string; from: string };

export type MergedItem = {
  key: string;
  name: string;
  /** Human quantity, e.g. "750 g", "3", "2 tbsp + a pinch". Empty when no amounts were given. */
  quantity: string;
  /** Unit hint for aisle classification ("tin" for anything bought in a tin/can/jar). */
  classifyUnit: string | null;
  sources: string[];
};

function formatMass(g: number): string {
  if (g >= 1000) return `${formatDecimal(g / 1000)} kg`;
  return `${Math.round(g)} g`;
}

function formatVolume(ml: number): string {
  if (ml >= 1000) return `${formatDecimal(ml / 1000)} l`;
  return `${Math.round(ml)} ml`;
}

function formatDecimal(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function formatSpoons(tsp: number): string {
  // Whole tablespoons read better than "9 tsp".
  if (tsp >= 3 && Math.abs(tsp / 3 - Math.round(tsp / 3)) < 0.01) {
    return `${formatScaledAmount(tsp / 3)} tbsp`;
  }
  if (tsp >= 3) return `${formatScaledAmount(Math.round((tsp / 3) * 2) / 2)} tbsp`;
  return `${formatScaledAmount(tsp)} tsp`;
}

function pluralUnit(unit: string, n: number): string {
  if (n <= 1) return unit;
  if (/(ch|sh|x|s)$/.test(unit)) return `${unit}es`;
  return `${unit}s`;
}

/** Merge ingredient lines (already scaled) into one entry per normalized name. */
export function mergeIngredients(lines: ShoppingSource[]): MergedItem[] {
  type Acc = {
    key: string;
    name: string;
    totals: Map<string, number>; // base unit (or count unit) → amount
    loose: string[]; // amounts we couldn't add up ("a pinch", "to taste")
    classifyUnit: string | null;
    sources: Set<string>;
  };
  const byKey = new Map<string, Acc>();

  for (const line of lines) {
    if (!line.name.trim() || /^[—–-].+[—–-]$/.test(line.name.trim())) continue; // section headers
    const split = splitMeasureFromName(line.name, line.unit);
    const key = normalizeIngredientName(split.name);
    if (!key) continue;
    let acc = byKey.get(key);
    if (!acc) {
      acc = { key, name: key, totals: new Map(), loose: [], classifyUnit: null, sources: new Set() };
      byKey.set(key, acc);
    }
    acc.sources.add(line.from);

    const unit = normalizeUnit(split.unit);
    if (split.tinned) acc.classifyUnit = "tin";
    else acc.classifyUnit ??= unit;
    const n = line.amount ? parseAmountToNumber(line.amount) : null;
    if (n == null) {
      const text = [line.amount, unit].filter(Boolean).join(" ").trim();
      if (text && !acc.loose.includes(text)) acc.loose.push(text);
      continue;
    }
    const conv = unit ? UNITS[unit] : undefined;
    const bucket = conv ? conv.base : unit ?? "";
    acc.totals.set(bucket, (acc.totals.get(bucket) ?? 0) + n * (conv?.factor ?? 1));
  }

  return [...byKey.values()].map((acc) => {
    const parts: string[] = [];
    for (const [bucket, total] of acc.totals) {
      if (bucket === "g") parts.push(formatMass(total));
      else if (bucket === "ml") parts.push(formatVolume(total));
      else if (bucket === "tsp") parts.push(formatSpoons(total));
      else if (bucket === "") parts.push(formatScaledAmount(roundCount(total)));
      else parts.push(`${formatScaledAmount(roundCount(total))} ${pluralUnit(bucket, total)}`);
    }
    parts.push(...acc.loose);
    return {
      key: acc.key,
      name: acc.name,
      quantity: parts.join(" + "),
      classifyUnit: acc.classifyUnit,
      sources: [...acc.sources],
    };
  });
}

/** You can't buy 2.4 onions: round counts up to a whole one. */
function roundCount(n: number): number {
  return Math.ceil(n - 1e-9);
}

/** Scale and tag a recipe's ingredients for merging. */
export function toSources(
  ingredients: RecipeIngredient[],
  factor: number,
  from: string,
): ShoppingSource[] {
  return ingredients.map((i) => {
    const n = i.amount ? parseAmountToNumber(i.amount) : null;
    return {
      amount: n != null ? String(n * factor) : i.amount,
      unit: i.unit,
      name: i.name,
      from,
    };
  });
}
