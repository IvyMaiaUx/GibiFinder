import { authHeaders } from "./authToken";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface ReadingStats {
  totalSessions: number;
  totalDurationMs: number;
  totalPagesRead: number;
  avgSessionMs: number | null;
  titlesRead: number;
  completedCount: number;
  favoritesCount: number;
  currentStreakDays: number;
  longestStreakDays: number;
  lastReadAt: string | null;
}

const EMPTY_STATS: ReadingStats = {
  totalSessions: 0,
  totalDurationMs: 0,
  totalPagesRead: 0,
  avgSessionMs: null,
  titlesRead: 0,
  completedCount: 0,
  favoritesCount: 0,
  currentStreakDays: 0,
  longestStreakDays: 0,
  lastReadAt: null,
};

// GET /api/auth/stats/me — the current user is derived server-side from
// the auth token, not this function's argument; userId here only gates
// whether we bother calling at all (mirrors getSyncedFavorites()'s shape).
export const getReadingStats = async (userId?: string): Promise<ReadingStats> => {
  if (!userId) return EMPTY_STATS;
  try {
    const res = await fetch(`${BASE}/api/auth/stats/me`, { headers: { ...authHeaders() } });
    if (!res.ok) return EMPTY_STATS;
    return await res.json() as ReadingStats;
  } catch {
    return EMPTY_STATS;
  }
};
