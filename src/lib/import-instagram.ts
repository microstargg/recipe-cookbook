const JINA_READER_PREFIX = "https://r.jina.ai/";
const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 40_000;

const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "instagr.am",
  "www.instagr.am",
  "l.instagram.com",
]);

const SHORTCODE_PATH = /(?:^|\/)(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type InstagramRecipeSource = {
  bodyText: string;
  coverImageUrl: string | null;
  warnings: string[];
};

function importJinaDisabled(): boolean {
  const v = process.env.IMPORT_DISABLE_JINA?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isInstagramUrl(url: URL): boolean {
  return INSTAGRAM_HOSTS.has(url.hostname.toLowerCase());
}

export function instagramShortcodeFromUrl(url: URL): string | null {
  const match = url.pathname.match(SHORTCODE_PATH);
  if (match?.[1]) return match[1];
  const nested = url.searchParams.get("u");
  if (!nested) return null;
  try {
    return instagramShortcodeFromUrl(new URL(nested));
  } catch {
    return null;
  }
}

function instagramPathKind(url: URL): "reel" | "p" {
  if (/\/reels?\//i.test(url.pathname)) return "reel";
  const nested = url.searchParams.get("u");
  if (nested) {
    try {
      return instagramPathKind(new URL(nested));
    } catch {
      /* ignore */
    }
  }
  return "p";
}

/** Permalink without tracking params; used for fetching when a shortcode is present. */
export function canonicalInstagramPermalink(url: URL): string {
  const code = instagramShortcodeFromUrl(url);
  if (!code) return url.toString();
  return `https://www.instagram.com/${instagramPathKind(url)}/${code}/`;
}

export function parseInstagramReaderMarkdown(raw: string): {
  title: string | null;
  bodyText: string;
  coverImageUrl: string | null;
} {
  const title = jinaTitle(raw);
  const bodyMd = markdownBody(raw);
  const coverImageUrl = extractInstagramCoverImageUrl(bodyMd);
  const cleaned = stripImagesAndChrome(bodyMd);

  if (plainLength(cleaned) < 80) {
    throw new Error(
      "Could not read the caption or comments on that Instagram post. If it is private, or the recipe is only in the video, import a screenshot instead.",
    );
  }

  const chunks: string[] = [];
  if (title) chunks.push(`Title: ${title}`, "");
  chunks.push("Caption and comments:", "", cleaned);

  return {
    title,
    bodyText: chunks.join("\n"),
    coverImageUrl,
  };
}

function jinaTitle(raw: string): string | null {
  const m = raw.match(/^Title:\s*(.+)$/m);
  if (!m) return null;
  let title = m[1].trim();
  const quoted = title.match(/on Instagram:\s*"([\s\S]+)/i);
  if (quoted) {
    title = quoted[1].replace(/"\s*$/, "").trim();
  }
  title = title.replace(/\s+/g, " ").trim();
  return title ? title.slice(0, 240) : null;
}

function markdownBody(raw: string): string {
  const marker = "Markdown Content:";
  const idx = raw.indexOf(marker);
  return (idx >= 0 ? raw.slice(idx + marker.length) : raw).trim();
}

function stripAfterChrome(text: string): string {
  let out = text;
  const cuts = [/\nMore posts from\b/i, /\n\[Meta\]\(/, /\n© \d{4} Instagram\b/];
  for (const re of cuts) {
    const m = out.search(re);
    if (m !== -1) out = out.slice(0, m);
  }
  return out;
}

function imageMarkdownRe(): RegExp {
  return /!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g;
}

function isSkipImage(alt: string, href: string): boolean {
  const a = alt.toLowerCase();
  const h = href.toLowerCase();
  if (a.includes("profile picture")) return true;
  if (/s150x150/.test(h)) return true;
  if (h.includes("cdn.fbsbx.com")) return true;
  if (h.includes(".gif")) return true;
  return false;
}

function isLikelyCover(alt: string): boolean {
  const a = alt.toLowerCase();
  return (
    a.includes("video") ||
    a.includes("may be an image") ||
    a.includes("reel")
  );
}

export function extractInstagramCoverImageUrl(markdown: string): string | null {
  let fallback: string | null = null;
  for (const match of markdown.matchAll(imageMarkdownRe())) {
    const alt = match[1] ?? "";
    const href = match[2] ?? "";
    if (!href || isSkipImage(alt, href)) continue;
    if (isLikelyCover(alt)) return href;
    if (!fallback) fallback = href;
  }
  return fallback;
}

function stripImagesAndChrome(markdown: string): string {
  let text = stripAfterChrome(markdown);
  text = text.replace(imageMarkdownRe(), "");
  text = text.replace(/\[Log In\]\([^)]+\)/gi, "");
  text = text.replace(/\[Sign Ups?\]\([^)]+\)/gi, "");
  text = text.replace(/\[Sign up\]\([^)]+\)/gi, "");
  text = text.replace(/\[Log in\]\([^)]+\)[^\n]*/gi, "");
  text = text.replace(
    /Join .+ on Instagram[\s\S]*?Keep up with what's new from \*\*[^*]+\*\*\./gi,
    "",
  );
  text = text.replace(/^\s*Like\s*$/gm, "");
  text = text.replace(/^\s*Reply\s*$/gm, "");
  text = text.replace(/^\s*\d+\s+likes?\s*$/gim, "");
  text = text.replace(/\[([^\]]*)\]\([^)]+\)/g, "$1");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function plainLength(text: string): number {
  return text.replace(/\s+/g, " ").trim().length;
}

async function fetchJinaMarkdown(targetUrl: string, signal: AbortSignal): Promise<string> {
  const jinaUrl = `${JINA_READER_PREFIX}${targetUrl}`;
  const res = await fetch(jinaUrl, {
    signal,
    headers: {
      Accept: "text/markdown, text/plain;q=0.9, */*;q=0.8",
      "X-Return-Format": "markdown",
      "User-Agent": BROWSER_UA,
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(
      `Could not read that Instagram post (read proxy HTTP ${res.status}). Try a screenshot import instead.`,
    );
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("Instagram page is too large to import (max 2MB).");
  }
  const raw = new TextDecoder("utf-8").decode(buf);
  if (isBlockedReaderResponse(raw)) {
    throw new Error(
      "Could not read that Instagram post (read proxy was blocked). Try a screenshot import instead.",
    );
  }
  return raw;
}

function isBlockedReaderResponse(raw: string): boolean {
  const head = raw.trimStart().slice(0, 1500).toLowerCase();
  return (
    head.includes("just a moment...") ||
    head.includes("cf-chl-opt") ||
    head.includes("challenge-error-text") ||
    head.includes("enable javascript and cookies to continue")
  );
}

/**
 * Fetch caption + visible comments for a public Instagram reel/post via Jina Reader.
 * Always uses the proxy — Instagram often returns HTTP 200 with a login wall to servers.
 */
export async function fetchInstagramRecipeSource(
  pageUrl: URL,
): Promise<InstagramRecipeSource> {
  if (importJinaDisabled()) {
    throw new Error(
      "Instagram import needs the read proxy. Unset IMPORT_DISABLE_JINA and try again, or import a screenshot instead.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const fetchUrl = canonicalInstagramPermalink(pageUrl);
  let raw: string;
  try {
    raw = await fetchJinaMarkdown(fetchUrl, controller.signal);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Timed out reading that Instagram post. Try again, or import a screenshot instead.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const parsed = parseInstagramReaderMarkdown(raw);
  return {
    bodyText: parsed.bodyText,
    coverImageUrl: parsed.coverImageUrl,
    warnings: [
      "Fetched via read proxy because Instagram blocks direct access from this server.",
    ],
  };
}
