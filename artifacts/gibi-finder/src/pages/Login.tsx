import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Lock, User, Check, Loader2, LogOut, ArrowRight, UserPlus, BookOpenCheck, BookOpen, Star, Settings, X, Camera } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { isAdultProviderId, fileToBase64 } from "@/lib/utils";
import { getSyncedCompleted, getSyncedReadingHistory, getLocalProgress } from "@/lib/user-history";
import { getSyncedFavorites } from "@/lib/favorites";

export default function Login() {
  const [, setLocation] = useLocation();
  const { user, login, register, logout, updateAccount, updateAvatar, loading } = useAuth();
  useDocumentMeta({ title: "Entrar", noindex: true });

  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Profile picture. Resized to 256px client-side (vs. 1280px for the
  // "busca por imagem" flow) since this only ever renders at a few dozen
  // px and gets stored as a DB column, not sent to an AI model.
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let picking the same file again re-fire onChange
    if (!file) return;
    setAvatarUploading(true);
    try {
      const dataUri = await fileToBase64(file, 256, 0.85);
      await updateAvatar(dataUri);
    } finally {
      setAvatarUploading(false);
    }
  };
  const handleRemoveAvatar = async () => {
    setAvatarUploading(true);
    try { await updateAvatar(null); } finally { setAvatarUploading(false); }
  };

  // "Editar conta" — there was previously no way to change your username or
  // recover/change your password from the UI at all.
  const [showEditAccount, setShowEditAccount] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [editConfirmPassword, setEditConfirmPassword] = useState("");
  const [editCurrentPassword, setEditCurrentPassword] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Esc-to-close, same as a native <dialog> — this modal (like the
  // age/login ones in Header.tsx) is a plain fixed-overlay div, not built
  // on a shared dialog primitive, so none of that comes for free.
  useEffect(() => {
    if (!showEditAccount) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setShowEditAccount(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showEditAccount]);

  const openEditAccount = () => {
    setEditUsername(user?.username || "");
    setEditNewPassword("");
    setEditConfirmPassword("");
    setEditCurrentPassword("");
    setEditError(null);
    setShowEditAccount(true);
  };

  const handleEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setEditError(null);

    const trimmedUsername = editUsername.trim();
    const newUsername = trimmedUsername && trimmedUsername !== user.username ? trimmedUsername : undefined;
    const newPassword = editNewPassword.trim() || undefined;

    if (!newUsername && !newPassword) {
      setEditError("Mude o nome de usuário ou defina uma senha nova antes de salvar.");
      return;
    }
    if (newPassword && newPassword !== editConfirmPassword.trim()) {
      setEditError("As senhas novas não coincidem.");
      return;
    }
    if (!editCurrentPassword.trim()) {
      setEditError("Informe sua senha atual para confirmar.");
      return;
    }

    setEditLoading(true);
    const result = await updateAccount(editCurrentPassword.trim(), { newUsername, newPassword });
    setEditLoading(false);
    if (result.success) {
      setShowEditAccount(false);
    } else {
      setEditError(result.message || "Não foi possível atualizar sua conta.");
    }
  };

  // Reading stats — this data already existed (completed chapters, in-
  // progress shelf, favorites all get synced for Coleção already), it just
  // never showed up anywhere the account itself could see it. Same +18
  // visibility filter Coleção uses, so this doesn't leak an adult read
  // count while +18 mode is off.
  const [isNsfw, setIsNsfw] = useState(() => document.documentElement.classList.contains("nsfw"));
  const [stats, setStats] = useState({ titlesRead: 0, reading: 0, favorites: 0 });
  useEffect(() => {
    const onNsfw = () => setIsNsfw(document.documentElement.classList.contains("nsfw"));
    window.addEventListener("nsfw-change", onNsfw);
    return () => window.removeEventListener("nsfw-change", onNsfw);
  }, []);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      // getSyncedReadingHistory has the side effect of rewriting the local
      // "gibi-finder:progress" cache from the account's synced history
      // (see lib/user-history.ts) — awaited here (not just favorites/completed,
      // which were already synced) so the "Lendo" tile stops reading whatever
      // this one browser happened to have cached and reflects the account.
      const [completed, favorites] = await Promise.all([
        getSyncedCompleted(user.id),
        getSyncedFavorites(user.id),
        getSyncedReadingHistory(user.id).catch(() => {}),
      ]);
      if (cancelled) return;
      const visibleCompleted = completed.filter(c => isAdultProviderId(c.providerId) === isNsfw);
      const completedChapterKeys = new Set(visibleCompleted.map(c => `${c.providerId}|${c.mangaId}|${c.chapterId}`));
      const titlesRead = new Set(visibleCompleted.map(c => `${c.providerId}|${c.mangaId}`)).size;
      const reading = Object.values(getLocalProgress()).filter(p =>
        p.providerId && p.mangaId &&
        isAdultProviderId(p.providerId) === isNsfw &&
        !completedChapterKeys.has(`${p.providerId}|${p.mangaId}|${p.chapterId}`)
      ).length;
      const favoritesCount = favorites.filter(f => isAdultProviderId(f.providerId) === isNsfw).length;
      setStats({ titlesRead, reading, favorites: favoritesCount });
    })();
    return () => { cancelled = true; };
  }, [user, isNsfw]);

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
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
    );
  }

  return (
      <div className="max-w-md mx-auto mt-8 md:mt-16 px-4 select-none">
        {user ? (
          /* Logged In View */
          <div className="bg-white border-4 border-black p-8 text-center comic-shadow relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 opacity-5 bg-[radial-gradient(black_1px,transparent_1px)] [background-size:6px_6px] pointer-events-none" />
            
            <div className="relative w-24 h-24 mx-auto mb-6">
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                title="Trocar foto de perfil"
                className="w-24 h-24 bg-secondary border-4 border-black rounded-full flex items-center justify-center comic-shadow-sm transform -rotate-3 select-none overflow-hidden disabled:opacity-60"
              >
                {avatarUploading ? (
                  <Loader2 className="w-8 h-8 text-black animate-spin" />
                ) : user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display text-4xl text-black leading-none">{user.username.charAt(0).toUpperCase()}</span>
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                title="Trocar foto de perfil"
                className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary text-white border-2 border-black rounded-full flex items-center justify-center hover:bg-yellow-400 hover:text-black transition-colors"
              >
                <Camera className="w-4 h-4" strokeWidth={2.5} />
              </button>
              {user.avatarUrl && !avatarUploading && (
                <button
                  onClick={handleRemoveAvatar}
                  title="Remover foto"
                  className="absolute -top-1 -left-1 w-6 h-6 bg-white text-gray-500 hover:text-red-600 border-2 border-black rounded-full flex items-center justify-center transition-colors"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={3} />
                </button>
              )}
            </div>

            <span className="inline-block bg-primary text-white font-display text-xs px-3 py-1 border-2 border-black transform rotate-2 mb-2">
              CONECTADO
            </span>
            <h2 className="font-display text-3xl text-black leading-none">{user.username}</h2>
            <p className="font-sans font-bold text-xs text-gray-500 mt-2 uppercase">
              Membro desde: {new Date(user.created_at).toLocaleDateString("pt-BR")}
            </p>

            {/* Reading stats — each tile deep-links into the matching
                Coleção tab instead of just repeating the generic "Ir para
                Minha Estante" button below. */}
            <div className="grid grid-cols-3 gap-2 mt-6">
              <button
                onClick={() => setLocation("/colecao?tab=completed")}
                className="bg-white border-2 border-black rounded-lg py-3 px-1 flex flex-col items-center gap-1 hover:bg-emerald-50 transition-colors"
              >
                <BookOpenCheck className="w-4 h-4 text-emerald-600" strokeWidth={2.5} />
                <span className="font-display text-xl text-black leading-none">{stats.titlesRead}</span>
                <span className="font-sans font-bold text-[10px] text-gray-500 uppercase tracking-wide">Lidos</span>
              </button>
              <button
                onClick={() => setLocation("/colecao?tab=progress")}
                className="bg-white border-2 border-black rounded-lg py-3 px-1 flex flex-col items-center gap-1 hover:bg-blue-50 transition-colors"
              >
                <BookOpen className="w-4 h-4 text-primary" strokeWidth={2.5} />
                <span className="font-display text-xl text-black leading-none">{stats.reading}</span>
                <span className="font-sans font-bold text-[10px] text-gray-500 uppercase tracking-wide">Lendo</span>
              </button>
              <button
                onClick={() => setLocation("/colecao?tab=favorites")}
                className="bg-white border-2 border-black rounded-lg py-3 px-1 flex flex-col items-center gap-1 hover:bg-yellow-50 transition-colors"
              >
                <Star className="w-4 h-4 text-secondary fill-secondary" strokeWidth={2.5} />
                <span className="font-display text-xl text-black leading-none">{stats.favorites}</span>
                <span className="font-sans font-bold text-[10px] text-gray-500 uppercase tracking-wide">Favoritos</span>
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-3">
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

              <button
                onClick={openEditAccount}
                className="w-full text-gray-500 hover:text-black font-sans font-bold text-xs flex items-center justify-center gap-1.5 py-2 transition-colors uppercase tracking-wide"
              >
                <Settings className="w-3.5 h-3.5" strokeWidth={2.5} /> Editar conta
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

        {/* Modal: Editar conta — change username and/or password. Both
            require the current password re-entered here, verified
            server-side, same as login (no client-trusted userId/identity). */}
        {showEditAccount && user && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setShowEditAccount(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-account-title"
              className="bg-white border-4 border-black p-6 rounded-xl comic-shadow max-w-sm w-full relative"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setShowEditAccount(false)}
                className="absolute top-3 right-3 text-gray-400 hover:text-black transition-colors"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" strokeWidth={3} />
              </button>

              <h3 id="edit-account-title" className="font-display text-2xl text-black uppercase text-center mb-6">
                Editar Conta
              </h3>

              <form onSubmit={handleEditAccount} className="flex flex-col gap-4 text-left">
                <div className="space-y-1.5">
                  <span className="font-display text-xs text-gray-500 uppercase">Nome de usuário</span>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={3} />
                    <input
                      type="text"
                      value={editUsername}
                      onChange={e => setEditUsername(e.target.value)}
                      className="w-full border-4 border-black pl-11 pr-4 py-2.5 font-sans font-bold text-black focus:outline-none focus:ring-4 focus:ring-secondary"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-display text-xs text-gray-500 uppercase">Nova senha (opcional)</span>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={3} />
                    <input
                      type="password"
                      value={editNewPassword}
                      onChange={e => setEditNewPassword(e.target.value)}
                      placeholder="Deixe em branco pra manter"
                      className="w-full border-4 border-black pl-11 pr-4 py-2.5 font-sans font-bold text-black focus:outline-none focus:ring-4 focus:ring-secondary"
                    />
                  </div>
                </div>

                {editNewPassword && (
                  <div className="space-y-1.5">
                    <span className="font-display text-xs text-gray-500 uppercase">Confirmar nova senha</span>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={3} />
                      <input
                        type="password"
                        value={editConfirmPassword}
                        onChange={e => setEditConfirmPassword(e.target.value)}
                        className="w-full border-4 border-black pl-11 pr-4 py-2.5 font-sans font-bold text-black focus:outline-none focus:ring-4 focus:ring-secondary"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 pt-2 border-t-2 border-dashed border-gray-200">
                  <span className="font-display text-xs text-gray-500 uppercase">Senha atual (obrigatório p/ confirmar)</span>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={3} />
                    <input
                      type="password"
                      required
                      value={editCurrentPassword}
                      onChange={e => setEditCurrentPassword(e.target.value)}
                      className="w-full border-4 border-black pl-11 pr-4 py-2.5 font-sans font-bold text-black focus:outline-none focus:ring-4 focus:ring-secondary"
                    />
                  </div>
                </div>

                {editError && (
                  <p role="alert" className="font-sans font-bold text-xs text-red-600 text-center">{editError}</p>
                )}

                <button
                  type="submit"
                  disabled={editLoading}
                  className="w-full bg-primary text-white border-4 border-black py-3 font-display text-lg comic-shadow-sm flex items-center justify-center gap-2 hover:bg-yellow-400 hover:text-black transition-colors disabled:opacity-50 mt-2 uppercase tracking-wider"
                >
                  {editLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" strokeWidth={3} />}
                  Salvar
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
  );
}
