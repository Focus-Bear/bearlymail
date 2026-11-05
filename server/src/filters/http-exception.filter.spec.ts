import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";

import { AllExceptionsFilter } from "./http-exception.filter";

function respond(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: "/auth/step-up", method: "POST", headers: {} }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe("AllExceptionsFilter", () => {
  it("keeps the step-up challenge at the top level so the client doesn't log the user out", () => {
    const { status, body } = respond(
      new UnauthorizedException({ requiresPassword: true }),
    );
    expect(status).toBe(HttpStatus.UNAUTHORIZED);
    expect(body).toMatchObject({ requiresPassword: true, statusCode: 401 });
    expect(typeof body.message).toBe("string");
  });

  it("keeps structured details such as error codes and failure info", () => {
    expect(
      respond(
        new ForbiddenException({
          message: "No CRM",
          code: "PLAN_EXCLUDES_CRM",
        }),
      ).body,
    ).toMatchObject({ message: "No CRM", code: "PLAN_EXCLUDES_CRM" });
    expect(
      respond(
        new HttpException(
          { message: "Limit reached", code: "AI_VOLUME_LIMIT_REACHED" },
          HttpStatus.PAYMENT_REQUIRED,
        ),
      ).body,
    ).toMatchObject({ code: "AI_VOLUME_LIMIT_REACHED" });
    expect(
      respond(
        new BadRequestException({
          message: "Could not connect",
          failure: { protocol: "imap", code: "auth_failed" },
        }),
      ).body,
    ).toMatchObject({ failure: { protocol: "imap", code: "auth_failed" } });
  });

  it("does not let an exception body overwrite the envelope", () => {
    const { body } = respond(
      new BadRequestException({
        message: "bad",
        statusCode: 999,
        path: "/evil",
      }),
    );
    expect(body).toMatchObject({ statusCode: 400, path: "/auth/step-up" });
  });

  it("exposes no details on server errors", () => {
    const { body } = respond(
      new HttpException(
        { message: "boom", secret: "x" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      ),
    );
    expect(body).not.toHaveProperty("secret");
  });

  it("keeps plain string errors unchanged", () => {
    expect(
      respond(new UnauthorizedException("Invalid password")).body,
    ).toMatchObject({
      statusCode: 401,
      message: "Invalid password",
    });
  });
});
