import { INestApplication, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";
import { FeedbackRateLimitInterceptor } from "./feedback-rate-limit.interceptor";
import { FeedbackScreenshotsService } from "./feedback-screenshots.service";

const mockFeedbackService = {
  createFeedback: jest.fn(),
  listFeedback: jest.fn(),
  deleteFeedback: jest.fn(),
};

const mockScreenshotsService = {
  createPresignedPutUrl: jest.fn(),
  deleteScreenshot: jest.fn(),
};

async function buildApp(opts: { isAdmin: boolean }): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [FeedbackController],
    providers: [
      { provide: FeedbackService, useValue: mockFeedbackService },
      { provide: FeedbackScreenshotsService, useValue: mockScreenshotsService },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: jest.fn((ctx) => {
        const req = ctx.switchToHttp().getRequest();
        req.user = { userId: "test-user-id" };
        return true;
      }),
    })
    .overrideGuard(AdminGuard)
    .useValue({ canActivate: jest.fn().mockReturnValue(opts.isAdmin) })
    .compile();

  const nestApp = module.createNestApplication();
  await nestApp.init();
  return nestApp;
}

describe("FeedbackController (integration)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp({ isAdmin: true });
  });

  afterEach(async () => {
    await app.close();
  });

  describe("guard wiring", () => {
    it("should return 403 when JwtAuthGuard rejects on POST /feedback", async () => {
      const jwtBlockedModule: TestingModule = await Test.createTestingModule({
        controllers: [FeedbackController],
        providers: [
          { provide: FeedbackService, useValue: mockFeedbackService },
          {
            provide: FeedbackScreenshotsService,
            useValue: mockScreenshotsService,
          },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: jest.fn().mockReturnValue(false) })
        .overrideGuard(AdminGuard)
        .useValue({ canActivate: jest.fn().mockReturnValue(false) })
        .compile();

      const blockedApp = jwtBlockedModule.createNestApplication();
      await blockedApp.init();

      await request(blockedApp.getHttpServer())
        .post("/feedback")
        .send({ message: "test" })
        .expect(403);

      await blockedApp.close();
    });

    it("should return 403 when AdminGuard rejects on GET /feedback/admin", async () => {
      const nonAdminApp = await buildApp({ isAdmin: false });

      await request(nonAdminApp.getHttpServer())
        .get("/feedback/admin")
        .expect(403);

      await nonAdminApp.close();
    });

    it("should return 403 when AdminGuard rejects on DELETE /feedback/admin/:id", async () => {
      const nonAdminApp = await buildApp({ isAdmin: false });

      await request(nonAdminApp.getHttpServer())
        .delete("/feedback/admin/some-id")
        .expect(403);

      await nonAdminApp.close();
    });
  });

  describe("rate limit interceptor", () => {
    it("should have FeedbackRateLimitInterceptor applied to POST /feedback", () => {
      const controller = app.get(FeedbackController);
      const interceptors = Reflect.getMetadata(
        "__interceptors__",
        controller.submit,
      ) as unknown[];
      const hasRateLimiter =
        Array.isArray(interceptors) &&
        interceptors.some(
          (interceptor) =>
            interceptor === FeedbackRateLimitInterceptor ||
            (typeof interceptor === "function" &&
              interceptor.name === "FeedbackRateLimitInterceptor"),
        );
      expect(hasRateLimiter).toBe(true);
    });

    it("should have FeedbackRateLimitInterceptor applied to POST /feedback/screenshot", () => {
      const controller = app.get(FeedbackController);
      const interceptors = Reflect.getMetadata(
        "__interceptors__",
        controller.createScreenshotUpload,
      ) as unknown[];
      const hasRateLimiter =
        Array.isArray(interceptors) &&
        interceptors.some(
          (interceptor) =>
            interceptor === FeedbackRateLimitInterceptor ||
            (typeof interceptor === "function" &&
              interceptor.name === "FeedbackRateLimitInterceptor"),
        );
      expect(hasRateLimiter).toBe(true);
    });
  });

  describe("POST /feedback", () => {
    it("should call createFeedback with userId from JWT and return result", async () => {
      const savedFeedback = { id: "fb-1", message: "Nice!" };
      mockFeedbackService.createFeedback.mockResolvedValueOnce(savedFeedback);

      const res = await request(app.getHttpServer())
        .post("/feedback")
        .set("user-agent", "TestAgent/1.0")
        .set("x-app-version", "2.0.0")
        .send({ message: "Nice!" })
        .expect(201);

      expect(mockFeedbackService.createFeedback).toHaveBeenCalledWith(
        "test-user-id",
        expect.objectContaining({ message: "Nice!" }),
        "TestAgent/1.0",
        "2.0.0",
      );
      expect(res.body).toMatchObject({ id: "fb-1" });
    });
  });

  describe("POST /feedback/screenshot", () => {
    it("should call createPresignedPutUrl and return key + url", async () => {
      const presignResult = {
        key: "feedback/uuid-1.png",
        url: "https://s3.example.com/presigned",
        maxBytes: 5242880,
      };
      mockScreenshotsService.createPresignedPutUrl.mockResolvedValueOnce(
        presignResult,
      );

      const res = await request(app.getHttpServer())
        .post("/feedback/screenshot")
        .send({ filename: "capture.png", contentType: "image/png" })
        .expect(201);

      expect(mockScreenshotsService.createPresignedPutUrl).toHaveBeenCalledWith(
        "capture.png",
        "image/png",
      );
      expect(res.body).toMatchObject({ key: "feedback/uuid-1.png" });
    });

    it("should pass undefined when body fields are omitted", async () => {
      mockScreenshotsService.createPresignedPutUrl.mockResolvedValueOnce({
        key: "feedback/uuid-2.png",
        url: "https://s3.example.com/presigned2",
        maxBytes: 5242880,
      });

      await request(app.getHttpServer())
        .post("/feedback/screenshot")
        .send({})
        .expect(201);

      expect(mockScreenshotsService.createPresignedPutUrl).toHaveBeenCalledWith(
        undefined,
        undefined,
      );
    });
  });

  describe("GET /feedback/admin", () => {
    it("should return paginated feedback list when admin guard passes", async () => {
      const listResult = { items: [{ id: "fb-5", message: "Hi" }], total: 1 };
      mockFeedbackService.listFeedback.mockResolvedValueOnce(listResult);

      const res = await request(app.getHttpServer())
        .get("/feedback/admin?page=0&limit=10")
        .expect(200);

      expect(mockFeedbackService.listFeedback).toHaveBeenCalledWith(0, 10);
      expect(res.body).toMatchObject({ total: 1 });
    });

    it("should default to page=0 and limit=50 when query params are omitted", async () => {
      mockFeedbackService.listFeedback.mockResolvedValueOnce({
        items: [],
        total: 0,
      });

      await request(app.getHttpServer()).get("/feedback/admin").expect(200);

      expect(mockFeedbackService.listFeedback).toHaveBeenCalledWith(0, 50);
    });
  });

  describe("DELETE /feedback/admin/:id", () => {
    it("should delete feedback and return success:true", async () => {
      mockFeedbackService.deleteFeedback.mockResolvedValueOnce(undefined);

      const res = await request(app.getHttpServer())
        .delete("/feedback/admin/fb-99")
        .expect(200);

      expect(mockFeedbackService.deleteFeedback).toHaveBeenCalledWith("fb-99");
      expect(res.body).toEqual({ success: true });
    });

    it("should return 404 when service throws NotFoundException", async () => {
      mockFeedbackService.deleteFeedback.mockRejectedValueOnce(
        new NotFoundException("Feedback fb-00 not found"),
      );

      await request(app.getHttpServer())
        .delete("/feedback/admin/fb-00")
        .expect(404);
    });
  });
});
