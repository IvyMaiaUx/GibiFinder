import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const AUTH_KEY = "gibi-finder:auth_user";

export interface UserSession {
  id: string;
  username: string;
  email?: string;
  created_at: string;
}

export function useAuth() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTH_KEY);
      if (saved) {
        setUser(JSON.parse(saved));
      }
    } catch {}
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(data.user));
        setUser(data.user);
        toast({ title: `Bem-vindo de volta, ${data.user.username}!`, description: "Seu progresso e favoritos foram sincronizados." });
        
        // Trigger sync of local favorites to database
        syncFavorites(data.user.id);
        return true;
      } else {
        toast({ title: "Falha no login", description: data.message || "Usuário ou senha inválidos", variant: "destructive" });
        return false;
      }
    } catch {
      toast({ title: "Erro na conexão", description: "Verifique sua internet", variant: "destructive" });
      return false;
    }
  };

  const register = async (username: string, password: string, email?: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email })
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(data.user));
        setUser(data.user);
        toast({ title: "Cadastro realizado!", description: `Sua conta '${data.user.username}' foi criada com sucesso.` });
        
        // Sync local favorites
        syncFavorites(data.user.id);
        return true;
      } else {
        toast({ title: "Erro no cadastro", description: data.message || "Não foi possível criar a conta", variant: "destructive" });
        return false;
      }
    } catch {
      toast({ title: "Erro na conexão", description: "Verifique sua internet", variant: "destructive" });
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    setUser(null);
    toast({ title: "Sessão encerrada", description: "Você desconectou da sua estante synced." });
  };

  const syncFavorites = async (userId: string) => {
    try {
      const localFavs = JSON.parse(localStorage.getItem("gibi-finder:favorites") || "[]");
      
      // Upload current local favorites to server
      await fetch(`${BASE}/api/auth/favorites/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, favorites: localFavs })
      });
      
      // Also fetch merged favorites from server
      const res = await fetch(`${BASE}/api/auth/favorites?userId=${userId}`);
      if (res.ok) {
        const serverFavs = await res.json();
        if (serverFavs && serverFavs.length > 0) {
          localStorage.setItem("gibi-finder:favorites", JSON.stringify(serverFavs));
        }
      }
    } catch (e) {
      console.error("Failed to sync favorites on login:", e);
    }
  };

  return { user, loading, login, register, logout, syncFavorites };
}
