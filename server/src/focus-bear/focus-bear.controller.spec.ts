import type { Request, Response } from "express";

import { FOCUS_BEAR_CONNECT_RESULTS } from "../constants/focus-bear.constants";
import { FocusBearController } from "./focus-bear.controller";
import { FocusBearService } from "./focus-bear.service";
import { FocusBearOAuthService } from "./focus-bear-oauth.service";

describe("FocusBearController OAuth callback", () => {
  const savedFrontendUrl = process.env.FRONTEND_URL;

  afterEach(() => {
    process.env.FRONTEND_URL = savedFrontendUrl;
  });

  it("returns the browser to the Focus Bear card in Settings with the outcome", async () => {
    process.env.FRONTEND_URL = "https://app.bearlymail.example/";
    const oauth = {
      completeConnect: jest
        .fn()
        .mockResolvedValue(FOCUS_BEAR_CONNECT_RESULTS.CANCELLED),
    };
    const controller = new FocusBearController(
      {} as FocusBearService,
      oauth as unknown as FocusBearOAuthService,
    );
    const res = { redirect: jest.fn() };

    await controller.oauthCallback(
      { error: "access_denied" },
      { headers: {} } as Request,
      res as unknown as Response,
    );

    expect(res.redirect).toHaveBeenCalledWith(
      "https://app.bearlymail.example/settings?focusBear=cancelled#focus-bear",
    );
  });
});
