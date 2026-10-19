import {
  compareContactMatches,
  ContactMatchTier,
  evaluateContactQueryMatch,
  normalizeForSearch,
  RankableContactMatch,
  tokenizeForSearch,
} from "./contact-query-match";

const LAM_PO_TANG_EMAIL = "andrew.lam-po-tang@example.org";

describe("tokenizeForSearch", () => {
  it("splits email local-parts on dots and hyphens", () => {
    expect(tokenizeForSearch("andrew.lam-po-tang")).toEqual([
      "andrew",
      "lam",
      "po",
      "tang",
    ]);
  });

  it("splits on underscores, plus signs and @", () => {
    expect(tokenizeForSearch("jo_smith+news@mail.example")).toEqual([
      "jo",
      "smith",
      "news",
      "mail",
      "example",
    ]);
  });

  it("splits on letter/digit boundaries", () => {
    expect(tokenizeForSearch("s3842000")).toEqual(["s", "3842000"]);
    expect(tokenizeForSearch("team2go")).toEqual(["team", "2", "go"]);
  });

  it("lowercases and strips diacritics", () => {
    expect(tokenizeForSearch("José ÅSTRÖM")).toEqual(["jose", "astrom"]);
    expect(normalizeForSearch("  Zoë ")).toBe("zoe");
  });

  it("returns no tokens for empty input", () => {
    expect(tokenizeForSearch(null)).toEqual([]);
    expect(tokenizeForSearch("  ")).toEqual([]);
  });
});

describe("evaluateContactQueryMatch", () => {
  it("passes a nameless contact whose email tokens match every query word", () => {
    const match = evaluateContactQueryMatch(
      { name: null, email: LAM_PO_TANG_EMAIL },
      "andrew lam",
    );

    expect(match).toMatchObject({
      passes: true,
      tier: ContactMatchTier.ORDERED_PREFIX,
    });
  });

  it("names the query word that failed", () => {
    const match = evaluateContactQueryMatch(
      { name: null, email: "andrewmcdonaldcw@example.com" },
      "andrew lam",
    );

    expect(match).toEqual({
      passes: false,
      failedWord: "lam",
      reason: '"lam" matched no name/email token',
    });
  });

  it("treats a query word as a prefix of any token", () => {
    expect(
      evaluateContactQueryMatch(
        { name: null, email: LAM_PO_TANG_EMAIL },
        "and la",
      ).passes,
    ).toBe(true);
  });

  it("matches words in any order, but ranks in-order matches higher", () => {
    const outOfOrder = evaluateContactQueryMatch(
      { name: null, email: LAM_PO_TANG_EMAIL },
      "lam andrew",
    );

    expect(outOfOrder).toMatchObject({
      passes: true,
      tier: ContactMatchTier.PREFIX,
    });
  });

  it("matches across name and email fields", () => {
    expect(
      evaluateContactQueryMatch(
        { name: "Andrew", email: "lam@example.com" },
        "andrew lam",
      ).passes,
    ).toBe(true);
  });

  it("classifies an exact name or first/last name as EXACT", () => {
    expect(
      evaluateContactQueryMatch(
        { name: "Andrew Lam", email: "x@example.com" },
        "andrew lam",
      ),
    ).toMatchObject({ passes: true, tier: ContactMatchTier.EXACT });
    expect(
      evaluateContactQueryMatch(
        { firstName: "Andrew", lastName: "Lam", email: "x@example.com" },
        "Andrew Lam",
      ),
    ).toMatchObject({ passes: true, tier: ContactMatchTier.EXACT });
  });

  it("classifies an email local-part equal to the query words as EXACT", () => {
    expect(
      evaluateContactQueryMatch(
        { email: "andrew.lam@example.org" },
        "andrew lam",
      ),
    ).toMatchObject({ passes: true, tier: ContactMatchTier.EXACT });
  });

  it("is case- and diacritic-insensitive", () => {
    expect(
      evaluateContactQueryMatch(
        { name: "José Núñez", email: "jn@example.com" },
        "JOSE nun",
      ).passes,
    ).toBe(true);
  });

  it("keeps substring matches that the old post-filter allowed", () => {
    expect(
      evaluateContactQueryMatch(
        { name: null, email: "andrewmcdonaldcw@example.com" },
        "mcdonald",
      ),
    ).toMatchObject({ passes: true, tier: ContactMatchTier.SUBSTRING });
  });

  it("ignores the domain for EXACT but still matches on it", () => {
    expect(
      evaluateContactQueryMatch({ email: "sam@acme.example" }, "acme"),
    ).toMatchObject({ passes: true, tier: ContactMatchTier.ORDERED_PREFIX });
  });
});

describe("compareContactMatches", () => {
  const base: RankableContactMatch = {
    tier: ContactMatchTier.PREFIX,
    matchedTokenCount: 5,
    contactFrequency: 0,
    isFavorite: false,
  };

  it("ranks by tier before token count and frequency", () => {
    const ordered = { ...base, tier: ContactMatchTier.ORDERED_PREFIX };
    const frequent = { ...base, matchedTokenCount: 11, contactFrequency: 99 };

    expect([frequent, ordered].sort(compareContactMatches)[0]).toBe(ordered);
  });

  it("uses frequency only as a tiebreak", () => {
    const frequent = { ...base, contactFrequency: 10 };
    const moreTokens = { ...base, matchedTokenCount: 6 };

    expect([frequent, moreTokens].sort(compareContactMatches)[0]).toBe(
      moreTokens,
    );
    expect([base, frequent].sort(compareContactMatches)[0]).toBe(frequent);
  });
});
