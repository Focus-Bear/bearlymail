import { AxiosInstance } from "axios";

import {
  sendEmailViaZoho,
  sendReplyViaZoho,
  uploadAttachmentsToZoho,
} from "./zoho-operations";

const ACCOUNT_ID = "acc-1";
const UPLOAD_PATH = `/accounts/${ACCOUNT_ID}/messages/attachments`;
const SEND_PATH = `/accounts/${ACCOUNT_ID}/messages`;

const pdf = {
  filename: "report.pdf",
  mimeType: "application/pdf",
  content: Buffer.from("%PDF-1.4 fake"),
};

const uploadResponse = (attachmentName: string) => ({
  data: {
    status: { code: 200, description: "success" },
    data: {
      storeName: "NN2:-123",
      attachmentPath: `/Mail/abc-${attachmentName}`,
      attachmentName,
    },
  },
});

/** A Zoho client whose upload and send endpoints answer like the real API. */
const fakeZohoClient = () => {
  const post = jest.fn((url: string, _body: unknown, config?: any) => {
    if (url === UPLOAD_PATH) {
      return Promise.resolve(uploadResponse(config.params.fileName));
    }
    return Promise.resolve({
      data: { data: { messageId: "m-1", threadId: "t-1" }, messageId: "m-1" },
    });
  });
  return { client: { post } as unknown as AxiosInstance, post };
};

describe("Zoho attachments (#515)", () => {
  describe("uploadAttachmentsToZoho", () => {
    it("uploads each file as raw bytes with its name and returns the references", async () => {
      const { client, post } = fakeZohoClient();

      const uploaded = await uploadAttachmentsToZoho(client, ACCOUNT_ID, [pdf]);

      expect(post).toHaveBeenCalledWith(UPLOAD_PATH, pdf.content, {
        params: { fileName: "report.pdf" },
        headers: { "Content-Type": "application/octet-stream" },
      });
      expect(uploaded).toEqual([
        {
          storeName: "NN2:-123",
          attachmentPath: "/Mail/abc-report.pdf",
          attachmentName: "report.pdf",
        },
      ]);
    });

    it("strips any folder path from the file name, which Zoho rejects", async () => {
      const { client, post } = fakeZohoClient();

      await uploadAttachmentsToZoho(client, ACCOUNT_ID, [
        { ...pdf, filename: "C:\\Users\\me\\report.pdf" },
      ]);

      expect(post.mock.calls[0][2].params.fileName).toBe("report.pdf");
    });

    it("throws when Zoho does not return a stored file, instead of dropping it", async () => {
      const post = jest.fn().mockResolvedValue({ data: { data: {} } });
      const client = { post } as unknown as AxiosInstance;

      await expect(
        uploadAttachmentsToZoho(client, ACCOUNT_ID, [pdf]),
      ).rejects.toThrow('Zoho did not accept attachment "report.pdf"');
    });

    it("uploads nothing when there are no attachments", async () => {
      const { client, post } = fakeZohoClient();

      expect(await uploadAttachmentsToZoho(client, ACCOUNT_ID, [])).toEqual([]);
      expect(
        await uploadAttachmentsToZoho(client, ACCOUNT_ID, undefined),
      ).toEqual([]);
      expect(post).not.toHaveBeenCalled();
    });
  });

  it("sends a new email with the uploaded attachments", async () => {
    const { client, post } = fakeZohoClient();

    await sendEmailViaZoho(client, ACCOUNT_ID, "me@zoho.com", {
      to: [{ email: "friend@example.com" }],
      subject: "Report",
      body: "<p>Attached.</p>",
      attachments: [pdf],
    });

    const sendCall = post.mock.calls.find(([url]) => url === SEND_PATH);
    expect(sendCall?.[1]).toMatchObject({
      fromAddress: "me@zoho.com",
      toAddress: "friend@example.com",
      attachments: [
        {
          storeName: "NN2:-123",
          attachmentPath: "/Mail/abc-report.pdf",
          attachmentName: "report.pdf",
        },
      ],
    });
  });

  it("sends a reply with the uploaded attachments", async () => {
    const { client, post } = fakeZohoClient();

    await sendReplyViaZoho(client, ACCOUNT_ID, {
      to: "friend@example.com",
      subject: "Report",
      htmlBody: "<p>Here it is.</p>",
      threadId: "thread-1",
      attachments: [pdf],
    });

    const sendCall = post.mock.calls.find(([url]) => url === SEND_PATH);
    expect((sendCall?.[1] as any).attachments).toEqual([
      expect.objectContaining({ attachmentName: "report.pdf" }),
    ]);
  });

  it("does not send the email when an upload fails", async () => {
    const post = jest.fn((url: string) =>
      url === UPLOAD_PATH
        ? Promise.reject(new Error("upload failed"))
        : Promise.resolve({ data: { data: {} } }),
    );
    const client = { post } as unknown as AxiosInstance;

    await expect(
      sendEmailViaZoho(client, ACCOUNT_ID, "me@zoho.com", {
        to: [{ email: "friend@example.com" }],
        subject: "Report",
        body: "<p>Attached.</p>",
        attachments: [pdf],
      }),
    ).rejects.toThrow("upload failed");
    expect(post).not.toHaveBeenCalledWith(SEND_PATH, expect.anything());
  });

  it("sends without an attachments field when there are none", async () => {
    const { client, post } = fakeZohoClient();

    await sendEmailViaZoho(client, ACCOUNT_ID, "me@zoho.com", {
      to: [{ email: "friend@example.com" }],
      subject: "Hi",
      body: "<p>Hi</p>",
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).not.toHaveProperty("attachments");
  });
});
