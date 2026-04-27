import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export type ParsedRecipe = {
  title: string;
  ingredients: string[];
  steps: string[];
  source: "jsonld" | "readability" | "empty";
  rawWarnings?: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toStringArray(v: unknown): string[] {
  if (typeof v === "string") return [v].filter(Boolean);
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === "string") return item;
        if (isRecord(item) && typeof item.text === "string") return item.text;
        if (isRecord(item) && typeof item["@type"] === "string" && item.name)
          return String(item.name);
        return null;
      })
      .filter((x): x is string => Boolean(x));
  }
  return [];
}

function extractHowToSteps(v: unknown): string[] {
  if (typeof v === "string") {
    return v
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === "string") return item;
        if (isRecord(item) && typeof item.text === "string") return item.text;
        if (isRecord(item) && isRecord(item.itemListElement)) {
          const el = item.itemListElement;
          return extractHowToSteps(el);
        }
        return null;
      })
      .flat()
      .filter((x): x is string => Boolean(x));
  }
  return [];
}

function parseRecipeObject(obj: Record<string, unknown>): ParsedRecipe | null {
  const t = obj["@type"];
  const isRecipe =
    t === "Recipe" ||
    (Array.isArray(t) && t.includes("Recipe")) ||
    t === "https://schema.org/Recipe";
  if (!isRecipe) return null;

  const name = typeof obj.name === "string" ? obj.name : "Untitled recipe";
  const ingredients = toStringArray(obj.recipeIngredient);
  const instructions = extractHowToSteps(obj.recipeInstructions);

  if (!ingredients.length && !instructions.length) {
    return {
      title: name,
      ingredients: [],
      steps: [],
      source: "jsonld",
      rawWarnings: ["Recipe found in JSON-LD but no ingredients or steps."],
    };
  }

  return {
    title: name,
    ingredients,
    steps: instructions,
    source: "jsonld",
  };
}

function walkJsonLd(data: unknown, out: ParsedRecipe[]): void {
  if (Array.isArray(data)) {
    for (const item of data) walkJsonLd(item, out);
    return;
  }
  if (!isRecord(data)) return;

  if (data["@graph"] && Array.isArray(data["@graph"])) {
    for (const g of data["@graph"]) walkJsonLd(g, out);
  }

  const parsed = parseRecipeObject(data);
  if (parsed) out.push(parsed);

  if (Array.isArray(data["@type"]) && data["@type"].includes("Recipe")) {
    const p = parseRecipeObject(data);
    if (p) out[0] = p;
  }
}

export function extractJsonLdRecipe(html: string): ParsedRecipe | null {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const candidates: ParsedRecipe[] = [];

  for (const s of scripts) {
    const text = s.textContent?.trim();
    if (!text) continue;
    try {
      const data = JSON.parse(text) as unknown;
      walkJsonLd(data, candidates);
    } catch {
      // skip invalid JSON
    }
  }

  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) => {
    const sa = a.ingredients.length + a.steps.length;
    const sb = b.ingredients.length + b.steps.length;
    return sb > sa ? b : a;
  });
  return best;
}

export function extractReadability(html: string, url: string): ParsedRecipe {
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article) {
    return {
      title: "Imported page",
      ingredients: [],
      steps: [],
      source: "empty",
      rawWarnings: ["Could not extract main article text."],
    };
  }
  const text = article.textContent ?? "";
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    title: article.title || "Untitled",
    ingredients: [],
    steps: lines,
    source: "readability",
    rawWarnings: [
      "Heuristic extraction only — ingredients may need to be split manually.",
    ],
  };
}

const MAX_BYTES = 2_000_000;

export async function fetchAndParseUrl(url: string): Promise<{
  parsed: ParsedRecipe;
  htmlSnippet?: string;
}> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20_000);
  const res = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent":
        "RecipeCookbookBot/1.0 (+https://vercel.com) personal-import",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  clearTimeout(t);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} when fetching the URL`);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("Page is too large to import (max 2MB).");
  }
  const html = new TextDecoder("utf-8").decode(buf);

  const json = extractJsonLdRecipe(html);
  if (json && (json.ingredients.length || json.steps.length)) {
    return { parsed: json };
  }

  if (json && json.title && json.rawWarnings?.length) {
    return { parsed: json };
  }

  const fromRead = extractReadability(html, url);
  if (fromRead.source === "readability" && fromRead.steps.length) {
    return { parsed: fromRead, htmlSnippet: fromRead.steps.slice(0, 3).join("\n") };
  }

  if (json) {
    return { parsed: json };
  }

  return { parsed: fromRead };
}
