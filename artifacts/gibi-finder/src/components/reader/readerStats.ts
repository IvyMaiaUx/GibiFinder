/**
 * Lightweight, module-level instrumentation for the reader diagnostics panel.
 * Everything here is best-effort telemetry — no behaviour depends on it.
 */

export const readerStats = { loaded: 0, failed: 0, retried: 0, cacheHits: 0 };

export function bumpStat(key: keyof typeof readerStats) {
  readerStats[key] += 1;
}

export function resetReaderStats() {
  readerStats.loaded = 0;
  readerStats.failed = 0;
  readerStats.retried = 0;
  readerStats.cacheHits = 0;
}

export interface ReqLogEntry {
  url: string;
  kind: string;      // e.g. "pages" | "chapters"
  ms: number;        // round-trip time
  status: number | string;
  at: number;        // epoch ms
}

export const reqLog: ReqLogEntry[] = [];

export function logRequest(entry: ReqLogEntry) {
  reqLog.unshift(entry);
  if (reqLog.length > 40) reqLog.pop();
}
