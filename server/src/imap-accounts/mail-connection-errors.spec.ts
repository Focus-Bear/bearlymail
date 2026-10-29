import {
  describeMailConnectionError,
  isMailAuthFailure,
  MAIL_CONNECTION_ERROR_CODES,
} from "./mail-connection-errors";
import { MailServerAddressError } from "./mail-server-address";

function errorWith(props: Record<string, unknown>): Error {
  return Object.assign(new Error("boom"), props);
}

describe("describeMailConnectionError", () => {
  it.each([
    [
      "imap auth",
      errorWith({ authenticationFailed: true }),
      MAIL_CONNECTION_ERROR_CODES.AUTH_FAILED,
    ],
    [
      "smtp auth",
      errorWith({ code: "EAUTH" }),
      MAIL_CONNECTION_ERROR_CODES.AUTH_FAILED,
    ],
    [
      "certificate for another host",
      errorWith({ code: "ERR_TLS_CERT_ALTNAME_INVALID" }),
      MAIL_CONNECTION_ERROR_CODES.CERTIFICATE_MISMATCH,
    ],
    [
      "self-signed (on the cause)",
      errorWith({ cause: { code: "SELF_SIGNED_CERT_IN_CHAIN" } }),
      MAIL_CONNECTION_ERROR_CODES.TLS_FAILED,
    ],
    [
      "refused",
      errorWith({ code: "ECONNREFUSED" }),
      MAIL_CONNECTION_ERROR_CODES.CONNECTION_FAILED,
    ],
    [
      "timeout",
      errorWith({ code: "ETIMEDOUT" }),
      MAIL_CONNECTION_ERROR_CODES.CONNECTION_FAILED,
    ],
    [
      "bad host",
      new MailServerAddressError("private"),
      MAIL_CONNECTION_ERROR_CODES.INVALID_SERVER,
    ],
    ["anything else", new Error("??"), MAIL_CONNECTION_ERROR_CODES.UNKNOWN],
  ])("classifies %s", (_label, error, code) => {
    expect(describeMailConnectionError("imap", error)).toMatchObject({
      protocol: "imap",
      code,
    });
  });

  it("flags only credential failures as needing a new password", () => {
    expect(isMailAuthFailure(errorWith({ code: "EAUTH" }))).toBe(true);
    expect(isMailAuthFailure(errorWith({ code: "ECONNREFUSED" }))).toBe(false);
  });
});
