import { INestApplication, Logger, ValidationPipe } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";

import { CSP_REPORT_RATE_LIMIT } from "../constants/csp-report.constants";
import { CspReportModule } from "./csp-report.module";

const LEGACY_REPORT = {
  "csp-report": {
    "document-uri": "https://app.example.com/email/abc",
    "effective-directive": "img-src",
    "blocked-uri": "https://images.example.net/a.png?u=1",
    disposition: "report",
  },
};

describe("CspReportController", () => {
  let app: INestApplication;
  let warn: jest.SpyInstance;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        CspReportModule,
        ThrottlerModule.forRoot([
          { name: "default", ttl: 60_000, limit: 1000 },
        ]),
      ],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    // Mirror main.ts: raw body buffering and the strict global ValidationPipe.
    app = module.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    warn.mockRestore();
    await app.close();
  });

  it("accepts a legacy application/csp-report body and logs a compact summary", async () => {
    const response = await request(app.getHttpServer())
      .post("/csp-report")
      .set("Content-Type", "application/csp-report")
      .send(JSON.stringify(LEGACY_REPORT));

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe(
      "CSP violation (report): img-src blocked https://images.example.net on https://app.example.com (source unknown)",
    );
  });

  it("accepts a Reporting API application/reports+json batch", async () => {
    const response = await request(app.getHttpServer())
      .post("/csp-report")
      .set("Content-Type", "application/reports+json")
      .send(
        JSON.stringify([
          {
            type: "csp-violation",
            body: {
              effectiveDirective: "connect-src",
              blockedURL: "https://x.example.org/collect",
              documentURL: "https://app.example.com/inbox",
              disposition: "enforce",
            },
          },
        ]),
      );

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("connect-src blocked https://x.example.org"),
    );
  });

  it("ignores bodies of other content types without logging", async () => {
    const response = await request(app.getHttpServer())
      .post("/csp-report")
      .set("Content-Type", "application/json")
      .send(LEGACY_REPORT);

    expect(response.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies with 413 before parsing", async () => {
    const response = await request(app.getHttpServer())
      .post("/csp-report")
      .set("Content-Type", "application/csp-report")
      .send(JSON.stringify({ "csp-report": { pad: "x".repeat(20_000) } }));

    expect(response.status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });

  it("answers malformed JSON with 400", async () => {
    const response = await request(app.getHttpServer())
      .post("/csp-report")
      .set("Content-Type", "application/csp-report")
      .send("{not json");

    expect(response.status).toBe(400);
  });

  it("throttles bursts of reports", async () => {
    const server = app.getHttpServer();
    const send = () =>
      request(server)
        .post("/csp-report")
        .set("Content-Type", "application/csp-report")
        .send(JSON.stringify(LEGACY_REPORT));

    for (let i = 0; i < CSP_REPORT_RATE_LIMIT; i++) {
      expect((await send()).status).toBe(204);
    }
    expect((await send()).status).toBe(429);
  });
});
