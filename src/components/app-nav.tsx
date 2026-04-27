import Link from "next/link";
import { signOutAction } from "@/actions/auth";

export function AppNav() {
  return (
    <header className="border-b border-stone-200/80 bg-cream/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
        <Link
          href="/recipes"
          className="font-display text-xl font-semibold tracking-tight text-ink"
        >
          Ben&apos;s Cookbook
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
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
              className="text-stone-500 hover:text-stone-800"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
