import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Lock, User, Check, Loader2, LogOut, ArrowRight, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function Login() {
  const [, setLocation] = useLocation();
  const { user, login, register, logout, loading } = useAuth();
  
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // If already logged in and loading is done, we can show the logged-in state on this page
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setActionLoading(true);
    let success = false;
    if (isRegister) {
      success = await register(username.trim(), password.trim(), undefined, rememberMe);
    } else {
      success = await login(username.trim(), password.trim(), rememberMe);
    }
    setActionLoading(false);
    if (success) {
      setLocation("/colecao");
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto mt-8 md:mt-16 px-4 select-none">
        {user ? (
          /* Logged In View */
          <div className="bg-white border-4 border-black p-8 text-center comic-shadow relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 opacity-5 bg-[radial-gradient(black_1px,transparent_1px)] [background-size:6px_6px] pointer-events-none" />
            
            <div className="w-24 h-24 bg-secondary border-4 border-black rounded-full flex items-center justify-center mx-auto mb-6 comic-shadow-sm transform -rotate-3 select-none">
              <span className="font-display text-4xl text-black leading-none">{user.username.charAt(0).toUpperCase()}</span>
            </div>
            
            <span className="inline-block bg-primary text-white font-display text-xs px-3 py-1 border-2 border-black transform rotate-2 mb-2">
              CONECTADO
            </span>
            <h2 className="font-display text-3xl text-black leading-none">{user.username}</h2>
            <p className="font-sans font-bold text-xs text-gray-500 mt-2 uppercase">
              Membro desde: {new Date(user.created_at).toLocaleDateString("pt-BR")}
            </p>
            
            <div className="mt-8 flex flex-col gap-3">
              <button 
                onClick={() => setLocation("/colecao")}
                className="w-full bg-secondary text-black border-4 border-black py-3.5 font-display text-lg comic-shadow flex items-center justify-center gap-2 hover:bg-yellow-300 transition-colors uppercase tracking-wider"
              >
                Ir para Minha Estante <ArrowRight className="w-5 h-5" strokeWidth={3} />
              </button>
              
              <button 
                onClick={logout}
                className="w-full bg-white hover:bg-red-50 text-red-600 border-4 border-black py-3.5 font-display text-lg flex items-center justify-center gap-2 transition-colors uppercase tracking-wider"
              >
                <LogOut className="w-5 h-5" strokeWidth={3} /> Desconectar Conta
              </button>
            </div>
          </div>
        ) : (
          /* Login/Register Form View */
          <div className="bg-white border-4 border-black p-8 text-center comic-shadow relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 opacity-5 bg-[radial-gradient(black_1px,transparent_1px)] [background-size:6px_6px] pointer-events-none" />
            
            <div className="w-20 h-20 bg-primary border-4 border-black rounded-full flex items-center justify-center mx-auto mb-4 comic-shadow-sm transform -rotate-3">
              {isRegister ? (
                <UserPlus className="w-10 h-10 text-white" strokeWidth={3} />
              ) : (
                <User className="w-10 h-10 text-white" strokeWidth={3} />
              )}
            </div>
            
            <h1 className="font-display text-4xl text-black mb-1 uppercase tracking-wider">
              {isRegister ? "Nova Conta" : "Área do Leitor"}
            </h1>
            <p className="font-sans font-bold text-xs text-gray-500 mb-8 uppercase">
              {isRegister ? "Cadastre-se para sincronizar seus favoritos" : "Entre para salvar sua coleção na nuvem"}
            </p>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
              <div className="space-y-1.5">
                <span className="font-display text-xs text-gray-500 uppercase">Usuário</span>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" strokeWidth={3} />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Nome de usuário..."
                    className="w-full border-4 border-black pl-12 pr-4 py-3.5 font-sans font-bold text-black text-lg focus:outline-none focus:ring-4 focus:ring-secondary"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="font-display text-xs text-gray-500 uppercase">Senha</span>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" strokeWidth={3} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Sua senha..."
                    className="w-full border-4 border-black pl-12 pr-4 py-3.5 font-sans font-bold text-black text-lg focus:outline-none focus:ring-4 focus:ring-secondary"
                  />
                </div>
              </div>

              {/* Keep Connected Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer py-1 font-sans font-bold text-sm text-gray-700 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-5 h-5 border-4 border-black rounded bg-white checked:bg-primary focus:ring-0 cursor-pointer accent-black"
                />
                <span>Manter conectado</span>
              </label>

              <button 
                type="submit" 
                disabled={actionLoading || !username.trim() || !password.trim()}
                className="w-full bg-primary text-white border-4 border-black py-4 font-display text-xl comic-shadow flex items-center justify-center gap-2 hover:bg-yellow-400 hover:text-black transition-colors disabled:opacity-50 mt-4 uppercase tracking-wider"
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    AUTENTICANDO...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" strokeWidth={3} />
                    {isRegister ? "CADASTRAR CONTA" : "ENTRAR"}
                  </>
                )}
              </button>
            </form>

            <div className="text-center mt-6 pt-4 border-t-2 border-dashed border-gray-200">
              <button 
                onClick={() => { setIsRegister(!isRegister); setUsername(""); setPassword(""); }}
                className="font-sans font-bold text-sm text-primary hover:text-black transition-colors"
              >
                {isRegister ? "Já possui conta? Faça login aqui!" : "Não tem conta? Cadastre-se grátis!"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
