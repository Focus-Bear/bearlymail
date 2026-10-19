import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { TRANSPARENT_GIF_BASE64 } from "../constants/email-tracking.constants";
import { EmailOpenRecorderService } from "./email-open-recorder.service";
import { TrackingPixelController } from "./tracking-pixel.controller";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const GIF = Buffer.from(TRANSPARENT_GIF_BASE64, "base64");

describe("TrackingPixelController", () => {
  let app: INestApplication;
  const openRecorder = { recordOpen: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TrackingPixelController],
      providers: [
        { provide: EmailOpenRecorderService, useValue: openRecorder },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    openRecorder.recordOpen.mockResolvedValue(true);
  });

  const expectTransparentGif = (response: request.Response) => {
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/gif");
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(Buffer.from(response.body as Buffer)).toEqual(GIF);
  };

  it("serves the gif and records the open with the caller's details", async () => {
    const response = await request(app.getHttpServer())
      .get(`/t/o/${TOKEN}.gif`)
      .set("User-Agent", "Outlook/16.0")
      .set("X-Forwarded-For", "198.51.100.1, 203.0.113.9");

    expectTransparentGif(response);
    expect(openRecorder.recordOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        token: TOKEN,
        userAgent: "Outlook/16.0",
        // The load balancer's own entry, not the client-supplied first one.
        ipAddress: "203.0.113.9",
        openedAt: expect.any(Date),
      }),
    );
  });

  it("still serves the gif for an unknown token (never leaks existence)", async () => {
    openRecorder.recordOpen.mockResolvedValue(false);

    const response = await request(app.getHttpServer()).get(
      `/t/o/zzzzzzzzzzzzzzzzzzzzzz.gif`,
    );

    expectTransparentGif(response);
  });

  it("serves the gif without recording for a malformed token", async () => {
    const response = await request(app.getHttpServer()).get("/t/o/oops.gif");

    expectTransparentGif(response);
    expect(openRecorder.recordOpen).not.toHaveBeenCalled();
  });
});
