import {
  certificateHostFrom,
  type ConnectionProbe,
  discoverMailServers,
  type ServerEndpoint,
} from "./imap-server-discovery";
import { MAIL_CONNECTION_ERROR_CODES } from "./mail-connection-errors";

const MAILBOXES = { archive: "INBOX.Archive", sent: "INBOX.Sent", trash: null };

function certificateError(host: string, altnames: string) {
  return Object.assign(
    new Error(
      `Hostname/IP does not match certificate's altnames: Host: ${host}. is not in the cert's altnames: ${altnames}`,
    ),
    { code: "ESOCKET" },
  );
}
const refused = () =>
  Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
const wrongPassword = () =>
  Object.assign(new Error("Command failed"), { authenticationFailed: true });

/** A fake network: each "host:port" either logs in or throws the given error. */
function fakeProbe(
  imap: Record<string, Error | "ok">,
  smtp: Record<string, Error | "ok">,
): ConnectionProbe & { tried: string[] } {
  const tried: string[] = [];
  const answer = (
    table: Record<string, Error | "ok">,
    endpoint: ServerEndpoint,
  ) => {
    const key = `${endpoint.host}:${endpoint.port}`;
    tried.push(key);
    const result = table[key] ?? refused();
    if (result !== "ok") throw result;
  };
  return {
    tried,
    imap: async (endpoint) => {
      answer(imap, endpoint);
      return MAILBOXES;
    },
    smtp: async (endpoint) => answer(smtp, endpoint),
  };
}

const noMx = async () => [];

describe("discoverMailServers", () => {
  it("finds a standard hosted mailbox at mail.<domain> over SSL", async () => {
    const probe = fakeProbe(
      { "mail.mybusiness.com.au:993": "ok" },
      { "mail.mybusiness.com.au:465": "ok" },
    );
    await expect(
      discoverMailServers("hello@mybusiness.com.au", probe, noMx),
    ).resolves.toEqual({
      ok: true,
      mailboxes: MAILBOXES,
      servers: {
        imapHost: "mail.mybusiness.com.au",
        imapPort: 993,
        imapSecure: true,
        smtpHost: "mail.mybusiness.com.au",
        smtpPort: 465,
        smtpSecure: true,
      },
    });
  });

  it("follows the shared-hosting certificate to the server's real name (Crazy Domains)", async () => {
    const probe = fakeProbe(
      {
        "mail.mybusiness.com.au:993": certificateError(
          "mail.mybusiness.com.au",
          "DNS:*.crazydomains.com, DNS:s123.crazydomains.com",
        ),
        "s123.crazydomains.com:993": "ok",
      },
      {
        "s123.crazydomains.com:465": certificateError(
          "s123.crazydomains.com",
          "DNS:s124.crazydomains.com",
        ),
        "s124.crazydomains.com:465": "ok",
      },
    );
    const result = await discoverMailServers(
      "hello@mybusiness.com.au",
      probe,
      noMx,
    );
    expect(result).toMatchObject({
      ok: true,
      servers: {
        imapHost: "s123.crazydomains.com",
        smtpHost: "s124.crazydomains.com",
      },
    });
  });

  it("stops at the first wrong password instead of trying it on more servers", async () => {
    const probe = fakeProbe(
      { "mail.mybusiness.com.au:993": wrongPassword() },
      {},
    );
    const result = await discoverMailServers(
      "hello@mybusiness.com.au",
      probe,
      noMx,
    );
    expect(result).toMatchObject({
      ok: false,
      failure: {
        protocol: "imap",
        code: MAIL_CONNECTION_ERROR_CODES.AUTH_FAILED,
      },
    });
    expect(probe.tried).toEqual(["mail.mybusiness.com.au:993"]);
  });

  it("falls back to imap.<domain>, the MX host and STARTTLS before giving up", async () => {
    const probe = fakeProbe(
      { "imap.mybusiness.com.au:143": "ok" },
      { "imap.mybusiness.com.au:587": "ok" },
    );
    const result = await discoverMailServers(
      "hello@mybusiness.com.au",
      probe,
      async () => [{ exchange: "mx1.hostingco.net", priority: 10 }],
    );
    expect(result).toMatchObject({
      ok: true,
      servers: {
        imapHost: "imap.mybusiness.com.au",
        imapPort: 143,
        imapSecure: false,
        smtpPort: 587,
      },
    });
    expect(probe.tried.slice(0, 3)).toEqual([
      "mail.mybusiness.com.au:993",
      "imap.mybusiness.com.au:993",
      "mx1.hostingco.net:993",
    ]);
  });

  it.each([
    ["aspmx.l.google.com.", MAIL_CONNECTION_ERROR_CODES.USE_GMAIL],
    [
      "mybusiness-com-au.mail.protection.outlook.com",
      MAIL_CONNECTION_ERROR_CODES.USE_OFFICE365,
    ],
    ["mx.zoho.com.au", MAIL_CONNECTION_ERROR_CODES.USE_ZOHO],
  ])(
    "sends %s mail to the matching Sign in with… option",
    async (exchange, code) => {
      const probe = fakeProbe({}, {});
      const result = await discoverMailServers(
        "hello@mybusiness.com.au",
        probe,
        async () => [{ exchange, priority: 1 }],
      );
      expect(result).toMatchObject({ ok: false, failure: { code } });
      expect(probe.tried).toEqual([]);
    },
  );

  it("says the server wasn't found when nothing answers", async () => {
    const result = await discoverMailServers(
      "hello@nowhere.test",
      fakeProbe({}, {}),
      noMx,
    );
    expect(result).toMatchObject({
      ok: false,
      failure: { code: MAIL_CONNECTION_ERROR_CODES.SERVER_NOT_FOUND },
    });
  });

  it("still tries the usual servers when the MX lookup fails", async () => {
    const probe = fakeProbe(
      { "mail.mybusiness.com.au:993": "ok" },
      { "mail.mybusiness.com.au:465": "ok" },
    );
    const result = await discoverMailServers(
      "hello@mybusiness.com.au",
      probe,
      async () => {
        throw new Error("ENODATA");
      },
    );
    expect(result.ok).toBe(true);
  });
});

describe("certificateHostFrom", () => {
  it("returns the first concrete name, skipping wildcards", () => {
    expect(
      certificateHostFrom(
        certificateError(
          "mail.x.com",
          "DNS:*.crazydomains.com, DNS:s123.crazydomains.com",
        ),
      ),
    ).toBe("s123.crazydomains.com");
  });

  it("returns null when the certificate only has wildcards", () => {
    expect(
      certificateHostFrom(certificateError("mail.x.com", "DNS:*.host.com")),
    ).toBeNull();
  });
});
