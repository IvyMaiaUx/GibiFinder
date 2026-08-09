import { useEffect } from "react";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";

export function Layout({ children, minimal = false }: { children: React.ReactNode; minimal?: boolean }) {
  // The +18 theme (dark background, red accents) is a content-browsing
  // visual — it shouldn't bleed into admin-like screens. The "nsfw" class
  // lives on <html> and is set once by the Header's toggle, so it otherwise
  // persists across SPA navigation (no full reload) into any page, admin
  // included. Force it off while a minimal-layout page is mounted, and
  // restore it on unmount so navigating back to a normal page doesn't leave
  // +18 mode looking "off" when it's still on.
  //
  // A one-shot removal isn't enough: App's root-level init effect (empty
  // deps, reads localStorage and (re)applies the class) fires on mount too —
  // and React runs child effects before parent effects, so on a direct
  // load/refresh of an admin-like page, App's effect runs *after* this one
  // and silently re-adds "nsfw" right back. A MutationObserver keeps
  // stripping it for as long as this page stays mounted, regardless of what
  // else touches the class or when. Unmount re-syncs from the actual
  // preference in localStorage rather than a snapshot taken at mount time,
  // since that snapshot can itself go stale once other code changes the class
  // while this page is up.
  useEffect(() => {
    if (!minimal) return;
    const strip = () => {
      if (document.documentElement.classList.contains("nsfw")) {
        document.documentElement.classList.remove("nsfw");
      }
    };
    strip();
    const observer = new MutationObserver(strip);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      const isNsfw = localStorage.getItem("gibi-finder:nsfw") === "true";
      if (isNsfw) document.documentElement.classList.add("nsfw");
    };
  }, [minimal]);

  return (
    <div className="min-h-screen flex flex-col pt-20 md:pt-24">
      <Header minimal={minimal} />
      <main className={`flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 ${minimal ? "pb-12" : "pb-24 lg:pb-12"}`}>
        {children}
      </main>
      {/* Chrome (footer / feedback / bottom nav) is hidden in the minimal variant. */}
      {!minimal && (
        <>
          {/* Footer only on desktop — the bottom nav is the mobile footer. */}
          <footer className="hidden lg:block bg-black text-white py-8 border-t-8 border-primary">
            <div className="max-w-7xl mx-auto px-4 text-center font-display text-xl tracking-wider">
              <p>GIBI FINDER &copy; {new Date().getFullYear()} - O DETETIVE DOS QUADRINHOS</p>
            </div>
          </footer>
          <FeedbackButton />
          <BottomNav />
        </>
      )}
    </div>
  );
}
