import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Search, Clock, Trophy, BookMarked, Compass, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export function Header() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [isNsfw, setIsNsfw] = useState(() => document.documentElement.classList.contains("nsfw"));
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAgeModal, setShowAgeModal] = useState(false);

  useEffect(() => {
    const handleNsfwChange = () => {
      setIsNsfw(document.documentElement.classList.contains("nsfw"));
    };
    window.addEventListener("nsfw-change", handleNsfwChange);
    return () => window.removeEventListener("nsfw-change", handleNsfwChange);
  }, []);

  const toggleNsfw = () => {
    if (isNsfw) {
      document.documentElement.classList.remove("nsfw");
      localStorage.setItem("gibi-finder:nsfw", "false");
      setIsNsfw(false);
      window.dispatchEvent(new Event("nsfw-change"));
      return;
    }

    if (!user) {
      setShowLoginModal(true);
      return;
    }

    const ageConfirmed = localStorage.getItem("gibi-finder:age-confirmed") === "true";
    if (!ageConfirmed) {
      setShowAgeModal(true);
      return;
    }

    document.documentElement.classList.add("nsfw");
    localStorage.setItem("gibi-finder:nsfw", "true");
    setIsNsfw(true);
    window.dispatchEvent(new Event("nsfw-change"));
  };

  const handleConfirmAge = () => {
    localStorage.setItem("gibi-finder:age-confirmed", "true");
    setShowAgeModal(false);
    document.documentElement.classList.add("nsfw");
    localStorage.setItem("gibi-finder:nsfw", "true");
    setIsNsfw(true);
    window.dispatchEvent(new Event("nsfw-change"));
  };

  const navItems = [
    { path: "/", label: "BUSCAR GIBI", icon: Search },
    { path: "/explorar", label: "EXPLORAR", icon: Compass },
    { path: "/colecao", label: "MINHA COLEÇÃO", icon: BookMarked },
    { path: "/historico", label: "HISTÓRICO", icon: Clock },
    { path: "/ranking", label: "RANKING", icon: Trophy },
  ];

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-secondary border-b-8 border-black shadow-[0_8px_0_rgba(0,0,0,0.18)] animate-in fade-in duration-100">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-20 md:h-24 flex items-center justify-between gap-2">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1.5 group comic-hover transition-transform shrink-0">
          <div className="bg-primary text-primary-foreground font-display text-lg sm:text-xl md:text-3xl px-2 md:px-4 py-1 md:py-2 rounded-lg border-2 sm:border-4 border-black comic-shadow transform -rotate-3 group-hover:rotate-0 transition-all">
            GIBI
          </div>
          <span className="hidden sm:inline font-display text-2xl md:text-4xl text-black tracking-wider group-hover:scale-105 transition-transform drop-shadow-[2px_2px_0_white]">
            FINDER
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-4">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex items-center gap-2 font-display text-xl px-4 py-2 border-4 border-black rounded-lg transition-all comic-shadow-sm comic-hover comic-active",
                  isActive 
                    ? "bg-white text-black translate-y-[-2px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" 
                    : "bg-transparent text-black hover:bg-white/50"
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={3} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Auth Actions (Desktop) */}
        <div className="hidden lg:flex items-center gap-2 border-l-4 border-black/10 pl-4 ml-2">
          {/* +18 Mode Toggle (Desktop) */}
          <button
            onClick={toggleNsfw}
            className={cn(
              "font-display text-base border-4 border-black px-4 py-2 rounded-lg comic-shadow-sm transition-all select-none duration-150 uppercase flex items-center justify-center gap-1.5",
              isNsfw 
                ? "bg-[#f43f5e] text-white hover:bg-[#e11d48] border-white shadow-[0_0_10px_rgba(244,63,94,0.5)]" 
                : "bg-white text-black hover:bg-gray-100"
            )}
            title="Modo +18"
          >
            <span className="text-lg">🔞</span>
            {isNsfw ? "+18 ATIVO" : "+18"}
          </button>

          {user ? (
            <div className="flex items-center gap-3 animate-in fade-in duration-200">
              <Link href="/login" className="flex items-center gap-1.5 font-display text-sm text-black hover:translate-y-[-1px] transition-transform select-none">
                <div className="w-8 h-8 rounded-full bg-primary border-2 border-black flex items-center justify-center text-white font-display text-sm leading-none">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="font-sans font-bold text-black text-sm tracking-wide">{user.username}</span>
              </Link>
              <button 
                onClick={logout}
                className="font-display text-base bg-white hover:bg-red-100 border-4 border-black px-3.5 py-1.5 rounded-lg transition-colors"
              >
                SAIR
              </button>
            </div>
          ) : (
            <Link 
              href="/login"
              className="bg-primary text-white hover:bg-yellow-400 hover:text-black font-display text-base border-4 border-black px-4 py-2 rounded-lg comic-shadow-sm transition-colors uppercase flex items-center justify-center"
            >
              LOGIN
            </Link>
          )}
        </div>

        {/* Mobile Navigation — icon only, compact */}
        <nav className="lg:hidden flex items-center gap-0.5 sm:gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "p-1.5 sm:p-2 border-2 sm:border-[3px] border-black rounded-lg transition-all",
                  location === item.path ? "bg-white" : "bg-transparent hover:bg-white/50"
                )}
                title={item.label}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
              </Link>
            );
          })}

          {/* +18 Mode Toggle (Mobile) */}
          <button
            onClick={toggleNsfw}
            className={cn(
              "p-1.5 sm:p-2 border-2 sm:border-[3px] rounded-lg transition-all flex items-center justify-center",
              isNsfw 
                ? "bg-[#f43f5e] text-white border-white" 
                : "bg-white text-black border-black hover:bg-gray-100"
            )}
            title="Modo +18"
          >
            <span className="text-xs sm:text-sm">🔞</span>
          </button>

          {/* Auth Actions (Mobile) */}
          <div className="flex items-center border-l-2 border-black/10 pl-2 ml-1">
            {user ? (
              <Link 
                href="/login"
                className="w-8 h-8 rounded-full bg-primary border-2 border-black flex items-center justify-center text-white text-xs font-display select-none hover:translate-y-[-1px] transition-transform"
                title={`Conta de ${user.username}`}
              >
                {user.username.charAt(0).toUpperCase()}
              </Link>
            ) : (
              <Link 
                href="/login"
                className="p-1.5 border-2 border-black rounded-lg bg-primary text-white hover:bg-yellow-400 transition-colors flex items-center justify-center"
                title="Login"
              >
                <User className="w-4.5 h-4.5" strokeWidth={3} />
              </Link>
            )}
          </div>
        </nav>
      </div>

      {/* Modal: Requisito de Login */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-4 border-black p-6 rounded-xl comic-shadow max-w-sm w-full text-center space-y-4">
            <h3 className="font-display text-2xl text-black uppercase flex items-center justify-center gap-2">
              ⚠️ ACESSO RESTRITO
            </h3>
            <p className="font-sans font-bold text-gray-700 text-sm leading-relaxed">
              Você precisa estar conectado à sua conta para acessar o catálogo adulto (+18). Deseja ir para a página de login agora?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  setLocation("/login");
                }}
                className="flex-1 bg-primary text-white hover:bg-yellow-400 hover:text-black font-display py-2 border-4 border-black rounded-lg transition-colors uppercase"
              >
                Ir para o Login
              </button>
              <button
                onClick={() => setShowLoginModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 font-display py-2 border-4 border-black rounded-lg transition-colors uppercase"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmação de Idade (+18) */}
      {showAgeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border-4 border-[#f43f5e] p-6 rounded-xl shadow-[0_0_30px_rgba(244,63,94,0.3)] max-w-md w-full text-center space-y-4">
            <div className="text-4xl">🔞</div>
            <h3 className="font-display text-2xl text-white uppercase tracking-wide">
              ÁREA RESTRITA (+18)
            </h3>
            <p className="font-sans font-bold text-gray-300 text-sm leading-relaxed">
              Este espaço contém HQs e mangás com conteúdo adulto explícito (Hentai, Ecchi, Erótico). Você confirma que tem 18 anos ou mais e aceita visualizar esse conteúdo?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleConfirmAge}
                className="flex-1 bg-[#f43f5e] text-white hover:bg-[#e11d48] font-display py-2 border-4 border-white rounded-lg shadow-[0_0_10px_rgba(244,63,94,0.5)] transition-all uppercase"
              >
                Sim, tenho 18+
              </button>
              <button
                onClick={() => setShowAgeModal(false)}
                className="flex-1 bg-zinc-800 text-gray-400 hover:bg-zinc-700 hover:text-white font-display py-2 border-4 border-zinc-600 rounded-lg transition-colors uppercase"
              >
                Não, sair
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
