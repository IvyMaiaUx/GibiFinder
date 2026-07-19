// Session token issued at login/register. Sent as `x-user-token` on every
// user-data request so the server derives the user id from the signed token
// (not from a client-supplied userId), closing the IDOR on those endpoints.
const TOKEN_KEY = "gibi-finder:token";

export function setToken(token: string, remember = true): void {
  try { (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}

export function getToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}

export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

/** Headers to attach to authenticated user requests. */
export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { "x-user-token": t } : {};
}
