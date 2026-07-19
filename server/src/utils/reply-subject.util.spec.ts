import { buildReplySubject } from "./reply-subject.util";

describe("buildReplySubject", () => {
  describe("reply (isForward=false)", () => {
    it("prepends Re: when subject has no prefix", () => {
      expect(buildReplySubject("Hello", false)).toBe("Re: Hello");
    });

    it("does not double-prefix when subject already starts with re:", () => {
      expect(buildReplySubject("Re: Hello", false)).toBe("Re: Hello");
    });

    it("is case-insensitive when detecting existing prefix", () => {
      expect(buildReplySubject("RE: Hello", false)).toBe("RE: Hello");
    });
  });

  describe("forward (isForward=true)", () => {
    it("prepends Fwd: when subject has no prefix", () => {
      expect(buildReplySubject("Hello", true)).toBe("Fwd: Hello");
    });

    it("does not double-prefix when subject already starts with fwd:", () => {
      expect(buildReplySubject("Fwd: Hello", true)).toBe("Fwd: Hello");
    });

    it("is case-insensitive when detecting existing prefix", () => {
      expect(buildReplySubject("FWD: Hello", true)).toBe("FWD: Hello");
    });
  });

  describe("empty subject", () => {
    it("returns just the Re: prefix for empty subject on reply", () => {
      expect(buildReplySubject("", false)).toBe("Re:");
    });

    it("returns just the Fwd: prefix for empty subject on forward", () => {
      expect(buildReplySubject("", true)).toBe("Fwd:");
    });
  });
});
