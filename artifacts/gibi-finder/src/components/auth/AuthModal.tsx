import { useState } from "react";
import { X, Lock, User, Mail, Loader2, Check } from "lucide-react";
import { motion } from "framer-motion";

interface AuthModalProps {
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<boolean>;
  onRegister: (username: string, password: string, email?: string) => Promise<boolean>;
}

export function AuthModal({ onClose, onLogin, onRegister }: AuthModalProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    let success = false;
    if (isRegister) {
      success = await onRegister(username.trim(), password.trim(), email.trim() || undefined);
    } else {
      success = await onLogin(username.trim(), password.trim());
    }
    setLoading(false);
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-md bg-white border-4 border-black p-8 relative comic-shadow"
      >
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-1.5 border-2 border-black hover:bg-muted transition-colors text-black"
        >
          <X className="w-5 h-5" strokeWidth={3} />
        </button>

        <div className="text-center mb-6 select-none">
          <div className="inline-block bg-primary text-white font-display text-lg px-4 py-1 border-4 border-black transform -rotate-3 shadow-[3px_3px_0_rgba(0,0,0,1)] mb-3">
            {isRegister ? "NOVO LEITOR" : "ÁREA DO LEITOR"}
          </div>
          <h2 className="font-display text-4xl text-black leading-none">
            {isRegister ? "CRIAR CONTA" : "ENTRAR NO SITE"}
          </h2>
          <p className="font-sans font-bold text-xs text-gray-500 mt-1 uppercase">
            {isRegister ? "Cadastre-se para sincronizar seus favoritos" : "Acesse sua coleção de qualquer dispositivo"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-left font-sans">
          <div className="space-y-1.5">
            <label className="font-display text-xs text-gray-500 uppercase">Usuário</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" strokeWidth={3} />
              <input
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Ex: joao_geek"
                className="w-full border-4 border-black pl-12 pr-4 py-3 font-sans font-bold text-black text-base focus:outline-none focus:ring-4 focus:ring-secondary"
              />
            </div>
          </div>

          {isRegister && (
            <div className="space-y-1.5 animate-in fade-in duration-200">
              <label className="font-display text-xs text-gray-500 uppercase">E-mail (Opcional)</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" strokeWidth={3} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Ex: joao@email.com"
                  className="w-full border-4 border-black pl-12 pr-4 py-3 font-sans font-bold text-black text-base focus:outline-none focus:ring-4 focus:ring-secondary"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="font-display text-xs text-gray-500 uppercase">Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" strokeWidth={3} />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Sua senha secreta..."
                className="w-full border-4 border-black pl-12 pr-4 py-3 font-sans font-bold text-black text-base focus:outline-none focus:ring-4 focus:ring-secondary"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || !username.trim() || !password.trim()}
            className="w-full bg-primary text-white border-4 border-black py-3.5 font-display text-xl comic-shadow flex items-center justify-center gap-2 hover:bg-yellow-400 hover:text-black transition-colors disabled:opacity-50 mt-6 uppercase tracking-wide"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Check className="w-5 h-5" strokeWidth={3} />
            )}
            {isRegister ? "CADASTRAR CONTA" : "ENTRAR"}
          </button>
        </form>

        <div className="text-center mt-6 pt-4 border-t-2 border-dashed border-gray-200">
          <button 
            onClick={() => { setIsRegister(!isRegister); setUsername(""); setPassword(""); setEmail(""); }}
            className="font-sans font-bold text-sm text-primary hover:text-black transition-colors"
          >
            {isRegister ? "Já possui conta? Faça login aqui!" : "Não tem conta? Cadastre-se grátis!"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
