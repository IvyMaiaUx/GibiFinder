// Warms a lazy route's JS chunk before the user actually navigates to it —
// the same idea as Next.js's <Link>, which prefetches on hover/viewport
// automatically. wouter (this app's router) doesn't do that on its own, so
// without this every nav click pays for the lazy chunk's network+parse
// time right at the moment the user is waiting on it.
//
// Each entry here mirrors one of App.tsx's lazy() imports. import() is
// idempotent and cached by the bundler/browser, so calling it early just
// means the chunk is already resident by the time the real navigation
// (App.tsx's own lazy()) needs it — this never duplicates work, it only
// moves it earlier.
const importers: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/Home"),
  "/historico": () => import("@/pages/History"),
  "/ranking": () => import("@/pages/Ranking"),
  "/colecao": () => import("@/pages/Colecao"),
  "/provedores": () => import("@/pages/Providers"),
  "/provedores/inspector": () => import("@/pages/ProviderInspector"),
  "/explorar": () => import("@/pages/Explore"),
  "/login": () => import("@/pages/Login"),
};

const attempted = new Set<string>();

export function prefetchRoute(path: string) {
  if (attempted.has(path)) return;
  const importer = importers[path];
  if (!importer) return;
  attempted.add(path);
  // If it fails (e.g. offline, or a stale deployed chunk URL after a new
  // release), let a later hover try again instead of giving up for the
  // rest of the session.
  importer().catch(() => { attempted.delete(path); });
}
