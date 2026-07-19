import { NextFunction, Request, Response } from "express";

import { securityHeadersMiddleware } from "./security-headers.middleware";

describe("securityHeadersMiddleware", () => {
  let mockRes: { setHeader: jest.Mock; removeHeader: jest.Mock };
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockRes = {
      setHeader: jest.fn(),
      removeHeader: jest.fn(),
    };
    mockNext = jest.fn();
  });

  const callMiddleware = () =>
    securityHeadersMiddleware(
      {} as Request,
      mockRes as unknown as Response,
      mockNext as unknown as NextFunction,
    );

  it("sets X-Frame-Options to DENY", () => {
    callMiddleware();
    expect(mockRes.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
  });

  it("sets X-Content-Type-Options to nosniff", () => {
    callMiddleware();
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      "X-Content-Type-Options",
      "nosniff",
    );
  });

  it("sets X-XSS-Protection", () => {
    callMiddleware();
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      "X-XSS-Protection",
      "1; mode=block",
    );
  });

  it("sets Referrer-Policy to strict-origin-when-cross-origin", () => {
    callMiddleware();
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      "Referrer-Policy",
      "strict-origin-when-cross-origin",
    );
  });

  it("sets Strict-Transport-Security with long max-age and preload", () => {
    callMiddleware();
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  });

  it("sets Content-Security-Policy with script-src 'self' to restrict script sources", () => {
    callMiddleware();
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      "Content-Security-Policy",
      "frame-ancestors 'none'; script-src 'self'; object-src 'none'; base-uri 'self'",
    );
  });

  it("removes X-Powered-By header to prevent technology disclosure", () => {
    callMiddleware();
    expect(mockRes.removeHeader).toHaveBeenCalledWith("X-Powered-By");
  });

  it("calls next() to continue the middleware chain", () => {
    callMiddleware();
    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});
