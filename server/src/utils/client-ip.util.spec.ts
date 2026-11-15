import { resolveClientIp } from "./client-ip.util";

const BALANCER_ADDRESS = "10.0.3.17";
const CLIENT_ADDRESS = "203.0.113.9";
const FORGED_ADDRESS = "198.51.100.1";

describe("resolveClientIp", () => {
  it("uses the last X-Forwarded-For entry, which the load balancer wrote", () => {
    expect(
      resolveClientIp({
        headers: { "x-forwarded-for": `${FORGED_ADDRESS}, ${CLIENT_ADDRESS}` },
        ip: BALANCER_ADDRESS,
      }),
    ).toBe(CLIENT_ADDRESS);
  });

  it("handles a repeated header", () => {
    expect(
      resolveClientIp({
        headers: { "x-forwarded-for": [FORGED_ADDRESS, CLIENT_ADDRESS] },
        ip: BALANCER_ADDRESS,
      }),
    ).toBe(CLIENT_ADDRESS);
  });

  it("falls back to the socket address when nothing was forwarded", () => {
    expect(resolveClientIp({ headers: {}, ip: CLIENT_ADDRESS })).toBe(
      CLIENT_ADDRESS,
    );
  });

  it("returns null when no address is known", () => {
    expect(resolveClientIp({})).toBeNull();
  });
});
