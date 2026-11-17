import { selectAutoResponseRecipient } from "./auto-responder-recipient";

describe("selectAutoResponseRecipient", () => {
  it("replies to From when there is no Reply-To", () => {
    expect(selectAutoResponseRecipient("alice@example.com", null)).toBe(
      "alice@example.com",
    );
  });

  it("extracts the bare address from a display-name From", () => {
    expect(
      selectAutoResponseRecipient("Alice <Alice@Example.com>", undefined),
    ).toBe("alice@example.com");
  });

  it("honours a Reply-To on the same domain as From", () => {
    expect(
      selectAutoResponseRecipient(
        "alice@example.com",
        "Support <support@example.com>",
      ),
    ).toBe("support@example.com");
  });

  it("ignores a Reply-To on a different domain", () => {
    expect(
      selectAutoResponseRecipient("alice@example.com", "someone@other.org"),
    ).toBe("alice@example.com");
  });

  it("ignores a Reply-To on a subdomain or lookalike domain", () => {
    expect(
      selectAutoResponseRecipient("alice@example.com", "x@mail.example.com"),
    ).toBe("alice@example.com");
    expect(
      selectAutoResponseRecipient("alice@example.com", "x@example.com.evil.io"),
    ).toBe("alice@example.com");
  });

  it("ignores a Reply-To that lists more than one address", () => {
    expect(
      selectAutoResponseRecipient(
        "alice@example.com",
        "bob@example.com, carol@other.org",
      ),
    ).toBe("alice@example.com");
  });
});
