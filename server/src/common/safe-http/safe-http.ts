import type { AxiosRequestConfig } from "axios";
import { lookup as dnsLookup, LookupAddress } from "dns";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import { LookupFunction } from "net";

import {
  BOOLEAN_STRING_VALUES,
  NODE_ENV_VALUES,
} from "../../constants/domain-types";
import { SAFE_HTTP } from "../../constants/safe-http.constants";
import { isBlockedAddress } from "./blocked-address";

/** Raised when an outbound request would reach a private/internal address. */
export class BlockedOutboundAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = BlockedOutboundAddressError.name;
  }
}

const NON_PRODUCTION_ENVS: readonly string[] = [
  NODE_ENV_VALUES.DEVELOPMENT,
  NODE_ENV_VALUES.TEST,
];

/**
 * True only when the explicit opt-in flag is set AND NODE_ENV is development
 * or test, so a misconfigured production deployment can never enable it.
 */
export function isPrivateOutboundAllowed(): boolean {
  return (
    process.env[SAFE_HTTP.ALLOW_PRIVATE_ENV_KEY] ===
      BOOLEAN_STRING_VALUES.TRUE &&
    NON_PRODUCTION_ENVS.includes(process.env.NODE_ENV ?? "")
  );
}

/**
 * Builds a socket `lookup` that resolves every record and refuses the
 * connection if any of them is internal. Used as the socket's resolver, so
 * the address vetted is the one connected to (no DNS-rebinding window).
 * Node skips `lookup` for IP-literal hosts: check those with
 * {@link isBlockedAddress} before connecting.
 */
export function createPublicOnlyLookup(
  makeError: (hostname: string) => Error = (hostname) =>
    new BlockedOutboundAddressError(
      `"${hostname}" resolves to a private/internal address`,
    ),
): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(
      hostname,
      { all: true, verbatim: true },
      (error, addresses: LookupAddress[]) => {
        if (error) {
          callback(error, "");
          return;
        }
        if (
          addresses.length === 0 ||
          addresses.some(({ address }) => isBlockedAddress(address))
        ) {
          callback(makeError(hostname), "");
          return;
        }
        if (options.all) {
          callback(null, addresses);
          return;
        }
        callback(null, addresses[0].address, addresses[0].family);
      },
    );
  };
}

export const publicOnlyLookup = createPublicOnlyLookup();

const publicOnlyHttpAgent = new HttpAgent({ lookup: publicOnlyLookup });
const publicOnlyHttpsAgent = new HttpsAgent({ lookup: publicOnlyLookup });

export interface SafeAxiosOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Axios settings for a request to a user-supplied URL: connections only to
 * public addresses (unless {@link isPrivateOutboundAllowed}), no redirects
 * (a 3xx is returned or rejected, never followed), no env proxy, a timeout
 * and request/response size caps. Pair with `assertSafeOutboundUrl`, which
 * covers scheme, userinfo and IP-literal hosts.
 */
export function safeAxiosConfig(
  options: SafeAxiosOptions = {},
): AxiosRequestConfig {
  const allowPrivate = isPrivateOutboundAllowed();
  return {
    ...(allowPrivate
      ? {}
      : { httpAgent: publicOnlyHttpAgent, httpsAgent: publicOnlyHttpsAgent }),
    proxy: false,
    maxRedirects: 0,
    timeout: options.timeoutMs ?? SAFE_HTTP.DEFAULT_TIMEOUT_MS,
    maxContentLength:
      options.maxResponseBytes ?? SAFE_HTTP.DEFAULT_MAX_RESPONSE_BYTES,
    maxBodyLength: SAFE_HTTP.MAX_REQUEST_BODY_BYTES,
  };
}
