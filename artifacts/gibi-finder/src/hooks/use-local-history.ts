const HISTORY_KEY = "gibi_local_history";
const MAX_ITEMS = 50;

export interface LocalHistoryItem {
  id: string;
  titulo: string;
  revista: string;
  editora: string;
  ano: string;
  images: string[];
  search_type: string;
  created_at: string;
}

export function getLocalHistory(): LocalHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToLocalHistory(item: LocalHistoryItem) {
  try {
    const history = getLocalHistory().filter((h) => h.id !== item.id);
    const updated = [item, ...history].slice(0, MAX_ITEMS);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

export function removeFromLocalHistory(id: string): LocalHistoryItem[] {
  try {
    const updated = getLocalHistory().filter((h) => h.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return getLocalHistory();
  }
}

export function clearLocalHistory() {
  localStorage.removeItem(HISTORY_KEY);
}
