import {
  IMAP_IMPLICIT_TLS_PORT,
  IMAP_STARTTLS_PORT,
  SMTP_IMPLICIT_TLS_PORT,
  SMTP_SUBMISSION_PORT,
} from "../constants/mail-server.constants";
import type { MailServerPreset } from "./imap-server-presets";
import { suggestMailServers } from "./imap-server-presets";
import type { SpecialMailboxes } from "./imap-session";
import {
  classifyMailConnectionError,
  describeMailConnectionError,
  MAIL_CONNECTION_ERROR_CODES,
  type MailConnectionFailure,
  type MailProtocol,
} from "./mail-connection-errors";

/**
 * Finds a mailbox's IMAP and SMTP servers from just the address and password,
 * the way desktop mail apps do, so non-technical users never see a port.
 */

export interface ServerEndpoint {
  host: string;
  port: number;
  secure: boolean;
}

/** Logs in to one endpoint; throws the library error on failure. */
export interface ConnectionProbe {
  imap(endpoint: ServerEndpoint): Promise<SpecialMailboxes>;
  smtp(endpoint: ServerEndpoint): Promise<void>;
}

export type DiscoveryResult =
  | { ok: true; servers: MailServerPreset; mailboxes: SpecialMailboxes }
  | { ok: false; failure: MailConnectionFailure };

type MxLookup = (
  domain: string,
) => Promise<Array<{ exchange: string; priority: number }>>;

/** Mail for these MX hosts lives at a provider we connect with "Sign in with…". */
const OAUTH_PROVIDER_MX: Array<{
  pattern: RegExp;
  code: MailConnectionFailure["code"];
}> = [
  {
    pattern: /(^|\.)(google|googlemail)\.com$/,
    code: MAIL_CONNECTION_ERROR_CODES.USE_GMAIL,
  },
  {
    pattern: /\.protection\.outlook\.com$/,
    code: MAIL_CONNECTION_ERROR_CODES.USE_OFFICE365,
  },
  {
    pattern: /(^|\.)zoho(mail)?\.[a-z.]+$/,
    code: MAIL_CONNECTION_ERROR_CODES.USE_ZOHO,
  },
];

const MAX_HOST_CANDIDATES = 5;
const CERTIFICATE_DNS_NAME = /DNS:([^,\s]+)/g;
const WILDCARD_PREFIX = "*.";

function unique(hosts: Array<string | undefined>): string[] {
  return [
    ...new Set(
      hosts
        .filter((host): host is string => !!host)
        .map((host) => host.toLowerCase()),
    ),
  ];
}

/** TLS errors carry the certificate names on the error or on its cause. */
function errorMessages(error: unknown): string {
  const outer = error instanceof Error ? error.message : String(error);
  const { cause } = (error ?? {}) as { cause?: unknown };
  return `${outer} ${cause instanceof Error ? cause.message : ""}`;
}

/**
 * Shared hosting (cPanel, Crazy Domains) serves mail.<domain> with the shared
 * server's certificate. The name we need is right there in the error.
 */
export function certificateHostFrom(error: unknown): string | null {
  for (const match of errorMessages(error).matchAll(CERTIFICATE_DNS_NAME)) {
    const name = match[1].replace(/\.$/, "");
    if (!name.startsWith(WILDCARD_PREFIX)) return name.toLowerCase();
  }
  return null;
}

async function mxHosts(domain: string, lookupMx: MxLookup): Promise<string[]> {
  try {
    const records = await lookupMx(domain);
    return records
      .sort((left, right) => left.priority - right.priority)
      .map((record) => record.exchange.replace(/\.$/, "").toLowerCase());
  } catch {
    return [];
  }
}

function oauthProviderFor(mx: string[]): MailConnectionFailure["code"] | null {
  for (const host of mx) {
    const provider = OAUTH_PROVIDER_MX.find((entry) =>
      entry.pattern.test(host),
    );
    if (provider) return provider.code;
  }
  return null;
}

const ATTEMPT = { OK: "ok", STOP: "stop", NEXT: "next" } as const;

type AttemptOutcome<T> =
  | { kind: typeof ATTEMPT.OK; endpoint: ServerEndpoint; value: T }
  | { kind: typeof ATTEMPT.STOP; failure: MailConnectionFailure }
  | { kind: typeof ATTEMPT.NEXT; failure: MailConnectionFailure };

/**
 * One login attempt, following a certificate that names a different host.
 * A rejected password stops discovery: the server was right, and trying the
 * password on more hosts would only risk the user being locked out.
 */
