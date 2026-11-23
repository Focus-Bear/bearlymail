import {
  UNSUBSCRIBE_METHODS,
  UNSUBSCRIBE_SOURCES,
} from "../../constants/unsubscribe.constants";
import {
  buildUnsubscribeOptions,
  findBodyUnsubscribeUrl,
  isUnsubscribeOptions,
  parseListUnsubscribe,
  parseMailtoUri,
  preferredUnsubscribeMethod,
  toSafeHttpsUrl,
  unsubscribeMethodFromStored,
} from "./list-unsubscribe.parser";

const ONE_CLICK = "List-Unsubscribe=One-Click";
const HTTPS_URL = "https://lists.example.test/unsub?u=abc&id=1";
const MAILTO = "mailto:unsub@lists.example.test?subject=unsubscribe";

describe("parseListUnsubscribe", () => {
  it("reads an RFC 8058 one-click https URL", () => {
    expect(parseListUnsubscribe(`<${HTTPS_URL}>`, ONE_CLICK)).toEqual({
      httpsUrl: HTTPS_URL,
      oneClick: true,
      source: UNSUBSCRIBE_SOURCES.HEADER,
    });
  });

  it("matches the List-Unsubscribe-Post value case-insensitively", () => {
    expect(
      parseListUnsubscribe(`<${HTTPS_URL}>`, " list-unsubscribe=one-click ")
        ?.oneClick,
    ).toBe(true);
  });

  it("does not treat an https URL as one-click without the Post header", () => {
    const options = parseListUnsubscribe(`<${HTTPS_URL}>`);
    expect(options?.oneClick).toBe(false);
    expect(preferredUnsubscribeMethod(options)).toBe(UNSUBSCRIBE_METHODS.LINK);
  });

  it("reads a mailto: target with its subject", () => {
    expect(parseListUnsubscribe(`<${MAILTO}>`)).toEqual({
      mailto: { address: "unsub@lists.example.test", subject: "unsubscribe" },
      oneClick: false,
      source: UNSUBSCRIBE_SOURCES.HEADER,
    });
  });

  it("keeps both targets and prefers one-click, then mailto (HubSpot shape)", () => {
    const header = `<mailto:1ax-jeremy=focusbear.io@bf10.na2.hubspotemail.net?subject=unsubscribe>, <${HTTPS_URL}>`;
    const options = parseListUnsubscribe(header, ONE_CLICK);
    expect(options?.httpsUrl).toBe(HTTPS_URL);
    expect(options?.mailto?.address).toBe(
      "1ax-jeremy=focusbear.io@bf10.na2.hubspotemail.net",
    );
    expect(preferredUnsubscribeMethod(options)).toBe(
      UNSUBSCRIBE_METHODS.ONE_CLICK,
    );
    expect(preferredUnsubscribeMethod({ ...options!, oneClick: false })).toBe(
      UNSUBSCRIBE_METHODS.MAILTO,
    );
  });

  it("drops http, javascript: and data: URIs", () => {
    const header =
      "<http://insecure.example.test/u>, <javascript:alert(1)>, <data:text/html,<b>x</b>>";
    expect(parseListUnsubscribe(header, ONE_CLICK)).toBeNull();
  });

  it("returns null for a missing, empty or unbracketed header", () => {
    expect(parseListUnsubscribe(undefined)).toBeNull();
    expect(parseListUnsubscribe("")).toBeNull();
    expect(parseListUnsubscribe(HTTPS_URL)).toBeNull();
    expect(parseListUnsubscribe("<not a url>")).toBeNull();
  });
});

describe("toSafeHttpsUrl", () => {
  it("rejects userinfo, which can disguise the real host", () => {
    expect(toSafeHttpsUrl("https://bank.example.test@evil.test/u")).toBeNull();
  });

  it("accepts a plain https URL", () => {
    expect(toSafeHttpsUrl(HTTPS_URL)).toBe(HTTPS_URL);
  });
});

describe("parseMailtoUri", () => {
  it("refuses multiple recipients and header-injection attempts", () => {
    expect(parseMailtoUri("mailto:a@x.test,b@x.test")).toBeNull();
    expect(parseMailtoUri("mailto:a@x.test%0d%0aBcc:b@x.test")).toBeNull();
    expect(parseMailtoUri("mailto:not-an-address")).toBeNull();
  });

  it("decodes the body parameter", () => {
    expect(parseMailtoUri("mailto:u@x.test?body=please%20remove")).toEqual({
      address: "u@x.test",
      body: "please remove",
    });
  });
});

describe("findBodyUnsubscribeUrl", () => {
  it("finds an https anchor whose text says unsubscribe", () => {
    const html = `<p>Hi</p><a href="https://hs.example.test/u?a=1&amp;b=2" data-unsubscribe="true">Unsubscribe</a>`;
    expect(findBodyUnsubscribeUrl(html, null)).toBe(
      "https://hs.example.test/u?a=1&b=2",
    );
  });

  it("ignores a javascript: unsubscribe anchor", () => {
    const html = `<a href="javascript:steal()">Unsubscribe</a>`;
    expect(findBodyUnsubscribeUrl(html, null)).toBeNull();
  });

  it("finds the URL after an Unsubscribe line in plain text", () => {
    const body =
      "Thanks for reading\nUnsubscribe:\nhttps://list.example.test/x";
    expect(findBodyUnsubscribeUrl(null, body)).toBe(
      "https://list.example.test/x",
    );
  });
});

describe("buildUnsubscribeOptions", () => {
  it("prefers the headers over a body link", () => {
    const options = buildUnsubscribeOptions({
      listUnsubscribe: `<${HTTPS_URL}>`,
      listUnsubscribePost: ONE_CLICK,
      htmlBody: `<a href="https://other.example.test/u">Unsubscribe</a>`,
    });
    expect(options?.source).toBe(UNSUBSCRIBE_SOURCES.HEADER);
    expect(options?.httpsUrl).toBe(HTTPS_URL);
  });

  it("falls back to a body link, never as one-click", () => {
    const options = buildUnsubscribeOptions({
      listUnsubscribe: "<javascript:alert(1)>",
      htmlBody: `<a href="https://other.example.test/u">Unsubscribe</a>`,
    });
    expect(options).toEqual({
      httpsUrl: "https://other.example.test/u",
      oneClick: false,
      source: UNSUBSCRIBE_SOURCES.BODY,
    });
  });

  it("returns null when there is nothing to unsubscribe from", () => {
    expect(buildUnsubscribeOptions({ body: "Lunch at 1?" })).toBeNull();
  });
});

describe("unsubscribeMethodFromStored", () => {
  it("narrows decrypted column values", () => {
    expect(isUnsubscribeOptions(null)).toBe(false);
    expect(isUnsubscribeOptions({ httpsUrl: 1, oneClick: true })).toBe(false);
    expect(unsubscribeMethodFromStored("garbage")).toBeNull();
    expect(
      unsubscribeMethodFromStored({
        httpsUrl: HTTPS_URL,
        oneClick: true,
        source: UNSUBSCRIBE_SOURCES.HEADER,
      }),
    ).toBe(UNSUBSCRIBE_METHODS.ONE_CLICK);
  });
});
