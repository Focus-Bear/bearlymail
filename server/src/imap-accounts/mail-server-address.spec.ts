import { lookup } from "dns/promises";

import {
  ALLOWED_IMAP_PORTS,
  MailServerAddressError,
  resolveMailServer,
} from "./mail-server-address";

jest.mock("dns/promises", () => ({ lookup: jest.fn() }));

const mockLookup = lookup as unknown as jest.Mock;
const HOSTED = { allowedPorts: ALLOWED_IMAP_PORTS, allowPrivate: false };
const SELF_HOSTED = { allowedPorts: ALLOWED_IMAP_PORTS, allowPrivate: true };

describe("resolveMailServer", () => {
  afterEach(() => mockLookup.mockReset());

  it("returns the vetted address and keeps the hostname for TLS", async () => {
    mockLookup.mockResolvedValue([{ address: "203.0.113.10", family: 4 }]);
    await expect(
      resolveMailServer(" Mail.Crazy.Test ", 993, HOSTED),
    ).resolves.toEqual({
      hostname: "mail.crazy.test",
      address: "203.0.113.10",
      port: 993,
    });
  });

  it("prefers IPv4 because cloud VPCs are often IPv4-only", async () => {
    mockLookup.mockResolvedValue([
      { address: "2001:db8::10", family: 6 },
      { address: "203.0.113.10", family: 4 },
    ]);
    const server = await resolveMailServer("mail.crazy.test", 993, HOSTED);
    expect(server.address).toBe("203.0.113.10");
  });

  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.4.4",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:10.0.0.5",
  ])("refuses internal address %s on a hosted deployment", async (address) => {
    mockLookup.mockResolvedValue([{ address }]);
    await expect(
      resolveMailServer("evil.test", 993, HOSTED),
    ).rejects.toBeInstanceOf(MailServerAddressError);
  });

  it("refuses a host when any of its records is internal", async () => {
    mockLookup.mockResolvedValue([
      { address: "203.0.113.10" },
      { address: "10.0.0.5" },
    ]);
    await expect(resolveMailServer("mixed.test", 993, HOSTED)).rejects.toThrow(
      "private address",
    );
  });

  it("refuses non-mail ports on a hosted deployment", async () => {
    mockLookup.mockResolvedValue([{ address: "203.0.113.10" }]);
    await expect(
      resolveMailServer("mail.crazy.test", 6379, HOSTED),
    ).rejects.toThrow("not a supported mail port");
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("allows localhost bridges on any port when self-hosted", async () => {
    mockLookup.mockResolvedValue([{ address: "127.0.0.1" }]);
    await expect(
      resolveMailServer("127.0.0.1", 1143, SELF_HOSTED),
    ).resolves.toMatchObject({ address: "127.0.0.1", port: 1143 });
  });

  it("explains unknown hosts", async () => {
    mockLookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(
      resolveMailServer("nope.invalid", 993, HOSTED),
    ).rejects.toThrow('Could not find mail server "nope.invalid"');
  });
});
