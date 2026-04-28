import { AppNav } from "@/components/app-nav";

export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen min-h-dvh bg-paper">
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-10 sm:py-10 sm:pb-12">{children}</main>
    </div>
  );
}
