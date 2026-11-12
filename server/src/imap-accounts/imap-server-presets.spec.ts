import {
  smtpServerFilesSentMail,
  suggestMailServers,
} from "./imap-server-presets";

describe("suggestMailServers", () => {
  it("defaults hosted-domain mail (Crazy Domains, cPanel) to mail.<domain> over SSL", () => {
    expect(suggestMailServers("Friend@MyBusiness.com.au")).toEqual({
      imapHost: "mail.mybusiness.com.au",
      imapPort: 993,
      imapSecure: true,
      smtpHost: "mail.mybusiness.com.au",
      smtpPort: 465,
      smtpSecure: true,
    });
  });

  it("knows providers that don't follow the convention, including aliases", () => {
    expect(suggestMailServers("me@me.com")).toMatchObject({
      imapHost: "imap.mail.me.com",
      smtpPort: 587,
      smtpSecure: false,
    });
  });

  it("returns null for something that isn't an address", () => {
    expect(suggestMailServers("not-an-email")).toBeNull();
  });
});

describe("smtpServerFilesSentMail", () => {
  it("is true only for servers that file their own Sent copy", () => {
    expect(smtpServerFilesSentMail("smtp.fastmail.com")).toBe(true);
    expect(smtpServerFilesSentMail("mail.mybusiness.com.au")).toBe(false);
  });
});
