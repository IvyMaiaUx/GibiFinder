import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { syncReadingHistory, syncSearchHistory, getSyncedCompleted } from "@/lib/user-history";
import { setToken, clearToken, authHeaders } from "@/lib/authToken";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const AUTH_KEY = "gibi-finder:auth_user";
// useAuth() is a plain hook, not a shared context — every call site (Header,
// every page, MangaDexReader, ...) gets its own independent `user` state,
// each restored from storage on ITS OWN mount only. That was harmless while
// every page wrapped itself in its own <Layout> (so Header remounted, and
// re-read storage, on every navigation) — but since Layout was hoisted to
// mount once for the whole session (fixing the nav flicker), Header's `user`
// now never updates again after that first mount. Logging in on /login
// (its own useAuth() instance) never told Header's instance anything
// changed, so Header kept treating the user as logged out — clicking +18
// showed "faça login", but /login itself showed them already logged in.
// Fix: broadcast an event on login/register/logout so every instance
// re-syncs from storage, same pattern as "nsfw-change" elsewhere.
const AUTH_CHANGE_EVENT = "gibi-finder:auth-change";

export interface UserSession {
  id: string;
  username: string;
  email?: string;
  created_at: string;
}

function readStoredUser(): UserSession | null {
  try {
    const saved = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
    return saved ? (JSON.parse(saved) as UserSession) : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const restored = readStoredUser();
    if (restored) {
      setUser(restored);
      // Restoring an already-logged-in session (the common case — every
      // normal page load, not just a fresh login) previously never pulled
      // the account's current favorites/history/progress: the page just
      // trusted whatever this browser last cached, so changes made on
      // another device only showed up after manually visiting Coleção or
      // Histórico. Sync in the background so every page load is current.
      syncUserData(restored.id);
    }
    setLoading(false);

    // Re-sync when login/register/logout happens in ANY useAuth() instance
    // (e.g. the Login page), not just this one.
    const onAuthChange = () => setUser(readStoredUser());
    window.addEventListener(AUTH_CHANGE_EVENT, onAuthChange);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, onAuthChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (username: string, password: string, rememberMe: boolean = true): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        if (rememberMe) {
          localStorage.setItem(AUTH_KEY, JSON.stringify(data.user));
        } else {
          sessionStorage.setItem(AUTH_KEY, JSON.stringify(data.user));
        }
        if (data.token) setToken(data.token, rememberMe);
        setUser(data.user);
        window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
        toast({ title: `Bem-vindo de volta, ${data.user.username}!`, description: "Seu progresso e favoritos foram sincronizados." });

        syncUserData(data.user.id);
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

  const register = async (username: string, password: string, email?: string, rememberMe: boolean = true): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email })
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        if (rememberMe) {
          localStorage.setItem(AUTH_KEY, JSON.stringify(data.user));
        } else {
          sessionStorage.setItem(AUTH_KEY, JSON.stringify(data.user));
        }
        if (data.token) setToken(data.token, rememberMe);
        setUser(data.user);
        window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
        toast({ title: "Cadastro realizado!", description: `Sua conta '${data.user.username}' foi criada com sucesso.` });

        syncUserData(data.user.id);
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

  // Change the current account's username and/or password. Requires the
  // current password (re-verified server-side) — same shape as login, not
  // trusted from anywhere client-side. Updates the stored session in place
  // (same storage — local vs session — the account was already using) and
  // broadcasts AUTH_CHANGE_EVENT so every useAuth() instance (Header, etc.)
  // picks up a changed username immediately.
  const updateAccount = async (
    currentPassword: string,
    opts: { newUsername?: string; newPassword?: string }
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch(`${BASE}/api/auth/account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          currentPassword,
          newUsername: opts.newUsername,
          newPassword: opts.newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        const updated = data.user as UserSession;
        if (localStorage.getItem(AUTH_KEY)) {
          localStorage.setItem(AUTH_KEY, JSON.stringify(updated));
        } else {
          sessionStorage.setItem(AUTH_KEY, JSON.stringify(updated));
        }
        setUser(updated);
        window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
        toast({ title: "Conta atualizada!", description: "Suas informações foram salvas." });
        return { success: true };
      }
      const message = data.message || "Não foi possível atualizar sua conta";
      toast({ title: "Erro ao atualizar", description: message, variant: "destructive" });
      return { success: false, message };
    } catch {
      toast({ title: "Erro na conexão", description: "Verifique sua internet", variant: "destructive" });
      return { success: false, message: "network" };
    }
  };

  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
    clearToken();
    setUser(null);
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
    toast({ title: "Sessão encerrada", description: "Você desconectou da sua estante." });
  };

  const syncFavorites = async (userId: string) => {
    try {
      const localFavs = JSON.parse(localStorage.getItem("gibi-finder:favorites") || "[]");
      
      // Upload current local favorites to server
      await fetch(`${BASE}/api/auth/favorites/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ userId, favorites: localFavs })
      });

      // Also fetch merged favorites from server
      const res = await fetch(`${BASE}/api/auth/favorites?userId=${userId}`, { headers: { ...authHeaders() } });
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

  const syncUserData = async (userId: string) => {
    await Promise.all([
      syncFavorites(userId),
      syncSearchHistory(userId),
      syncReadingHistory(userId),
      getSyncedCompleted(userId).catch(() => {})
    ]);
  };

  return { user, loading, login, register, logout, updateAccount, syncFavorites, syncUserData };
}
