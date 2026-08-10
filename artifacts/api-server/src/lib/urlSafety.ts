// Blocks requests to private/internal/link-local addresses so public,
// unauthenticated proxy endpoints (image-proxy, pdf-proxy) and admin
// inspection tools can't be used to reach internal network services or
// cloud metadata endpoints (SSRF). String-based on the hostname only — it
// does not resolve DNS, so a hostname that only resolves to a private
// address via DNS (attacker-controlled DNS, or DNS rebinding between this
// check and the actual connection) can still slip through. Good enough as
// a first-line filter for the literal-IP case, which is what every known
// exploit attempt against these routes has used so far; real hardening
// would resolve the hostname and check the resulting IP directly.
export function isPrivateOrInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host)) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^0\./.test(host)) return true; // 0.0.0.0/8 — routes to localhost on many systems
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true; // link-local, incl. cloud metadata (169.254.169.254)
  // IPv6 loopback, link-local (fe80::/10) and unique-local (fc00::/7)
  if (/^::1$/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}
