import { requireUser } from "@/lib/session";
import { Nav } from "@/components/brand/Nav";

/**
 * Authenticated shell for the sender area. Protects the entire `(app)` route
 * group by requiring a signed-in user (redirects to /login otherwise) and
 * frames every page with the persistent navigation chrome:
 *   - a fixed sidebar on desktop (≥ lg)
 *   - a top bar + slide-in drawer on mobile
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-full">
      <Nav user={{ name: user.name, email: user.email }} />
      {/* Offset for the fixed sidebar (desktop) / top bar (mobile). */}
      <div className="flex min-h-full flex-col pt-14 lg:pl-64 lg:pt-0">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
