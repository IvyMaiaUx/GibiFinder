const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function createSession(params: {
  providerId: string;
  mangaId: string;
  chapterId: string;
  chapterNum: string;
}) {
  const startMs = Date.now();
  let flushed = false;

  return {
    flush(pagesRead = 0) {
      if (flushed) return;
      flushed = true;
      const durationMs = Date.now() - startMs;
      if (durationMs < 15_000) return; // ignore accidental opens < 15s
      fetch(`${BASE}/api/auth/stats/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, durationMs, pagesRead }),
      }).catch(() => {});
    },
  };
}
