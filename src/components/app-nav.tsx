"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOutAction } from "@/actions/auth";

const navLinkClass =
  "flex min-h-[48px] items-center rounded-md px-3 py-2.5 text-base text-ink hover:bg-stone-100 active:bg-stone-200";

type Tab = { href: string; label: string; match: (p: string) => boolean; icon: ReactNode };

const iconProps = {
  className: "h-6 w-6",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  "aria-hidden": true,
} as const;

const TABS: Tab[] = [
  {
    href: "/plan",
    label: "Plan",
    match: (p) => p.startsWith("/plan") || p.startsWith("/freezer"),
    icon: (
      <svg {...iconProps}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
        />
      </svg>
    ),
  },
  {
    href: "/recipes",
    label: "Recipes",
    match: (p) => p.startsWith("/recipes"),
    icon: (
      <svg {...iconProps}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
        />
      </svg>
    ),
  },
];

const MORE_LINKS = [
  { href: "/recipes/new", label: "New recipe" },
  { href: "/import/url", label: "Import from URL" },
  { href: "/import/photo", label: "Import from photo" },
  { href: "/freezer", label: "Freezer" },
  { href: "/settings/household", label: "Household" },
  { href: "/settings/export", label: "Export" },
];

export function AppNav({ householdName }: { householdName: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const moreActive = !TABS.some((t) => t.match(pathname));

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-cream/95 backdrop-blur-sm pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 md:py-4">
          <Link
            href="/plan"
            className="font-display flex min-h-[44px] min-w-0 shrink items-center text-lg font-semibold leading-tight tracking-tight text-ink md:text-xl"
          >
            <span className="truncate">{householdName}</span>
          </Link>

          <nav
            className="hidden flex-wrap items-center gap-3 text-sm text-ink-muted md:flex"
            aria-label="Main"
          >
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={t.match(pathname) ? "text-accent" : "hover:text-accent"}
              >
                {t.label}
              </Link>
            ))}
            <Link href="/recipes/new" className="hover:text-accent">
              New
            </Link>
            <Link href="/import/url" className="hover:text-accent">
              From URL
            </Link>
            <Link href="/import/photo" className="hover:text-accent">
              From photo
            </Link>
            <Link href="/settings/household" className="hover:text-accent">
              Household
            </Link>
            <Link href="/settings/export" className="hover:text-accent">
              Export
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="text-stone-500 hover:text-stone-800">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      {/* Phone: tab bar along the bottom, within thumb reach. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-cream/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom,0px)] md:hidden"
        aria-label="Main mobile"
      >
        <div className="mx-auto flex max-w-3xl">
          {TABS.map((t) => {
            const active = t.match(pathname) && !moreOpen;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
                  active ? "text-accent" : "text-ink-muted"
                }`}
              >
                {t.icon}
                {t.label}
              </Link>
            );
          })}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="mobile-more-menu"
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
              moreOpen || moreActive ? "text-accent" : "text-ink-muted"
            }`}
          >
            <svg {...iconProps}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-stone-900/30"
            onClick={() => setMoreOpen(false)}
          />
          <nav
            id="mobile-more-menu"
            aria-label="More"
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-cream px-2 pt-2 pb-[calc(56px+env(safe-area-inset-bottom,0px)+0.5rem)] shadow-xl"
          >
            {MORE_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={navLinkClass}>
                {l.label}
              </Link>
            ))}
            <form action={signOutAction} className="mt-1 border-t border-stone-200/80 pt-1">
              <button
                type="submit"
                className="flex min-h-[48px] w-full items-center rounded-md px-3 py-2.5 text-left text-base text-stone-500 hover:bg-stone-100"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      )}
    </>
  );
}
