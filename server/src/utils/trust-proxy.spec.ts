import { INestApplication } from "@nestjs/common";
import express from "express";
import request from "supertest";

import { DEFAULT_TRUST_PROXY_HOPS } from "../constants/auth-security.constants";
import { applyTrustProxy, resolveTrustProxyHops } from "./trust-proxy";

describe("resolveTrustProxyHops", () => {
  it("defaults to the production load balancer", () => {
    expect(resolveTrustProxyHops(undefined)).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(resolveTrustProxyHops("")).toBe(DEFAULT_TRUST_PROXY_HOPS);
  });

  it("accepts a non-negative integer and ignores anything else", () => {
    expect(resolveTrustProxyHops("0")).toBe(0);
    expect(resolveTrustProxyHops("2")).toBe(2);
    expect(resolveTrustProxyHops("true")).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(resolveTrustProxyHops("-1")).toBe(DEFAULT_TRUST_PROXY_HOPS);
  });
});

describe("applyTrustProxy", () => {
  const originalHops = process.env.TRUST_PROXY_HOPS;
  afterEach(() => {
    process.env.TRUST_PROXY_HOPS = originalHops;
  });

  function appWithIpEcho() {
    const server = express();
    applyTrustProxy({
      getHttpAdapter: () => ({ getInstance: () => server }),
    } as unknown as INestApplication);
    server.get("/ip", (req, res) => {
      res.json({ ip: req.ip });
    });
    return server;
  }

  it("uses the address the load balancer appended, not a client-supplied one", async () => {
    delete process.env.TRUST_PROXY_HOPS;
    const response = await request(appWithIpEcho())
      .get("/ip")
      .set("X-Forwarded-For", "6.6.6.6, 203.0.113.9");
    expect(response.body.ip).toBe("203.0.113.9");
  });
});
