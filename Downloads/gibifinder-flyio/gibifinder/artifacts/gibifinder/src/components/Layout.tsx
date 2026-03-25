import React from "react";
import { Link, useLocation } from "wouter";
import { Search, Library, Trophy, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Buscar Gibi", icon: Search },
    { href: "/historico", label: "Histórico", icon: Library },
    { href: "/ranking", label: "Ranking", icon: Trophy },
  ];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <header className="border-b-4 border-dark bg-yellow sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-red text-white p-2 border-4 border-dark rotate-[-5deg] group-hover:rotate-0 transition-transform">
              <span className="font-display text-3xl tracking-wider leading-none">Gibi</span>
            </div>
            <span className="font-display text-4xl text-dark tracking-widest leading-none drop-shadow-[2px_2px_0px_#fff]">
              FINDER
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex gap-6">
            {navLinks.map((link) => {
              const isActive = location === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "font-display text-xl tracking-wider px-4 py-2 border-4 border-transparent flex items-center gap-2 transition-all",
                    isActive
                      ? "bg-white border-dark shadow-[4px_4px_0px_0px_#0a0a0a] -translate-y-1"
                      : "hover:bg-white/50 text-dark/80 hover:text-dark"
                  )}
                >
                  <Icon size={20} strokeWidth={3} />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Mobile Nav Toggle */}
          <button
            className="md:hidden p-2 comic-button bg-white border-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        
        {/* Mobile Nav Menu */}
        {isMobileMenuOpen && (
          <nav className="md:hidden border-t-4 border-dark bg-yellow p-4 flex flex-col gap-4 animate-in slide-in-from-top-2">
            {navLinks.map((link) => {
              const isActive = location === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "font-display text-2xl tracking-wider px-4 py-3 border-4 flex items-center gap-3 transition-all",
                    isActive
                      ? "bg-white border-dark shadow-[4px_4px_0px_0px_#0a0a0a]"
                      : "border-transparent hover:bg-white/50"
                  )}
                >
                  <Icon size={24} strokeWidth={3} />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
      
      <footer className="border-t-4 border-dark bg-dark text-white p-6 mt-12">
        <div className="max-w-7xl mx-auto text-center font-bold tracking-wider font-display text-xl">
          <p>BAM! POW! GIBIFINDER © {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}
