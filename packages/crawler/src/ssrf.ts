/**
 * Server-side request forgery (SSRF) protection.
 *
 * Eagle's Eye fetches URLs supplied by users. Without a guard, someone could point the
 * crawler at http://169.254.169.254/ (cloud metadata), http://localhost:5432/ or an
 * internal admin panel and read the response back through the chatbot.
 *
 * Defence in depth:
 *  1. `assertPublicUrl` rejects obviously bad targets early (non-http schemes, IP literals
 *     in private ranges, "localhost").
 *  2. The dispatcher returned by `createGuardedDispatcher` re-checks the *resolved* IP
 *     address at connection time. This closes the DNS-rebinding gap where a hostname passes
 *     a pre-check but resolves to a private address when actually connecting. It applies to
 *     every redirect hop too, because each hop opens a new connection.
 */
import dns from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent } from "undici";
import { EagleError } from "@eagles-eye/core";

/** Address ranges that must never be reachable from the crawler. */
const blocked = new BlockList();
const V4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, includes cloud metadata services
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved and broadcast
];
for (const [net, prefix] of V4_RANGES) blocked.addSubnet(net, prefix, "ipv4");
blocked.addAddress("::", "ipv6"); // unspecified
blocked.addAddress("::1", "ipv6"); // loopback
blocked.addSubnet("fc00::", 7, "ipv6"); // unique local
blocked.addSubnet("fe80::", 10, "ipv6"); // link-local
blocked.addSubnet("ff00::", 8, "ipv6"); // multicast
blocked.addSubnet("64:ff9b::", 96, "ipv6"); // NAT64 can embed private IPv4 targets

/** True when `address` (an IPv4 or IPv6 literal) is in a range the crawler must not reach. */
export function isBlockedAddress(address: string): boolean {
  // An IPv4 address wrapped in IPv6 ("::ffff:10.0.0.1") must be judged as the IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  const candidate = mapped?.[1] ?? address;
  const family = isIP(candidate);
  if (family === 0) return true; // not a valid IP: refuse rather than guess
  return blocked.check(candidate, family === 4 ? "ipv4" : "ipv6");
}

/** Pre-flight check of a URL before any network traffic. */
export function assertPublicUrl(rawUrl: string, allowPrivate = false): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new EagleError("invalid_url", `Not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EagleError("invalid_url", `Only http and https URLs can be crawled (got ${url.protocol})`);
  }
  if (allowPrivate) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new EagleError("blocked_url", `Refusing to crawl internal host: ${host}`);
  }
  if (isIP(host) !== 0 && isBlockedAddress(host)) {
    throw new EagleError("blocked_url", `Refusing to crawl private address: ${host}`);
  }
  return url;
}

/**
 * An undici dispatcher whose DNS lookup refuses private addresses.
 * Pass it as `dispatcher` to undici's `fetch`.
 */
export function createGuardedDispatcher(allowPrivate = false): Agent {
  return new Agent({
    connect: {
      // Signature follows net.connect's `lookup` option. Node may ask for one address or all.
      lookup: ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
        dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
          if (err) return callback(err);
          const list = addresses as dns.LookupAddress[];
          if (!allowPrivate) {
            const bad = list.find((a) => isBlockedAddress(a.address));
            if (bad) {
              return callback(new EagleError("blocked_url", `${hostname} resolves to a private address (${bad.address})`));
            }
          }
          if (options.all) return callback(null, list);
          const first = list[0];
          if (!first) return callback(new EagleError("fetch_failed", `No address found for ${hostname}`));
          return callback(null, first.address, first.family);
        });
      }) as never,
    },
  });
}
