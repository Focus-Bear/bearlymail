import { lookup } from "dns/promises";
import { BlockList, isIP } from "net";

import {
  IMAP_IMPLICIT_TLS_PORT,
  IMAP_STARTTLS_PORT,
  IP_VERSION,
  SMTP_ALTERNATE_SUBMISSION_PORT,
  SMTP_IMPLICIT_TLS_PORT,
  SMTP_SUBMISSION_PORT,
} from "../constants/mail-server.constants";

/**
 * Mail ports a user may point a hosted deployment at. Anything else on a
 * user-supplied host would let the server be used to probe arbitrary services.
 * Self-hosted deployments accept any port: local bridges such as Proton Mail
 * Bridge listen on 1143/1025.
 */
export const ALLOWED_IMAP_PORTS: readonly number[] = [
  IMAP_IMPLICIT_TLS_PORT,
  IMAP_STARTTLS_PORT,
];
export const ALLOWED_SMTP_PORTS: readonly number[] = [
  SMTP_IMPLICIT_TLS_PORT,
  SMTP_SUBMISSION_PORT,
  SMTP_ALTERNATE_SUBMISSION_PORT,
];

/**
 * Address ranges a hosted deployment must never connect to on a user's
 * behalf: loopback, private, link-local (incl. the cloud metadata endpoint
 * 169.254.169.254), CGNAT, multicast/reserved and their IPv6 equivalents.
 */
const BLOCKED_IPV4_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/3",
];
const BLOCKED_IPV6_CIDRS = [
  "::/128",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
];

function buildBlockedRanges(): BlockList {
  const blocked = new BlockList();
  const add = (cidr: string, family: "ipv4" | "ipv6") => {
    const [network, prefix] = cidr.split("/");
    blocked.addSubnet(network, Number(prefix), family);
  };
  BLOCKED_IPV4_CIDRS.forEach((cidr) => add(cidr, "ipv4"));
  BLOCKED_IPV6_CIDRS.forEach((cidr) => add(cidr, "ipv6"));
  return blocked;
}

const BLOCKED_RANGES = buildBlockedRanges();

export class MailServerAddressError extends Error {}

export interface ResolvedMailServer {
  /** The hostname the user entered, used for TLS SNI and certificate checks. */
  hostname: string;
  /** The vetted IP we actually connect to, so DNS can't be re-pointed later. */
  address: string;
  port: number;
}

/**
 * Mail hosts often publish AAAA records that aren't reachable from IPv4-only
 * networks (most cloud VPCs), so connect over IPv4 whenever one is offered.
 */
function preferIpv4(addresses: Array<{ address: string }>): string {
  const ipv4 = addresses.find(({ address }) => isIP(address) === IP_VERSION.V4);
  return (ipv4 ?? addresses[0]).address;
}

const IPV4_MAPPED_PREFIX = "::ffff:";

function isBlockedAddress(address: string): boolean {
  // "::ffff:10.0.0.1" reaches the IPv4 host, so judge it as IPv4. (Listing
  // ::ffff:0:0/96 as a blocked range instead would block every IPv4 address:
  // BlockList matches IPv4 addresses against IPv4-mapped ranges.)
  const lower = address.toLowerCase();
  if (lower.startsWith(IPV4_MAPPED_PREFIX)) {
    const mapped = lower.slice(IPV4_MAPPED_PREFIX.length);
    if (isIP(mapped) === IP_VERSION.V4)
      return BLOCKED_RANGES.check(mapped, "ipv4");
  }
  const family = isIP(address) === IP_VERSION.V6 ? "ipv6" : "ipv4";
  return BLOCKED_RANGES.check(address, family);
}

/**
 * Resolves a user-supplied mail server. Hosted deployments refuse internal
 * targets and non-mail ports; self-hosted ones (`allowPrivate`) accept both,
 * since there the "internal" network is the user's own machine.
 */
export async function resolveMailServer(
  hostname: string,
  port: number,
  options: { allowedPorts: readonly number[]; allowPrivate: boolean },
): Promise<ResolvedMailServer> {
  const trimmed = hostname.trim().toLowerCase();
  if (!trimmed) throw new MailServerAddressError("Mail server is required");
  if (!options.allowPrivate && !options.allowedPorts.includes(port)) {
    throw new MailServerAddressError(
      `Port ${port} is not a supported mail port (use ${options.allowedPorts.join(", ")})`,
    );
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(trimmed, { all: true, verbatim: true });
  } catch {
    throw new MailServerAddressError(`Could not find mail server "${trimmed}"`);
  }
  if (addresses.length === 0) {
    throw new MailServerAddressError(`Could not find mail server "${trimmed}"`);
  }
  // Every record must be public: a mixed answer could be used to slip an
  // internal address past a check of only the first record.
  if (
    !options.allowPrivate &&
    addresses.some(({ address }) => isBlockedAddress(address))
  ) {
    throw new MailServerAddressError(
      `Mail server "${trimmed}" resolves to a private address`,
    );
  }
  return { hostname: trimmed, address: preferIpv4(addresses), port };
}
