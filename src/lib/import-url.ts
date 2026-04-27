import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export type ParsedRecipe = {
  title: string;
  ingredients: string[];
  steps: string[];
  source: "jsonld" | "readability" | "empty" | "next-data";
  rawWarnings?: string[];
  /** Resolved absolute http(s) URL for the primary recipe image, if found. */
  coverImageUrl?: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function resolveUrl(pageUrl: string, ref: string): string | null {
  try {
    const trimmed = ref.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith("data:")) return null;
    return new URL(trimmed, pageUrl).href;
  } catch {
    return null;
  }
}

function isSafeHttpUrl(href: string | null): href is string {
  if (!href) return false;
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function extractSchemaImage(raw: unknown, pageUrl: string): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const u = resolveUrl(pageUrl, raw);
    return isSafeHttpUrl(u) ? u : null;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const u = extractSchemaImage(item, pageUrl);
      if (u) return u;
    }
    return null;
  }
  if (isRecord(raw)) {
    if (typeof raw.url === "string") {
      const u = resolveUrl(pageUrl, raw.url);
      if (isSafeHttpUrl(u)) return u;
    }
    if (Array.isArray(raw.url)) {
      for (const x of raw.url) {
        if (typeof x === "string") {
          const u = resolveUrl(pageUrl, x);
          if (isSafeHttpUrl(u)) return u;
        }
      }
    }
    if (typeof raw.contentUrl === "string") {
      const u = resolveUrl(pageUrl, raw.contentUrl);
      if (isSafeHttpUrl(u)) return u;
    }
    if (raw.image != null) {
      const nested = extractSchemaImage(raw.image, pageUrl);
      if (nested) return nested;
    }
  }
  return null;
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

const MAX_FALLBACK_STEP_LINES = 120;

/** ActivityPub / federated payloads are JSON; treating them as HTML breaks Readability (one giant "line"). */
function isLikelySerializedJsonOrActivityPubLine(line: string): boolean {
  const t = line.trimStart();
  if (t.length < 60 || !t.startsWith("{")) return false;
  return (
    t.includes('"@context"') ||
    t.includes("activitystreams") ||
    t.includes('"type":"Note"') ||
    t.includes('"type": "Note"')
  );
}

function filterReadabilityLines(lines: string[]): string[] {
  return lines.filter((l) => !isLikelySerializedJsonOrActivityPubLine(l));
}

