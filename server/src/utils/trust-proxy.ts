import { INestApplication, Logger } from "@nestjs/common";

import { DEFAULT_TRUST_PROXY_HOPS } from "../constants/auth-security.constants";

const TRUST_PROXY_SETTING = "trust proxy";

/**
 * Number of proxies in front of the API, from TRUST_PROXY_HOPS (a
 * non-negative integer), defaulting to the single production load balancer.
 */
export function resolveTrustProxyHops(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_TRUST_PROXY_HOPS;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0) {
    new Logger("TrustProxy").warn(
      `Ignoring invalid TRUST_PROXY_HOPS; using ${DEFAULT_TRUST_PROXY_HOPS}`,
    );
    return DEFAULT_TRUST_PROXY_HOPS;
  }
  return hops;
}

/**
 * Makes `req.ip` the client address rather than the load balancer's, so
 * per-IP rate limits apply to each client. A hop count (never `true`) means
 * only the entries our own proxies appended to X-Forwarded-For are trusted;
 * anything a client puts there itself is ignored.
 */
export function applyTrustProxy(app: INestApplication): void {
  const hops = resolveTrustProxyHops(process.env.TRUST_PROXY_HOPS);
  app.getHttpAdapter().getInstance().set(TRUST_PROXY_SETTING, hops);
}
