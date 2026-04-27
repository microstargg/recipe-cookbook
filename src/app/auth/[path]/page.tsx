import { AuthView } from "@neondatabase/auth/react/ui";
import { authViewPaths } from "@neondatabase/auth/react/ui/server";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 py-8">
      <AuthView path={path} />
    </main>
  );
}
