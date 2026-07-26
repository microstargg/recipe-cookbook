import type { RecipeIngredient } from "@/lib/recipe-schema";

const UNIT_PATTERN =
  /^(cups?|cup|tablespoons?|tablespoon|tbsps?|tbsp|teaspoons?|teaspoon|tsps?|tsp|pounds?|pound|lbs?|lb|ounces?|ounce|oz|grams?|gram|kilograms?|kilogram|kgs?|kg|milliliters?|millilitre|millilitres?|mls?|ml|liters?|litre|litres?|ls?|l|cloves?|clove|cans?|can|tubs?|tub|packages?|package|pkgs?|pkg|slices?|slice|pieces?|piece|pcs?|pc|pinches?|pinch|dashes?|dash|handfuls?|handful|bunches?|bunch|heads?|head|stalks?|stalk|sprigs?|sprig|leaves|leaf|scoops?|scoop|bars?|bar|large|medium|small|whole)\b\.?/i;

/** Match qty at start: "1 1/2", "3/4", "2.5", "2-3", "2 to 3", "½", etc. */
const AMOUNT_RE =
  /^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+[.,]\d+)|(?:\d+)|(?:[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]))(?:\s*(?:-|–|—|to)\s*((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+[.,]\d+)|(?:\d+)|(?:[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])))?/i;

const UNICODE_FRAC: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function parseAmountToken(token: string): number | null {
  const t = token.trim().replace(",", ".");
  if (!t) return null;
  if (UNICODE_FRAC[t] != null) return UNICODE_FRAC[t];

  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den === 0 || !Number.isFinite(whole + num / den)) return null;
    return whole + num / den;
  }

  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (den === 0 || !Number.isFinite(num / den)) return null;
    return num / den;
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Parse a single amount string that may be a range ("2-3", "1/2 - 3/4"). */
export function parseAmountToNumber(amount: string): number | null {
  const range = amount
    .trim()
    .match(
      /^(.+?)\s*(?:-|–|—|to)\s*(.+)$/i,
    );
  if (range) {
    const a = parseAmountToken(range[1]);
    const b = parseAmountToken(range[2]);
    if (a == null || b == null) return null;
    return (a + b) / 2;
  }
  return parseAmountToken(amount);
}

export function formatScaledAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return String(value);

  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  // Prefer nice fractions for common cooking amounts
  const whole = Math.floor(abs + 1e-9);
  const frac = abs - whole;

  if (frac < 1e-6) {
    return `${sign}${whole}`;
  }

  const denominators = [2, 3, 4, 5, 6, 8];
  let bestNum = 0;
  let bestDen = 1;
  let bestErr = Infinity;
  for (const den of denominators) {
    const num = Math.round(frac * den);
    const err = Math.abs(frac - num / den);
    if (err < bestErr - 1e-9 || (Math.abs(err - bestErr) < 1e-9 && den < bestDen)) {
      bestErr = err;
      bestNum = num;
      bestDen = den;
    }
  }

  if (bestErr < 0.03 && bestNum > 0) {
    const g = gcd(bestNum, bestDen);
    const n = bestNum / g;
    const d = bestDen / g;
    if (n === d) {
      return `${sign}${whole + 1}`;
    }
    if (whole === 0) return `${sign}${n}/${d}`;
    return `${sign}${whole} ${n}/${d}`;
  }

  // Fallback: up to 2 decimal places, trim trailing zeros
  const rounded = Math.round(abs * 100) / 100;
  const s = String(rounded);
  return `${sign}${s}`;
}

export function scaleAmount(amount: string | null, factor: number): string | null {
  if (amount == null || !amount.trim()) return amount;
  if (!Number.isFinite(factor) || factor === 1) return amount;

  const trimmed = amount.trim();
  const range = trimmed.match(
    /^(.+?)\s*(?:-|–|—|to)\s*(.+)$/i,
  );
  if (range) {
    const a = parseAmountToken(range[1]);
    const b = parseAmountToken(range[2]);
    if (a == null || b == null) return amount;
    const sep = trimmed.includes(" to ") ? " to " : "-";
    return `${formatScaledAmount(a * factor)}${sep}${formatScaledAmount(b * factor)}`;
  }

  const n = parseAmountToken(trimmed);
  if (n == null) return amount;
  return formatScaledAmount(n * factor);
}

export function formatIngredient(i: RecipeIngredient): string {
  const parts = [i.amount, i.unit, i.name].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  let line = parts.join(" ").trim();
  if (!line) {
    line = (i.raw ?? i.name ?? "").trim();
  }
  if (i.note?.trim()) {
    line = `${line} (${i.note.trim()})`;
  }
  return line;
}

export function scaleIngredient(
  i: RecipeIngredient,
  factor: number,
): RecipeIngredient {
  if (factor === 1 || !Number.isFinite(factor)) return i;
  const scaled = scaleAmount(i.amount, factor);
  if (scaled === i.amount) return i;
  return { ...i, amount: scaled };
}

/**
 * Parse a free-text ingredient line into structured fields.
 * On failure returns { name: line, raw: line }.
 */
