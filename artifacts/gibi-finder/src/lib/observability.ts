import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/**
 * Initialize frontend observability:
 * - Sentry error capture (only when VITE_SENTRY_DSN is set — no-op otherwise).
 * - Correlation: capture the backend's X-Request-Id from API responses and
 *   attach it to reports, so a client error links to the server log.
 */
export function initObservability() {
  if (DSN) {
    Sentry.init({
      dsn: DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
    });
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let res: Response;
    try {
      res = await origFetch(input, init);
    } catch (err) {
      if (DSN) Sentry.captureException(err, { tags: { kind: "network" } });
      throw err;
    }
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.includes("/api/")) {
        const reqId = res.headers.get("X-Request-Id");
        if (reqId) (window as unknown as { __lastRequestId?: string }).__lastRequestId = reqId;
        if (DSN && !res.ok && res.status >= 500) {
          Sentry.captureMessage(`API ${res.status} ${url.split("?")[0]}`, {
            level: "error",
            tags: { requestId: reqId ?? "unknown", status: String(res.status) },
          });
        }
      }
    } catch {
      /* never let observability break a request */
    }
    return res;
  }) as typeof window.fetch;
}

export { Sentry };
