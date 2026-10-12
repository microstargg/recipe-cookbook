import { AppNav } from "@/components/app-nav";
import { requireHousehold } from "@/lib/household";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { householdName } = await requireHousehold();

  return (
    <div className="min-h-screen min-h-dvh bg-paper">
      <AppNav householdName={householdName} />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-[calc(56px+env(safe-area-inset-bottom,0px)+2.5rem)] sm:py-10 md:pb-12">{children}</main>
    </div>
  );
}
