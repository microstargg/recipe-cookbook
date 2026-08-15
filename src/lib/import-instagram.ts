import { JSDOM } from "jsdom";

const JINA_READER_PREFIX = "https://r.jina.ai/";
const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 12_000;

/** Public Kittygram instances (Nitter-style Instagram frontends with comments). */
const KITTYGRAM_ORIGINS = [
  "https://kittygram.kareem.one",
  "https://kittygram.irelephant.net",
];

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
  const htmlCover = looksLikeHtml(raw) ? extractCoverFromHtml(raw) : null;
  const normalized = looksLikeHtml(raw) ? htmlToReadableText(raw) : raw;
  const title = jinaTitle(normalized);
  const bodyMd = markdownBody(normalized);
  const coverImageUrl =
    extractInstagramCoverImageUrl(bodyMd) ?? htmlCover;
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

function looksLikeHtml(raw: string): boolean {
  const start = raw.trimStart().slice(0, 256).toLowerCase();
  return start.startsWith("<!doctype") || start.startsWith("<html") || start.includes("<html");
}

function htmlToReadableText(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  for (const el of doc.querySelectorAll("script, style, noscript")) {
    el.remove();
  }
  const title = doc.querySelector("title")?.textContent?.trim();
  const og =
    doc.querySelector('meta[property="og:description"]')?.getAttribute("content") ??
    doc.querySelector('meta[name="description"]')?.getAttribute("content");
  const body = doc.body?.textContent ?? "";
  return [title ? `Title: ${title}` : "", og ?? "", body].filter(Boolean).join("\n\n");
}

function extractCoverFromHtml(html: string): string | null {
  const og = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  );
  if (og?.[1] && og[1].startsWith("http")) return og[1];
  for (const match of html.matchAll(/mediaproxy\?url=([^"'\s&]+)/g)) {
    try {
      const href = decodeURIComponent(match[1] ?? "");
      if (!href.startsWith("http") || isSkipImage("", href)) continue;
      return href;
    } catch {
      /* ignore */
    }
  }
  return extractInstagramCoverImageUrl(html);
}

function isBlockedReaderResponse(raw: string): boolean {
  const head = raw.trimStart().slice(0, 1500).toLowerCase();
  return (
    head.includes("just a moment...") ||
    head.includes("cf-chl-opt") ||
    head.includes("challenge-error-text") ||
    head.includes("enable javascript and cookies to continue") ||
    head.includes("database or disk is full") ||
    /403:\s*forbidden/.test(head)
  );
}

function jinaApiKey(): string | undefined {
  const key = process.env.JINA_API_KEY?.trim();
  return key || undefined;
}

async function fetchText(
  url: string,
  signal: AbortSignal,
  headers: Record<string, string>,
): Promise<string> {
  const res = await fetch(url, { signal, headers, redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("Page is too large to import (max 2MB).");
  }
  const raw = new TextDecoder("utf-8").decode(buf);
  if (isBlockedReaderResponse(raw)) {
    throw new Error("blocked");
  }
  return raw;
}

async function fetchJinaMarkdown(targetUrl: string, signal: AbortSignal): Promise<string> {
  const headers: Record<string, string> = {
    Accept: "text/markdown, text/plain;q=0.9, */*;q=0.8",
    "X-Return-Format": "markdown",
    "X-Engine": "browser",
    "User-Agent": BROWSER_UA,
  };
  const key = jinaApiKey();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers["X-Proxy"] = "auto";
  }
  return fetchText(`${JINA_READER_PREFIX}${targetUrl}`, signal, headers);
}

async function fetchKittygram(shortcode: string, signal: AbortSignal): Promise<string> {
  let lastError: unknown;
  for (const origin of KITTYGRAM_ORIGINS) {
    try {
      return await fetchText(`${origin}/p/${encodeURIComponent(shortcode)}`, signal, {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": BROWSER_UA,
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Instagram text viewer failed");
}

async function fetchEmbedCaptioned(permalink: string, signal: AbortSignal): Promise<string> {
  const embedUrl = permalink.replace(/\/?(\?.*)?$/, "/embed/captioned/");
  return fetchText(embedUrl, signal, {
    Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    "User-Agent": BROWSER_UA,
    Referer: "https://www.instagram.com/",
  });
}

function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fn(controller.signal).finally(() => clearTimeout(timer));
}

function tryParseSource(
  raw: string,
  warning: string,
): InstagramRecipeSource | null {
  try {
    const parsed = parseInstagramReaderMarkdown(raw);
    return {
      bodyText: parsed.bodyText,
      coverImageUrl: parsed.coverImageUrl,
      warnings: [warning],
    };
  } catch {
    return null;
  }
}

/**
 * Fetch caption + visible comments for a public Instagram reel/post.
 * Anonymous Jina often returns 403 from Vercel, so try a public text frontend
 * first, then Jina, then the caption-only embed.
 */
export async function fetchInstagramRecipeSource(
  pageUrl: URL,
): Promise<InstagramRecipeSource> {
  const canonical = canonicalInstagramPermalink(pageUrl);
  const original = pageUrl.toString();
  const shortcode = instagramShortcodeFromUrl(pageUrl);
  const targets = [...new Set([canonical, original])];

  if (shortcode) {
    try {
      const raw = await withTimeout(FETCH_TIMEOUT_MS, (signal) =>
        fetchKittygram(shortcode, signal),
      );
      const parsed = tryParseSource(
        raw,
        "Fetched via a public Instagram text viewer because Instagram blocked this server.",
      );
      if (parsed) return parsed;
    } catch (err) {
      console.warn(
        "[instagram-import] text viewer failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (!importJinaDisabled()) {
    for (const target of targets) {
      try {
        const raw = await withTimeout(FETCH_TIMEOUT_MS, (signal) =>
          fetchJinaMarkdown(target, signal),
        );
        const parsed = tryParseSource(
          raw,
          "Fetched via read proxy because Instagram blocks direct access from this server.",
        );
        if (parsed) return parsed;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          console.warn("[instagram-import] read proxy timed out");
        } else {
          console.warn(
            "[instagram-import] read proxy failed",
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
  }

  try {
    const raw = await withTimeout(FETCH_TIMEOUT_MS, (signal) =>
      fetchEmbedCaptioned(canonical, signal),
    );
    const parsed = tryParseSource(
      raw,
      "Only the Instagram caption was available (comments were blocked). Verify the recipe.",
    );
    if (parsed) return parsed;
  } catch (err) {
    console.warn(
      "[instagram-import] embed failed",
      err instanceof Error ? err.message : err,
    );
  }

  throw new Error(
    "Could not read that Instagram post from this server. If the recipe is in the caption or comments, try a screenshot import instead.",
  );
}
