import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from "@nestjs/common";

import { GooglePermissionRequiredException } from "../auth/exceptions/google-permission-required.exception";
import {
  GMAIL_WRITE_ACTION,
  GOOGLE_PERMISSION_GROUP,
} from "../constants/google-oauth-scopes";
import { AI_VOLUME_LIMIT_REACHED_CODE } from "../subscriptions/ai-capacity.guard";
import { AllExceptionsFilter } from "./http-exception.filter";

jest.mock("../utils/error-logger", () => ({ logErrorToFile: jest.fn() }));

function responseBodyFor(exception: unknown): Record<string, unknown> {
  const json = jest.fn();
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status: () => ({ json }) }),
      getRequest: () => ({ url: "/test", method: "PUT", headers: {} }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return json.mock.calls[0][0];
}

describe("AllExceptionsFilter", () => {
  it("keeps what the client needs to open the Google permission prompt", () => {
    const body = responseBodyFor(
      new GooglePermissionRequiredException(
        GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE,
        GMAIL_WRITE_ACTION.ARCHIVE,
      ),
    );

    expect(body).toMatchObject({
      statusCode: HttpStatus.FORBIDDEN,
      code: "GOOGLE_PERMISSION_REQUIRED",
      permission: "gmail_manage",
      action: "archive",
    });
  });

  it("keeps the code of the AI capacity 402", () => {
    const body = responseBodyFor(
      new HttpException(
        { message: "Limit reached", code: AI_VOLUME_LIMIT_REACHED_CODE },
        HttpStatus.PAYMENT_REQUIRED,
      ),
    );

    expect(body.code).toBe(AI_VOLUME_LIMIT_REACHED_CODE);
  });

  it("drops any other field an exception carries", () => {
    const body = responseBodyFor(
      new HttpException(
        { message: "Nope", code: "SOME_CODE", internalNote: "secret" },
        HttpStatus.BAD_REQUEST,
      ),
    );

    expect(body.code).toBe("SOME_CODE");
    expect(body).not.toHaveProperty("internalNote");
  });

  it("adds nothing for a plain error", () => {
    const body = responseBodyFor(new BadRequestException("Bad input"));

    expect(body).not.toHaveProperty("code");
    expect(body.message).toBe("Bad input");
  });

  it("never passes details through on a server error", () => {
    const body = responseBodyFor(
      new InternalServerErrorException({ message: "Boom", code: "INTERNAL" }),
    );

    expect(body).not.toHaveProperty("code");
  });
});
