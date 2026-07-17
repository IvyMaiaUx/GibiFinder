const FAVORITES_KEY = "gibi-finder:favorites";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface FavoriteItem {
  providerId: string;
  mangaId: string;
  title: string;
  coverUrl?: string;
  description?: string;
  timestamp: number;
}

export const getFavorites = (): FavoriteItem[] => {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]") as FavoriteItem[];
  } catch {
    return [];
  }
};

export const isFavorite = (providerId: string, mangaId: string): boolean =>
  getFavorites().some(f => f.mangaId === mangaId && f.providerId === providerId);

export const toggleFavorite = (
  item: Omit<FavoriteItem, "timestamp">,
  userId?: string
): boolean => {
  const favorites = getFavorites();
  const index = favorites.findIndex(f => f.mangaId === item.mangaId && f.providerId === item.providerId);
  let next: FavoriteItem[];
  let added: boolean;

  if (index > -1) {
    next = favorites.filter((_, i) => i !== index);
    added = false;
  } else {
    next = [{ ...item, timestamp: Date.now() }, ...favorites];
    added = true;
  }

  localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));

  if (userId) {
    fetch(`${BASE}/api/auth/favorites/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, favorites: next })
    }).catch(err => console.error("Error syncing favorites:", err));
  }

  return added;
};
