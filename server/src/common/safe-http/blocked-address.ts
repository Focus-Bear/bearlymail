import { BlockList, isIP } from "net";

import { IP_VERSION } from "../../constants/mail-server.constants";

/**
 * Address ranges the server must never connect to on a user's behalf:
 * "this network", loopback, private, link-local (incl. the cloud metadata
 * endpoint), CGNAT, benchmarking, multicast/reserved/broadcast and their IPv6
 * equivalents, plus NAT64 prefixes (which can reach any IPv4 host).
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
  // Unspecified, loopback and the deprecated IPv4-compatible range.
  "::/96",
  "64:ff9b::/96",
  "64:ff9b:1::/48",
  "fc00::/7",
  "fe80::/10",
  "fec0::/10",
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

const IPV6_GROUPS = 8;
const IPV6_GROUP_RADIX = 16;
const IPV4_MAPPED_MARKER = 0xffff;
/** Groups 0-4 are zero and group 5 is ffff in an IPv4-mapped address. */
const IPV4_MAPPED_MARKER_GROUP = 5;
const BYTE_BITS = 8;
const BYTE_MASK = 0xff;
const ZONE_SEPARATOR = "%";

/** Expands an IPv6 address (any notation, incl. a dotted IPv4 tail) into its 8 groups. */
function ipv6Groups(address: string): number[] {
  const [head, tail = ""] = address.split("::");
  const parse = (part: string): number[] =>
    part
      ? part.split(":").flatMap((group) => {
          if (isIP(group) === IP_VERSION.V4) {
            const [o1, o2, o3, o4] = group.split(".").map(Number);
            return [(o1 << BYTE_BITS) | o2, (o3 << BYTE_BITS) | o4];
          }
          return [parseInt(group, IPV6_GROUP_RADIX)];
        })
      : [];
  const front = parse(head);
  const back = parse(tail);
  const zeros = address.includes("::")
    ? IPV6_GROUPS - front.length - back.length
    : 0;
  return [...front, ...new Array<number>(zeros).fill(0), ...back];
}

/** The IPv4 address an IPv4-mapped IPv6 address (::ffff:a.b.c.d) reaches, if it is one. */
function mappedIpv4(address: string): string | null {
  const groups = ipv6Groups(address);
  const isMapped =
    groups.length === IPV6_GROUPS &&
    groups.slice(0, IPV4_MAPPED_MARKER_GROUP).every((group) => group === 0) &&
    groups[IPV4_MAPPED_MARKER_GROUP] === IPV4_MAPPED_MARKER;
  if (!isMapped) return null;
  const [high, low] = groups.slice(IPV4_MAPPED_MARKER_GROUP + 1);
  return [
    high >> BYTE_BITS,
    high & BYTE_MASK,
    low >> BYTE_BITS,
    low & BYTE_MASK,
  ].join(".");
}

/**
 * True for any address a user-supplied target must not reach. An IPv4-mapped
 * IPv6 address (dotted or hex form) is judged by the IPv4 host it reaches;
 * anything that isn't a valid IP literal is treated as blocked.
 */
export function isBlockedAddress(address: string): boolean {
  const bare = address.split(ZONE_SEPARATOR)[0];
  const family = isIP(bare);
  if (family === IP_VERSION.V4) return BLOCKED_RANGES.check(bare, "ipv4");
  if (family !== IP_VERSION.V6) return true;
  // Listing ::ffff:0:0/96 as a blocked range instead would block every IPv4
  // address: BlockList matches IPv4 addresses against IPv4-mapped ranges.
  const mapped = mappedIpv4(bare);
  if (mapped) return BLOCKED_RANGES.check(mapped, "ipv4");
  return BLOCKED_RANGES.check(bare, "ipv6");
}