export function parseIngredientLine(line: string): RecipeIngredient {
  const raw = line.trim();
  if (!raw) {
    return { amount: null, unit: null, name: "", raw: null };
  }

  // Section headers like "— Sauce —"
  if (/^[—–-].+[—–-]$/.test(raw) || /^section:/i.test(raw)) {
    return { amount: null, unit: null, name: raw, raw, note: null };
  }

  let rest = raw;
  let amount: string | null = null;
  let unit: string | null = null;
  let note: string | null = null;

  // Pull trailing parenthetical note
  const noteMatch = rest.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (noteMatch && noteMatch[2].length < 80) {
    // Keep dual-unit notes like "(94g)" as note; also longer prep notes
    rest = noteMatch[1].trim();
    note = noteMatch[2].trim();
  }

  const amountMatch = rest.match(AMOUNT_RE);
  if (amountMatch) {
    const start = amountMatch[1];
    const end = amountMatch[2];
    amount = end ? `${start}-${end}` : start;
    // Use the matched span length from the regex
    const matchedLen = amountMatch[0].length;
    rest = rest.slice(matchedLen).trim();
  }

  if (rest) {
    const unitMatch = rest.match(UNIT_PATTERN);
    if (unitMatch) {
      unit = unitMatch[1].replace(/\.$/, "");
      rest = rest.slice(unitMatch[0].length).trim();
      // Drop leading "of "
      rest = rest.replace(/^of\s+/i, "");
    }
  }

  // Handle glued units like "750g" or "1tbsp"
  if (!unit && amount && rest) {
    const glued = rest.match(
      /^(g|kg|ml|l|oz|lb|lbs|tbsp|tsp|tbs|tsps|cups?)\b\.?\s*(.*)$/i,
    );
    if (glued) {
      unit = glued[1];
      rest = glued[2].trim();
    }
  }

  // Also handle amount glued to unit with no space: "750g baby potatoes"
  if (!amount) {
    const gluedStart = raw.match(
      /^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+[.,]\d+)|(?:\d+))(g|kg|ml|l|oz|lb|lbs|tbsp|tsp|tbs)\b\.?\s*(.*)$/i,
    );
    if (gluedStart) {
      amount = gluedStart[1];
      unit = gluedStart[2];
      rest = gluedStart[3].trim();
      // Re-extract note from rest if we used raw
      const nm = rest.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      if (nm && nm[2].length < 80) {
        rest = nm[1].trim();
        note = nm[2].trim();
      }
    }
  }

  const name = rest || raw;
  if (!amount && !unit && name === raw) {
    return { amount: null, unit: null, name: raw, raw, note: null };
  }

  return {
    amount,
    unit,
    name: name || raw,
    note,
    raw,
  };
}

export function parseRecipeYield(raw: unknown): {
  servings: number | null;
  servingsLabel: string | null;
} {
  if (raw == null) return { servings: null, servingsLabel: null };

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    const n = Math.round(raw);
    return { servings: n, servingsLabel: String(n) };
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const parsed = parseRecipeYield(item);
      if (parsed.servings != null || parsed.servingsLabel) return parsed;
    }
    return { servings: null, servingsLabel: null };
  }

  if (typeof raw !== "string") {
    return { servings: null, servingsLabel: null };
  }

  const label = raw.trim();
  if (!label) return { servings: null, servingsLabel: null };

  // "4", "4 servings", "Serves 4", "4-6", "4 to 6 people"
  const range = label.match(
    /(?:serves?|yield|makes?)?\s*:?\s*(\d+)\s*(?:-|–|—|to)\s*(\d+)/i,
  );
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    // Prefer the lower end as base servings for scaling
    return { servings: a, servingsLabel: label };
  }

  const single = label.match(
    /(?:serves?|yield|makes?)?\s*:?\s*(\d+(?:\.\d+)?)\s*(?:servings?|portions?|people|persons?)?/i,
  );
  if (single) {
    const n = Math.round(Number(single[1]));
    if (n > 0) return { servings: n, servingsLabel: label };
  }

  // Leading number fallback
  const lead = label.match(/^(\d+)/);
  if (lead) {
    const n = Number(lead[1]);
    if (n > 0) return { servings: n, servingsLabel: label };
  }

  return { servings: null, servingsLabel: label };
}

/** Normalize legacy string[] or mixed JSON into RecipeIngredient[]. */
export function coerceIngredients(raw: unknown): RecipeIngredient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") {
        return parseIngredientLine(item);
      }
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        const name =
          typeof o.name === "string"
            ? o.name
            : typeof o.item === "string"
              ? o.item
              : typeof o.raw === "string"
                ? o.raw
                : "";
        if (!name.trim() && typeof o.raw !== "string") return null;
        return {
          amount:
            o.amount == null
              ? null
              : typeof o.amount === "number"
                ? String(o.amount)
                : String(o.amount).trim() || null,
          unit:
            o.unit == null
              ? null
              : typeof o.unit === "string"
                ? o.unit.trim() || null
                : String(o.unit),
          name: name.trim() || String(o.raw ?? "").trim(),
          note:
            typeof o.note === "string"
              ? o.note
              : typeof o.notes === "string"
                ? o.notes
                : null,
          raw: typeof o.raw === "string" ? o.raw : null,
        } satisfies RecipeIngredient;
      }
      return null;
    })
    .filter((x): x is RecipeIngredient => x != null && Boolean(x.name.trim()));
}
