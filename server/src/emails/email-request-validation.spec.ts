import { BadRequestException, NotFoundException } from "@nestjs/common";

import {
  assertEmailId,
  assertValidStarCount,
  parseStatsDays,
} from "./email-request-validation";

const VALID_EMAIL_ID = "8b217996-65f1-4634-afd6-b2d28a194502";

describe("email request validation", () => {
  describe("assertEmailId", () => {
    it("accepts a UUID", () => {
      expect(() => assertEmailId(VALID_EMAIL_ID)).not.toThrow();
    });

    it("answers 404 for an id that cannot be an email", () => {
      expect(() => assertEmailId("not-a-uuid")).toThrow(NotFoundException);
    });
  });

  describe("assertValidStarCount", () => {
    it.each([0, 1, 2, 3])("accepts %s", (starCount) => {
      expect(() => assertValidStarCount(starCount)).not.toThrow();
    });

    it.each([-1, 4, 99, 1.5, "abc", "2", null, undefined, NaN])(
      "rejects %s",
      (starCount) => {
        expect(() => assertValidStarCount(starCount)).toThrow(
          BadRequestException,
        );
      },
    );
  });

  describe("parseStatsDays", () => {
    it("parses a whole number of days", () => {
      expect(parseStatsDays("30")).toBe(30);
    });

    it.each(["abc", "-5", "0", "1.5", ""])("rejects %s", (daysParam) => {
      expect(() => parseStatsDays(daysParam)).toThrow(BadRequestException);
    });
  });
});
