import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { userChannel } from "../constants/pusher-events";
import { PusherService } from "./pusher.service";

const PUSHER_CONFIG: Record<string, string> = {
  PUSHER_APP_ID: "app-id",
  PUSHER_KEY: "key",
  PUSHER_SECRET: "secret",
  PUSHER_CLUSTER: "ap4",
};

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const SOCKET_ID = "123.456";

async function buildService(
  config: Record<string, string>,
): Promise<PusherService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PusherService,
      {
        provide: ConfigService,
        useValue: { get: (key: string) => config[key] },
      },
    ],
  }).compile();
  return module.get<PusherService>(PusherService);
}

describe("PusherService.authorizeUserChannel", () => {
  it("signs a subscription to the caller's own channel", async () => {
    const service = await buildService(PUSHER_CONFIG);

    const result = service.authorizeUserChannel(
      USER_ID,
      SOCKET_ID,
      userChannel(USER_ID),
    );

    expect(result.auth).toEqual(expect.any(String));
    expect(result.auth).toContain(`${PUSHER_CONFIG.PUSHER_KEY}:`);
  });

  it("rejects a request for another user's channel", async () => {
    const service = await buildService(PUSHER_CONFIG);

    expect(() =>
      service.authorizeUserChannel(
        USER_ID,
        SOCKET_ID,
        userChannel(OTHER_USER_ID),
      ),
    ).toThrow(ForbiddenException);
  });

  it("rejects a channel that merely embeds the caller's id", async () => {
    const service = await buildService(PUSHER_CONFIG);

    expect(() =>
      service.authorizeUserChannel(
        USER_ID,
        SOCKET_ID,
        `presence-user-${USER_ID}`,
      ),
    ).toThrow(ForbiddenException);
  });

  it("fails closed when Pusher is not configured", async () => {
    const service = await buildService({});

    expect(() =>
      service.authorizeUserChannel(USER_ID, SOCKET_ID, userChannel(USER_ID)),
    ).toThrow(ServiceUnavailableException);
  });

  it("rejects a foreign channel even when Pusher is not configured", async () => {
    const service = await buildService({});

    expect(() =>
      service.authorizeUserChannel(
        USER_ID,
        SOCKET_ID,
        userChannel(OTHER_USER_ID),
      ),
    ).toThrow(ForbiddenException);
  });
});
