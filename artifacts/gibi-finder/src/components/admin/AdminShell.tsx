import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  LayoutDashboard, Library, Globe, Settings2, Users, BarChart3,
  MessageSquare, SearchCode, Wrench, Menu, X, LogOut, ExternalLink, PanelLeftClose,
} from "lucide-react";

export type AdminModule =
  | "dashboard" | "catalog" | "providers" | "engines"
  | "users" | "analytics" | "feedback" | "inspector" | "system";

interface NavItem {
  key: AdminModule;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
}

export function adminNavItems(badges: Partial<Record<AdminModule, number>> = {}): NavItem[] {
  return [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "catalog", label: "Catálogo", icon: Library, badge: badges.catalog },
    { key: "providers", label: "Providers", icon: Globe },
    { key: "engines", label: "Engines", icon: Settings2 },
    { key: "users", label: "Usuários", icon: Users },
    { key: "analytics", label: "Analytics", icon: BarChart3 },
    { key: "feedback", label: "Feedback", icon: MessageSquare, badge: badges.feedback },
    { key: "inspector", label: "Inspector", icon: SearchCode },
    { key: "system", label: "Sistema", icon: Wrench },
  ];
}

interface AdminShellProps {
  active: AdminModule;
  onNavigate: (key: AdminModule) => void;
  onExit: () => void;
  badges?: Partial<Record<AdminModule, number>>;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminShell({ active, onNavigate, onExit, badges = {}, title, subtitle, actions, children }: AdminShellProps) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("gibi-admin:sidebar-collapsed") === "1"; } catch { return false; }
  });
  const setCollapsedPersist = (v: boolean) => {
    setCollapsed(v);
    try { localStorage.setItem("gibi-admin:sidebar-collapsed", v ? "1" : "0"); } catch { /* ignore */ }
  };
  const items = adminNavItems(badges);

  const NavList = ({ onPick }: { onPick?: () => void }) => (
    <nav className="flex flex-col gap-1.5">
      {items.map(({ key, label, icon: Icon, badge }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => { onNavigate(key); onPick?.(); }}
            className={`flex items-center gap-3 px-3 py-2.5 border-4 font-display text-lg text-left transition-all ${
              isActive
                ? "bg-secondary border-black text-black translate-x-0.5 shadow-[3px_3px_0_rgba(0,0,0,1)]"
                : "bg-white border-transparent text-gray-500 hover:border-black hover:text-black"
            }`}
          >
            <Icon className="w-5 h-5 shrink-0" strokeWidth={2.5} />
            <span className="flex-1">{label}</span>
            {badge ? <span className="bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full border-2 border-black">{badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );

  const SidebarInner = ({ onPick }: { onPick?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b-4 border-black relative">
        <Link href="/" className="flex items-center gap-2 group w-fit">
          <span className="bg-primary text-primary-foreground font-display text-xl px-3 py-1.5 rounded-lg border-4 border-black comic-shadow-sm transform -rotate-3 group-hover:rotate-0 transition-all">GIBI</span>
          <span className="font-display text-2xl text-black tracking-wider">FINDER</span>
        </Link>
        <p className="font-display text-sm text-black/50 tracking-[0.2em] mt-2 pl-1">CENTRO DE OPERAÇÕES</p>
        <button onClick={() => setCollapsedPersist(true)} title="Recolher menu" className="hidden lg:flex absolute top-3 right-3 p-1.5 border-2 border-black bg-white hover:bg-muted">
          <PanelLeftClose className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavList onPick={onPick} />
      </div>
      <div className="px-3 py-4 border-t-4 border-black space-y-1.5">
        <Link href="/" className="flex items-center gap-3 px-3 py-2 border-4 border-transparent hover:border-black font-display text-base text-gray-500 hover:text-black transition-all">
          <ExternalLink className="w-4 h-4" strokeWidth={2.5} /> Ver o site
        </Link>
        <button onClick={onExit} className="w-full flex items-center gap-3 px-3 py-2 border-4 border-transparent hover:border-black font-display text-base text-gray-500 hover:text-primary transition-all">
          <LogOut className="w-4 h-4" strokeWidth={2.5} /> Sair
        </button>
        <p className="text-2xs font-bold text-gray-300 px-3 pt-1 select-text">build {__BUILD_ID__}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#faf7f2]">
      {/* Desktop sidebar (fixed, collapsible) */}
      <aside className={`${collapsed ? "hidden" : "hidden lg:flex"} lg:flex-col lg:fixed lg:inset-y-0 lg:w-64 bg-white border-r-8 border-black z-40`}>
        <SidebarInner />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative w-72 max-w-[80%] bg-white border-r-8 border-black">
            <button onClick={() => setOpen(false)} className="absolute top-4 right-3 p-1 border-2 border-black bg-white z-10"><X className="w-5 h-5" strokeWidth={3} /></button>
            <SidebarInner onPick={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Content */}
      <div className={`${collapsed ? "" : "lg:pl-64"} flex flex-col min-h-screen`}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-[#faf7f2]/95 backdrop-blur border-b-4 border-black">
          <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-4">
            <button onClick={() => { setCollapsedPersist(false); setOpen(true); }} title="Menu" className={`${collapsed ? "" : "lg:hidden"} p-2 border-4 border-black bg-white shrink-0`}><Menu className="w-5 h-5" strokeWidth={3} /></button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-3xl md:text-4xl text-black leading-none truncate">{title}</h1>
              {subtitle && <p className="font-sans font-bold text-gray-500 text-sm mt-1 truncate">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </div>
        </header>

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