async function attempt<T>(
  protocol: MailProtocol,
  endpoint: ServerEndpoint,
  login: (endpoint: ServerEndpoint) => Promise<T>,
  canFollowCertificate = true,
): Promise<AttemptOutcome<T>> {
  try {
    return { kind: ATTEMPT.OK, endpoint, value: await login(endpoint) };
  } catch (error) {
    const failure = describeMailConnectionError(protocol, error);
    const code = classifyMailConnectionError(error);
    if (code === MAIL_CONNECTION_ERROR_CODES.AUTH_FAILED) {
      return { kind: ATTEMPT.STOP, failure };
    }
    const certificateHost = certificateHostFrom(error);
    // Followed once only, so a chain of mismatched certificates can't loop.
    if (
      canFollowCertificate &&
      code === MAIL_CONNECTION_ERROR_CODES.CERTIFICATE_MISMATCH &&
      certificateHost &&
      certificateHost !== endpoint.host
    ) {
      return attempt(
        protocol,
        { ...endpoint, host: certificateHost },
        login,
        false,
      );
    }
    return { kind: ATTEMPT.NEXT, failure };
  }
}

async function firstWorking<T>(
  protocol: MailProtocol,
  endpoints: ServerEndpoint[],
  login: (endpoint: ServerEndpoint) => Promise<T>,
): Promise<AttemptOutcome<T>> {
  let last: AttemptOutcome<T> = {
    kind: ATTEMPT.NEXT,
    failure: {
      protocol,
      code: MAIL_CONNECTION_ERROR_CODES.SERVER_NOT_FOUND,
      detail: "",
    },
  };
  for (const endpoint of endpoints) {
    const outcome = await attempt(protocol, endpoint, login);
    if (outcome.kind !== ATTEMPT.NEXT) return outcome;
    last = outcome;
  }
  return last;
}

function imapEndpoints(hosts: string[]): ServerEndpoint[] {
  return [
    ...hosts.map((host) => ({
      host,
      port: IMAP_IMPLICIT_TLS_PORT,
      secure: true,
    })),
    ...hosts.map((host) => ({ host, port: IMAP_STARTTLS_PORT, secure: false })),
  ];
}

function smtpEndpoints(hosts: string[]): ServerEndpoint[] {
  return hosts.flatMap((host) => [
    { host, port: SMTP_IMPLICIT_TLS_PORT, secure: true },
    { host, port: SMTP_SUBMISSION_PORT, secure: false },
  ]);
}

function notFound(failure: MailConnectionFailure): MailConnectionFailure {
  return { ...failure, code: MAIL_CONNECTION_ERROR_CODES.SERVER_NOT_FOUND };
}

export async function discoverMailServers(
  email: string,
  probe: ConnectionProbe,
  lookupMx: MxLookup,
): Promise<DiscoveryResult> {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  const mx = await mxHosts(domain, lookupMx);
  const oauthProvider = oauthProviderFor(mx);
  if (oauthProvider) {
    return {
      ok: false,
      failure: { protocol: "imap", code: oauthProvider, detail: mx[0] },
    };
  }

  const preset = suggestMailServers(email);
  const candidates = unique([
    preset?.imapHost,
    `mail.${domain}`,
    `imap.${domain}`,
    ...mx,
  ]).slice(0, MAX_HOST_CANDIDATES);
  const imap = await firstWorking(
    "imap",
    imapEndpoints(candidates),
    (endpoint) => probe.imap(endpoint),
  );
  if (imap.kind === ATTEMPT.STOP) return { ok: false, failure: imap.failure };
  if (imap.kind === ATTEMPT.NEXT)
    return { ok: false, failure: notFound(imap.failure) };

  const smtpHosts = unique([
    preset?.smtpHost,
    imap.endpoint.host,
    `smtp.${domain}`,
    `mail.${domain}`,
  ]);
  const smtp = await firstWorking(
    "smtp",
    smtpEndpoints(smtpHosts),
    (endpoint) => probe.smtp(endpoint),
  );
  if (smtp.kind === ATTEMPT.STOP) return { ok: false, failure: smtp.failure };
  if (smtp.kind === ATTEMPT.NEXT)
    return { ok: false, failure: notFound(smtp.failure) };

  return {
    ok: true,
    mailboxes: imap.value,
    servers: {
      imapHost: imap.endpoint.host,
      imapPort: imap.endpoint.port,
      imapSecure: imap.endpoint.secure,
      smtpHost: smtp.endpoint.host,
      smtpPort: smtp.endpoint.port,
      smtpSecure: smtp.endpoint.secure,
    },
  };
}
