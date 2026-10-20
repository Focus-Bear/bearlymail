import {
  AUTO_ARCHIVE_PROPOSAL_CONFIG,
  AUTO_ARCHIVE_SENDER_SCOPE,
  AutoArchiveSenderScope,
  AUTOMATED_LOCAL_PART_TOKENS,
  DOMAIN_SENDER_KEY_PREFIX,
} from "../constants/auto-archive-proposal.constants";
import { extractEmailAddress } from "../utils/email-address.utils";
import { computeEmailHmac } from "../utils/hmac-email";

/** One sender address's volume in the window (from SQL, no decryption). */
export interface SenderVolume {
  senderKey: string;
  total: number;
  /** Emails received since the user's previous scan. */
  newSinceScan: number;
}

/** A decrypted representative `from` for one sender address. */
export interface SenderIdentity {
  senderKey: string;
  address: string;
  displayName: string | null;
}

/** A heavy sender ready for analysis. */
export interface SenderGroupPlan {
  senderKey: string;
  scope: AutoArchiveSenderScope;
  senderPattern: string;
  senderDisplay: string;
  memberSenderKeys: string[];
  total: number;
  newSinceScan: number;
}

const LOCAL_PART_SEPARATORS = /[._+-]/;
/** Shorter tokens ("bot", "news") must match a whole local-part segment. */
const MIN_SUBSTRING_TOKEN_CHARS = 5;
const AT = "@";
const DOMAIN_WILDCARD = "*@";

function splitAddress(address: string): { local: string; host: string } {
  const at = address.lastIndexOf(AT);
  return at < 0
    ? { local: address, host: "" }
    : { local: address.slice(0, at), host: address.slice(at + 1) };
}

/** True when an address's local part looks like an automated notifier. */
export function isAutomatedAddress(address: string): boolean {
  const { local } = splitAddress(address.toLowerCase());
  const segments = local.split(LOCAL_PART_SEPARATORS);
  return AUTOMATED_LOCAL_PART_TOKENS.some((token) =>
    token.length >= MIN_SUBSTRING_TOKEN_CHARS
      ? local.includes(token)
      : segments.includes(token),
  );
}

function displayFor(identity: SenderIdentity): string {
  return identity.displayName
    ? `${identity.displayName} <${identity.address}>`
    : identity.address;
}

/** The sender key of a domain group; disjoint from address HMACs. */
export function domainSenderKey(host: string): string {
  return computeEmailHmac(`${DOMAIN_SENDER_KEY_PREFIX}${host}`);
}

function addressGroups(
  volumes: SenderVolume[],
  identities: Map<string, SenderIdentity>,
): SenderGroupPlan[] {
  return volumes
    .filter(
      (volume) =>
        volume.total >= AUTO_ARCHIVE_PROPOSAL_CONFIG.MIN_SENDER_VOLUME &&
        identities.has(volume.senderKey),
    )
    .map((volume) => {
      const identity = identities.get(volume.senderKey) as SenderIdentity;
      return {
        senderKey: volume.senderKey,
        scope: AUTO_ARCHIVE_SENDER_SCOPE.ADDRESS,
        senderPattern: identity.address,
        senderDisplay: displayFor(identity),
        memberSenderKeys: [volume.senderKey],
        total: volume.total,
        newSinceScan: volume.newSinceScan,
      };
    });
}

function groupAutomatedByHost(
  volumes: SenderVolume[],
  identities: Map<string, SenderIdentity>,
): Map<string, SenderVolume[]> {
  const byHost = new Map<string, SenderVolume[]>();
  for (const volume of volumes) {
    const identity = identities.get(volume.senderKey);
    if (!identity || !isAutomatedAddress(identity.address)) continue;
    const { host } = splitAddress(identity.address);
    if (!host) continue;
    byHost.set(host, [...(byHost.get(host) ?? []), volume]);
  }
  return byHost;
}

/**
 * Domain groups: several automated addresses at one host (e.g. alerts@ and
 * noreply@ the same service) that are only heavy together. Never formed for
 * people, for hosts with many addresses, or when every member is already heavy
 * on its own (its address group covers it).
 */
function domainGroups(
  volumes: SenderVolume[],
  identities: Map<string, SenderIdentity>,
): SenderGroupPlan[] {
  const config = AUTO_ARCHIVE_PROPOSAL_CONFIG;
  const plans: SenderGroupPlan[] = [];
  for (const [host, members] of groupAutomatedByHost(volumes, identities)) {
    const total = members.reduce((sum, member) => sum + member.total, 0);
    const hasLightMember = members.some(
      (member) => member.total < config.MIN_SENDER_VOLUME,
    );
    const isGroupable =
      members.length >= 2 &&
      members.length <= config.MAX_DOMAIN_GROUP_ADDRESSES &&
      total >= config.MIN_SENDER_VOLUME &&
      hasLightMember;
    if (!isGroupable) continue;
    plans.push({
      senderKey: domainSenderKey(host),
      scope: AUTO_ARCHIVE_SENDER_SCOPE.DOMAIN,
      senderPattern: `${DOMAIN_WILDCARD}${host}`,
      senderDisplay: host,
      memberSenderKeys: members.map((member) => member.senderKey).sort(),
      total,
      newSinceScan: members.reduce(
        (sum, member) => sum + member.newSinceScan,
        0,
      ),
    });
  }
  return plans;
}

/** Turns per-address volumes into the heavy sender groups worth analysing. */
export function planSenderGroups(
  volumes: SenderVolume[],
  identities: SenderIdentity[],
): SenderGroupPlan[] {
  const byKey = new Map(
    identities.map((identity) => [identity.senderKey, identity]),
  );
  return [...addressGroups(volumes, byKey), ...domainGroups(volumes, byKey)];
}

/** Builds a sender identity from a stored `from` + `fromName`. */
export function toSenderIdentity(
  senderKey: string,
  from: string | null,
  fromName: string | null,
): SenderIdentity | null {
  const address = extractEmailAddress(from);
  if (!address.includes(AT)) return null;
  return { senderKey, address, displayName: fromName?.trim() || null };
}
