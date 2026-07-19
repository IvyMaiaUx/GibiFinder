import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";

export function Layout({ children, minimal = false }: { children: React.ReactNode; minimal?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col pt-20 md:pt-24 overflow-x-hidden">
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
