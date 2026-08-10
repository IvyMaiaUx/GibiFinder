import * as dns from "dns";
import * as net from "net";

// Blocks requests to private/internal/link-local addresses so public,
// unauthenticated proxy endpoints (image-proxy, pdf-proxy) and admin
// inspection tools can't be used to reach internal network services or
// cloud metadata endpoints (SSRF).
//
// isPrivateOrInternalHost() below is a cheap, synchronous, HOSTNAME-TEXT
// check — it catches a literal IP typed directly in a URL, but tells you
// nothing about where an ordinary domain name actually points. A domain
// that resolves to a private address (attacker-controlled DNS, or "DNS
// rebinding" — a domain that answers with a public IP the first time and a
// private one moments later, timed to land after a check like this one but
// before the actual connection) sails straight through it. That's a real,
// known bypass for this class of check — resolveAndPinPublicHost() below
// closes it for real by resolving DNS ourselves, validating the resolved
// IP, and returning that exact address for the caller to connect to via a
// pinned `lookup` (so a second, independent DNS resolution at connect time
// — which is what leaves the rebinding window open — never happens).

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 127) return true;                        // 127.0.0.0/8 — loopback
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 0) return true;                            // 0.0.0.0/8 — routes to localhost on many systems
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16
  if (a === 169 && b === 254) return true;            // 169.254.0.0/16 — link-local, incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const host = ip.toLowerCase();
  if (host === "::1" || host === "::") return true;                       // loopback / unspecified
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);              // IPv4-mapped IPv6
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;                        // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;                        // fc00::/7 unique-local
  return false;
}

function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return false;
}

// Synchronous pre-check against the literal hostname text — no DNS lookup,
// so it only catches an IP address (or "localhost") written directly into
// the URL. Kept as a cheap first filter; resolveAndPinPublicHost is what
// actually validates an ordinary domain name.
export function isPrivateOrInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (net.isIP(host)) return isPrivateIP(host);
  return false;
}

export class BlockedHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedHostError";
  }
}

// Resolves `hostname`, rejects if it (or any of its resolved addresses) is
// private/internal, and returns the specific address + family to connect
// to. Passing that back into a request's `lookup` option (Node's http/https
// modules both accept one) pins the connection to the exact address that
// was validated, instead of letting the request perform its own, separate
// DNS resolution afterwards — which is the gap that makes DNS rebinding
// possible in the first place.
export async function resolveAndPinPublicHost(hostname: string): Promise<{ address: string; family: number }> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new BlockedHostError(`blocked_private_host: ${hostname}`);
  }
  if (net.isIP(host)) {
    if (isPrivateIP(host)) throw new BlockedHostError(`blocked_private_host: ${hostname}`);
    return { address: host, family: net.isIPv6(host) ? 6 : 4 };
  }
  let results: dns.LookupAddress[];
  try {
    results = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BlockedHostError(`dns_resolution_failed: ${hostname}`);
  }
  if (results.length === 0) throw new BlockedHostError(`dns_resolution_failed: ${hostname}`);
  for (const result of results) {
    if (isPrivateIP(result.address)) {
      throw new BlockedHostError(`blocked_private_host: ${hostname} -> ${result.address}`);
    }
  }
  return { address: results[0].address, family: results[0].family };
}
