import { ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { userChannel } from "../constants/pusher-events";
import { PusherController } from "./pusher.controller";
import { PusherService } from "./pusher.service";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const SOCKET_ID = "123.456";

describe("PusherController", () => {
  let controller: PusherController;
  let authorizeUserChannel: jest.Mock;

  beforeEach(async () => {
    authorizeUserChannel = jest.fn().mockReturnValue({ auth: "key:signature" });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PusherController],
      providers: [
        { provide: PusherService, useValue: { authorizeUserChannel } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PusherController>(PusherController);
  });

  it("passes the authenticated user's id, not anything from the body", () => {
    const channel = userChannel(USER_ID);

    const result = controller.authorizeChannel(
      { user: { userId: USER_ID } },
      { socket_id: SOCKET_ID, channel_name: channel },
    );

    expect(authorizeUserChannel).toHaveBeenCalledWith(
      USER_ID,
      SOCKET_ID,
      channel,
    );
    expect(result).toEqual({ auth: "key:signature" });
  });

  it("surfaces the service's rejection of another user's channel", () => {
    authorizeUserChannel.mockImplementation(() => {
      throw new ForbiddenException();
    });

    expect(() =>
      controller.authorizeChannel(
        { user: { userId: USER_ID } },
        { socket_id: SOCKET_ID, channel_name: userChannel(OTHER_USER_ID) },
      ),
    ).toThrow(ForbiddenException);
  });
});