function wrapHtmlFragmentForReadability(htmlFragment: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${htmlFragment}</body></html>`;
}

function isActivityStreamsNote(o: Record<string, unknown>): boolean {
  const t = o["@type"] ?? o.type;
  const noteLike = (s: string) =>
    s === "Note" ||
    s === "as:Note" ||
    s === "https://www.w3.org/ns/activitystreams#Note" ||
    s.endsWith("/Note");
  if (typeof t === "string") return noteLike(t);
  if (Array.isArray(t))
    return t.some((x) => typeof x === "string" && noteLike(x));
  return false;
}

function getActivityPubNoteHtml(record: Record<string, unknown>): string {
  if (typeof record.content === "string" && record.content.trim()) {
    return record.content;
  }
  const cm = record.contentMap;
  if (isRecord(cm)) {
    const en = cm.en;
    if (typeof en === "string" && en.trim()) return en;
    for (const v of Object.values(cm)) {
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return "";
}

function coverFromActivityPub(record: Record<string, unknown>, pageUrl: string): string | null {
  const img = record.image;
  if (isRecord(img) && typeof img.url === "string") {
    const u = resolveUrl(pageUrl, img.url);
    return isSafeHttpUrl(u) ? u : null;
  }
  return null;
}

/**
 * WordPress (and others) can return an ActivityStreams `Note` JSON document for a post URL when
 * `Accept` prefers JSON. The real recipe is in `content` as HTML — not in the JSON blob itself.
 */
export function extractRecipeFromActivityPubJson(
  data: unknown,
  pageUrl: string,
): ParsedRecipe | null {
  if (!isRecord(data) || !isActivityStreamsNote(data)) return null;
  const fragment = getActivityPubNoteHtml(data);
  if (!fragment.trim()) return null;
  const wrapped = wrapHtmlFragmentForReadability(fragment);
  const fromLd = extractJsonLdRecipe(wrapped, pageUrl);
  const cover = coverFromActivityPub(data, pageUrl);

  if (fromLd && (fromLd.ingredients.length || fromLd.steps.length)) {
    return cover && !fromLd.coverImageUrl
      ? { ...fromLd, coverImageUrl: cover }
      : fromLd;
  }

  const read = extractReadability(wrapped, pageUrl);
  if (!read.steps.length && !read.ingredients.length) return null;
  return {
    ...read,
    coverImageUrl: read.coverImageUrl ?? cover,
    rawWarnings: [
      ...(read.rawWarnings ?? []),
      "Imported from ActivityPub/JSON response; HTML was taken from the Note content field.",
    ],
  };
}

/** Collect schema.org recipe instructions (HowTo, HowToStep, ItemList, ListItem, plain text, etc.). */
function extractHowToSteps(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "string") {
    return v
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(v)) {
    return v.flatMap((item) => extractHowToSteps(item)).filter(Boolean);
  }
  if (!isRecord(v)) return [];

  const typRaw = v["@type"];
  const types = Array.isArray(typRaw)
    ? typRaw.map((x) => String(x))
    : typRaw != null
      ? [String(typRaw)]
      : [];

  const isHowTo = types.some(
    (t) =>
      t === "HowTo" ||
      t === "https://schema.org/HowTo" ||
      t.endsWith("/HowTo"),
  );
  if (isHowTo && v.step != null) {
    return extractHowToSteps(v.step);
  }

  const isHowToStep = types.some(
    (t) =>
      t === "HowToStep" ||
      t === "https://schema.org/HowToStep" ||
      t.endsWith("/HowToStep"),
  );
  if (isHowToStep) {
    if (typeof v.text === "string" && v.text.trim()) {
      return extractHowToSteps(v.text);
    }
    if (typeof v.name === "string" && v.name.trim()) {
      return [v.name.trim()];
    }
  }

  // ItemList / HowToSection / ListItem
  if (v.itemListElement != null) {
    return extractHowToSteps(v.itemListElement);
  }

  const isListItem = types.some(
    (t) =>
      t === "ListItem" ||
      t === "https://schema.org/ListItem" ||
      t.endsWith("/ListItem"),
  );
  if (isListItem) {
    if (v.item != null) return extractHowToSteps(v.item);
    if (typeof v.text === "string") return extractHowToSteps(v.text);
    if (typeof v.name === "string" && v.name.trim()) return [v.name.trim()];
  }

  if (typeof v.text === "string" && v.text.trim()) {
    return extractHowToSteps(v.text);
  }
  if (typeof v.name === "string" && v.name.trim() && v.itemListElement == null) {
    return [v.name.trim()];
  }

  if (typeof v.step === "string") return extractHowToSteps(v.step);
  if (Array.isArray(v.steps)) return extractHowToSteps(v.steps);

  return [];
}

/** When JSON-LD has ingredients (or title) but no steps, use Readability body lines as steps. */
function mergeStepsFromReadability(
  parsed: ParsedRecipe,
  html: string,
  pageUrl: string,
): ParsedRecipe {
  if (parsed.steps.length > 0) return parsed;

  const read = extractReadability(html, pageUrl);
  if (!read.steps.length) return parsed;

  const lines = read.steps
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_FALLBACK_STEP_LINES);

  if (!lines.length) return parsed;

  const warnings = [...(parsed.rawWarnings ?? [])];
  if (!warnings.some((w) => w.includes("article text"))) {
    warnings.push(
      "Steps were taken from the article text because structured instructions were missing or incomplete.",
    );
  }

  return {
    ...parsed,
    steps: lines,
    rawWarnings: warnings,
  };
}

function parseRecipeObject(
  obj: Record<string, unknown>,
  pageUrl: string,
): ParsedRecipe | null {
  const t = obj["@type"];
  const isRecipe =
    t === "Recipe" ||
    (Array.isArray(t) && t.includes("Recipe")) ||
    t === "https://schema.org/Recipe";
  if (!isRecipe) return null;

  const name = typeof obj.name === "string" ? obj.name : "Untitled recipe";
  const ingredients = toStringArray(obj.recipeIngredient);
  const instructions = extractHowToSteps(obj.recipeInstructions);
  const coverImageUrl =
    extractSchemaImage(obj.image, pageUrl) ??
    (typeof obj.thumbnailUrl === "string"
      ? resolveUrl(pageUrl, obj.thumbnailUrl)
      : null);
  const safeCover = isSafeHttpUrl(coverImageUrl) ? coverImageUrl : null;

  if (!ingredients.length && !instructions.length) {
    return {
      title: name,
      ingredients: [],
      steps: [],
      source: "jsonld",
      coverImageUrl: safeCover,
      rawWarnings: ["Recipe found in JSON-LD but no ingredients or steps."],
    };
  }

  return {
    title: name,
    ingredients,
    steps: instructions,
    source: "jsonld",
    coverImageUrl: safeCover,
  };
}

function walkJsonLd(data: unknown, out: ParsedRecipe[], pageUrl: string): void {
  if (Array.isArray(data)) {
    for (const item of data) walkJsonLd(item, out, pageUrl);
    return;
  }
  if (!isRecord(data)) return;

  if (data["@graph"] && Array.isArray(data["@graph"])) {
    for (const g of data["@graph"]) walkJsonLd(g, out, pageUrl);
  }

  const parsed = parseRecipeObject(data, pageUrl);
  if (parsed) out.push(parsed);

  if (Array.isArray(data["@type"]) && data["@type"].includes("Recipe")) {
    const p = parseRecipeObject(data, pageUrl);
    if (p) out[0] = p;
  }
}

function flattenPortableTextBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  const parts: string[] = [];
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    if (block._type === "block" && Array.isArray(block.children)) {
      const line = block.children
        .map((c: unknown) =>
          isRecord(c) && typeof c.text === "string" ? c.text : "",
        )
        .join("");
      if (line.trim()) parts.push(line.trim());
    }
  }
  return parts.join("\n");
}

/** e.g. Made With Lau: recipe lives in __NEXT_DATA__.props.pageProps.trpcState (Sanity-backed). */
export function extractTrpcRecipeFromNextData(
  html: string,
  pageUrl: string,
): ParsedRecipe | null {
  const dom = new JSDOM(html);
  const el = dom.window.document.getElementById("__NEXT_DATA__");
  if (!el?.textContent?.trim()) return null;
  let next: unknown;
  try {
    next = JSON.parse(el.textContent);
  } catch {
    return null;
  }
  if (!isRecord(next)) return null;
  const pageProps = next.props;
  if (!isRecord(pageProps)) return null;
  const pp = pageProps.pageProps;
  if (!isRecord(pp)) return null;
  const trpcState = pp.trpcState;
  if (!isRecord(trpcState)) return null;
  const queries = trpcState.queries;
  if (!Array.isArray(queries)) return null;

  for (const q of queries) {
    if (!isRecord(q)) continue;
    const state = q.state;
    if (!isRecord(state)) continue;
    const data = state.data;
    if (!isRecord(data)) continue;

    const ingArr = data.ingredientsArray;
    const instArr = data.instructionsArray;
    if (!Array.isArray(ingArr) && !Array.isArray(instArr)) continue;

    const ingredients: string[] = [];
    if (Array.isArray(ingArr)) {
      for (const row of ingArr) {
        if (!isRecord(row)) continue;
        if (row._type === "ingredientSection" && typeof row.section === "string") {
          ingredients.push(`— ${row.section} —`);
        }
        if (row._type === "ingredient") {
          const amount = row.amount != null ? String(row.amount) : "";
          const unit = typeof row.unit === "string" ? row.unit : "";
          const item = typeof row.item === "string" ? row.item : "";
          let line = [amount, unit, item].filter(Boolean).join(" ").trim();
          const notes = flattenPortableTextBlocks(row.notes);
          if (notes) line += ` (${notes})`;
          if (line) ingredients.push(line);
        }
      }
    }

    const steps: string[] = [];
    if (Array.isArray(instArr)) {
      for (const ins of instArr) {
        if (!isRecord(ins)) continue;
        const headline =
          typeof ins.headline === "string" ? ins.headline.trim() : "";
        const body = flattenPortableTextBlocks(ins.freeformDescription);
        const step = [headline, body].filter(Boolean).join("\n\n").trim();
        if (step) steps.push(step);
      }
    }

    const title =
      (typeof data.title === "string" && data.title.trim()) ||
      (typeof data.englishTitle === "string" && data.englishTitle.trim()) ||
      "Imported recipe";

    let coverImageUrl: string | null = null;
    if (
      isRecord(data.mainImage) &&
      isRecord(data.mainImage.asset) &&
      typeof data.mainImage.asset.url === "string"
    ) {
      const u = resolveUrl(pageUrl, data.mainImage.asset.url);
      coverImageUrl = isSafeHttpUrl(u) ? u : null;
    }

    if (!ingredients.length && !steps.length) continue;

    return {
      title,
      ingredients,
      steps,
      source: "next-data",
      coverImageUrl,
    };
  }

  return null;
}

function structuredScore(p: ParsedRecipe | null): number {
  if (!p) return 0;
  return p.ingredients.length * 2 + p.steps.length + (p.coverImageUrl ? 1 : 0);
}

function pickBetterStructured(
  a: ParsedRecipe | null,
  b: ParsedRecipe | null,
): ParsedRecipe | null {
  if (!a) return b;
  if (!b) return a;
  return structuredScore(a) >= structuredScore(b) ? a : b;
}

export function extractJsonLdRecipe(html: string, pageUrl: string): ParsedRecipe | null {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const candidates: ParsedRecipe[] = [];

  for (const s of scripts) {
    const text = s.textContent?.trim();
    if (!text) continue;
    try {
      const data = JSON.parse(text) as unknown;
      walkJsonLd(data, candidates, pageUrl);
    } catch {
      // skip invalid JSON
    }
  }

  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) => {
    const sa = a.ingredients.length + a.steps.length;
    const sb = b.ingredients.length + b.steps.length;
    if (sb !== sa) return sb > sa ? b : a;
    const ia = a.coverImageUrl ? 1 : 0;
    const ib = b.coverImageUrl ? 1 : 0;
    return ib > ia ? b : a;
  });
  return best;
}

function extractMetaCoverImage(html: string, pageUrl: string): string | null {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const metas = [
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content"),
    doc.querySelector('meta[property="og:image:url"]')?.getAttribute("content"),
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content"),
    doc.querySelector('meta[name="twitter:image:src"]')?.getAttribute("content"),
  ] as (string | null | undefined)[];
  for (const raw of metas) {
    if (!raw?.trim()) continue;
    const u = resolveUrl(pageUrl, raw.trim());
    if (isSafeHttpUrl(u)) return u;
  }
  return null;
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
  let lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  lines = filterReadabilityLines(lines);
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

function withMetaImage(parsed: ParsedRecipe, html: string, pageUrl: string): ParsedRecipe {
  if (parsed.coverImageUrl) return parsed;
  const meta = extractMetaCoverImage(html, pageUrl);
  if (!meta) return parsed;
  return { ...parsed, coverImageUrl: meta };
}

function finalizeParsed(
  parsed: ParsedRecipe,
  html: string,
  pageUrl: string,
): ParsedRecipe {
  return mergeStepsFromReadability(withMetaImage(parsed, html, pageUrl), html, pageUrl);
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
      // Prefer HTML. Including application/json makes some sites (e.g. WordPress ActivityPub)
      // return a JSON Note instead of the recipe page — Readability then sees one giant JSON "line".
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
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
  const contentType = res.headers.get("content-type") ?? "";

  const couldBeJson =
    contentType.includes("json") ||
    contentType.includes("activity") ||
    html.trimStart().startsWith("{");

  if (couldBeJson) {
    try {
      const data = JSON.parse(html) as unknown;
      const ap = extractRecipeFromActivityPubJson(data, url);
      if (ap) {
        const fragment = isRecord(data) ? getActivityPubNoteHtml(data) : "";
        const syntheticHtml =
          fragment.trim().length > 0
            ? wrapHtmlFragmentForReadability(fragment)
            : html;
        const parsed = finalizeParsed(ap, syntheticHtml, url);
        return { parsed, htmlSnippet: parsed.steps.slice(0, 3).join("\n") };
      }
    } catch {
      // Not JSON — continue with HTML pipeline.
    }
  }

  const json = extractJsonLdRecipe(html, url);
  const nextData = extractTrpcRecipeFromNextData(html, url);
  const structured = pickBetterStructured(json, nextData);

  if (structured && (structured.ingredients.length || structured.steps.length)) {
    const parsed = finalizeParsed(structured, html, url);
    return { parsed, htmlSnippet: parsed.steps.slice(0, 3).join("\n") };
  }

  if (structured && structured.title && structured.rawWarnings?.length) {
    const parsed = finalizeParsed(structured, html, url);
    return { parsed, htmlSnippet: parsed.steps.slice(0, 3).join("\n") };
  }

  const fromRead = extractReadability(html, url);
  if (fromRead.source === "readability" && fromRead.steps.length) {
    const parsed = finalizeParsed(fromRead, html, url);
    return { parsed, htmlSnippet: parsed.steps.slice(0, 3).join("\n") };
  }

  if (structured) {
    const parsed = finalizeParsed(structured, html, url);
    return { parsed, htmlSnippet: parsed.steps.slice(0, 3).join("\n") };
  }

  const parsed = finalizeParsed(fromRead, html, url);
  return { parsed, htmlSnippet: parsed.steps.slice(0, 3).join("\n") };
}
