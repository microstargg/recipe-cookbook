"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOutAction } from "@/actions/auth";

const navLinkClass =
  "flex min-h-[44px] items-center rounded-md px-3 py-2.5 text-sm text-ink-muted hover:bg-stone-100 hover:text-accent active:bg-stone-200 md:min-h-0 md:px-0 md:py-0 md:hover:bg-transparent md:active:bg-transparent";

export function AppNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-cream/95 backdrop-blur-sm pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 md:py-4">
        <Link
          href="/recipes"
          className="font-display flex min-h-[44px] min-w-0 shrink items-center text-lg font-semibold leading-tight tracking-tight text-ink md:text-xl"
          onClick={() => setMenuOpen(false)}
        >
          Ben&apos;s Cookbook
        </Link>

        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink hover:bg-stone-100 md:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-main-nav"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? (
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          )}
        </button>

        <nav
          className="hidden flex-wrap items-center gap-3 text-sm text-ink-muted md:flex"
          aria-label="Main"
        >
          <Link href="/recipes" className="hover:text-accent">
            Recipes
          </Link>
          <Link href="/recipes/new" className="hover:text-accent">
            New
          </Link>
          <Link href="/import/url" className="hover:text-accent">
            From URL
          </Link>
          <Link href="/import/photo" className="hover:text-accent">
            From photo
          </Link>
          <Link href="/settings/export" className="hover:text-accent">
            Export
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="min-h-[44px] px-2 text-stone-500 hover:text-stone-800 md:min-h-0"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>

      <div
        id="mobile-main-nav"
        className={`border-t border-stone-200/80 bg-cream md:hidden ${menuOpen ? "block" : "hidden"}`}
      >
        <nav
          className="mx-auto flex max-w-3xl flex-col px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
          aria-label="Main mobile"
        >
          <Link href="/recipes" className={navLinkClass} onClick={() => setMenuOpen(false)}>
            Recipes
          </Link>
          <Link href="/recipes/new" className={navLinkClass} onClick={() => setMenuOpen(false)}>
            New recipe
          </Link>
          <Link href="/import/url" className={navLinkClass} onClick={() => setMenuOpen(false)}>
            Import from URL
          </Link>
          <Link href="/import/photo" className={navLinkClass} onClick={() => setMenuOpen(false)}>
            Import from photo
          </Link>
          <Link href="/settings/export" className={navLinkClass} onClick={() => setMenuOpen(false)}>
            Export
          </Link>
          <form action={signOutAction} className="mt-1 border-t border-stone-200/80 pt-2">
            <button
              type="submit"
              className="flex min-h-[44px] w-full items-center rounded-md px-3 py-2.5 text-left text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-800"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
