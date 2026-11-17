import { isBlockedAddress } from "./blocked-address";

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::a9fe:a9fe",
    "::ffff:10.0.0.5",
    "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe",
    "::FFFF:7F00:1",
    "0:0:0:0:0:ffff:7f00:1",
    "64:ff9b::a9fe:a9fe",
    "64:ff9b::8.8.8.8",
    "64:ff9b:1::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%en0",
    "ff02::1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "100.63.255.255",
    "100.128.0.0",
    "172.15.0.1",
    "172.32.0.1",
    "192.0.2.1",
    "::ffff:8.8.8.8",
    "::ffff:808:808",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])("allows public address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});
