import { gmail_v1 } from "googleapis";

import {
  extractAttachmentsFromPayload,
  filenameFromContentDisposition,
} from "./gmail-message-parser";

describe("gmail-message-parser — attachments", () => {
  describe("filenameFromContentDisposition", () => {
    it("parses quoted filename", () => {
      expect(
        filenameFromContentDisposition('attachment; filename="report.docx"'),
      ).toBe("report.docx");
    });

    it("parses RFC5987 filename*", () => {
      expect(
        filenameFromContentDisposition(
          "attachment; filename*=UTF-8''hello%20world.pdf",
        ),
      ).toBe("hello world.pdf");
    });
  });

  describe("extractAttachmentsFromPayload", () => {
    it("finds attachment when filename is only in Content-Disposition", () => {
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/mixed",
        partId: "",
        parts: [
          {
            mimeType: "text/plain",
            partId: "0",
            body: { data: "", size: 0 },
          },
          {
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename: "",
            partId: "1",
            headers: [
              {
                name: "Content-Disposition",
                value: 'attachment; filename="Proposal.docx"',
              },
            ],
            body: {
              attachmentId: "ANGjdJ_test_id",
              size: 50_000,
            },
          },
        ],
      };
      const result = extractAttachmentsFromPayload(payload);
      expect(result).toEqual([
        expect.objectContaining({
          attachmentId: "ANGjdJ_test_id",
          filename: "Proposal.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: 50_000,
        }),
      ]);
    });

    it("still uses part.filename when Gmail sets it", () => {
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/mixed",
        partId: "",
        parts: [
          {
            mimeType: "application/pdf",
            filename: "deck.pdf",
            partId: "1",
            body: { attachmentId: "att_pdf", size: 1200 },
          },
        ],
      };
      const result = extractAttachmentsFromPayload(payload);
      expect(result?.[0].filename).toBe("deck.pdf");
    });

    it("captures large inline image parts with Content-ID and attachmentId", () => {
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/related",
        partId: "",
        parts: [
          {
            mimeType: "image/png",
            filename: "",
            partId: "1",
            headers: [
              { name: "Content-ID", value: "<img001@local>" },
              { name: "Content-Disposition", value: "inline" },
            ],
            body: { attachmentId: "inline_att_id", size: 100 },
          },
        ],
      };
      const result = extractAttachmentsFromPayload(payload);
      expect(result).toHaveLength(1);
      expect(result![0].attachmentId).toBe("inline_att_id");
      expect(result![0].contentId).toBe("img001@local");
      expect(result![0].mimeType).toBe("image/png");
      expect(result![0].inlineData).toBeUndefined();
    });

    it("captures small inline image with body.data and Content-ID as inlineData", () => {
      const IMG_BASE64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/related",
        partId: "",
        parts: [
          {
            mimeType: "image/png",
            filename: "",
            partId: "1",
            headers: [
              { name: "Content-ID", value: "<screenshot001@local>" },
              { name: "Content-Disposition", value: "inline" },
            ],
            body: { data: IMG_BASE64, size: IMG_BASE64.length },
          },
        ],
      };
      const result = extractAttachmentsFromPayload(payload);
      expect(result).toHaveLength(1);
      expect(result![0].contentId).toBe("screenshot001@local");
      expect(result![0].inlineData).toBe(IMG_BASE64);
      expect(result![0].mimeType).toBe("image/png");
      expect(result![0].attachmentId).toMatch(/^inline-img-/);
    });

    it("captures contentId on a regular attachment reported with Content-Disposition: attachment", () => {
      // Gmail commonly reports cid-referenced inline images with
      // Content-Disposition: attachment. They go through the regular-attachment
      // path but must still carry their contentId so the client can resolve the
      // cid: reference in the HTML body.
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/related",
        partId: "",
        parts: [
          {
            mimeType: "image/png",
            filename: "logo.png",
            partId: "1",
            headers: [
              { name: "Content-ID", value: "<logo@local>" },
              {
                name: "Content-Disposition",
                value: 'attachment; filename="logo.png"',
              },
            ],
            body: { attachmentId: "regular_att_id", size: 2048 },
          },
        ],
      };
      const result = extractAttachmentsFromPayload(payload);
      expect(result).toHaveLength(1);
      expect(result![0].attachmentId).toBe("regular_att_id");
      expect(result![0].filename).toBe("logo.png");
      expect(result![0].contentId).toBe("logo@local");
      expect(result![0].inlineData).toBeUndefined();
    });

    it("uses fallback filename when attachmentId exists but no name headers", () => {
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/mixed",
        partId: "",
        parts: [
          {
            mimeType: "application/octet-stream",
            filename: "",
            partId: "1",
            body: { attachmentId: "orphan_id", size: 99 },
          },
        ],
      };
      const result = extractAttachmentsFromPayload(payload);
      expect(result?.[0].filename).toBe("attachment");
    });

    describe("inline ICS calendar attachments", () => {
      const ICS_BASE64 = Buffer.from(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:20260521T040000Z\r\nDTEND:20260521T050000Z\r\nSUMMARY:Test meeting\r\nEND:VEVENT\r\nEND:VCALENDAR",
      ).toString("base64");

      it("captures inline text/calendar part without attachmentId", () => {
        const payload: gmail_v1.Schema$MessagePart = {
          mimeType: "multipart/mixed",
          partId: "",
          parts: [
            {
              mimeType: "text/plain",
              partId: "0",
              body: { data: "aGVsbG8=", size: 5 },
            },
            {
              mimeType: "text/calendar",
              filename: "invite.ics",
              partId: "1",
              body: { data: ICS_BASE64, size: ICS_BASE64.length },
            },
          ],
        };
        const result = extractAttachmentsFromPayload(payload);
        expect(result).toHaveLength(1);
        expect(result![0]).toMatchObject({
          attachmentId: "inline-ics-0",
          filename: "invite.ics",
          mimeType: "text/calendar",
          inlineData: ICS_BASE64,
        });
      });

      it("uses default filename invite.ics when calendar part has no filename", () => {
        const payload: gmail_v1.Schema$MessagePart = {
          mimeType: "multipart/mixed",
          partId: "",
          parts: [
            {
              mimeType: "text/calendar",
              filename: "",
              partId: "1",
              body: { data: ICS_BASE64, size: 10 },
            },
          ],
        };
        const result = extractAttachmentsFromPayload(payload);
        expect(result![0].filename).toBe("invite.ics");
      });

      it("captures application/ics inline part", () => {
        const payload: gmail_v1.Schema$MessagePart = {
          mimeType: "multipart/mixed",
          partId: "",
          parts: [
            {
              mimeType: "application/ics",
              filename: "event.ics",
              partId: "1",
              body: { data: ICS_BASE64, size: 10 },
            },
          ],
        };
        const result = extractAttachmentsFromPayload(payload);
        expect(result).toHaveLength(1);
        expect(result![0].attachmentId).toBe("inline-ics-0");
        expect(result![0].mimeType).toBe("application/ics");
      });

      it("ignores inline text/calendar part that has no body data", () => {
        const payload: gmail_v1.Schema$MessagePart = {
          mimeType: "multipart/mixed",
          partId: "",
          parts: [
            {
              mimeType: "text/calendar",
              partId: "1",
              body: { size: 0 },
            },
          ],
        };
        const result = extractAttachmentsFromPayload(payload);
        expect(result).toBeUndefined();
      });

      it("still captures normal Gmail attachment alongside inline ICS", () => {
        const payload: gmail_v1.Schema$MessagePart = {
          mimeType: "multipart/mixed",
          partId: "",
          parts: [
            {
              mimeType: "application/pdf",
              filename: "report.pdf",
              partId: "1",
              body: { attachmentId: "att_pdf_123", size: 50_000 },
            },
            {
              mimeType: "text/calendar",
              filename: "invite.ics",
              partId: "2",
              body: { data: ICS_BASE64, size: ICS_BASE64.length },
            },
          ],
        };
        const result = extractAttachmentsFromPayload(payload);
        expect(result).toHaveLength(2);
        expect(result![0].attachmentId).toBe("att_pdf_123");
        expect(result![1].attachmentId).toBe("inline-ics-1");
      });
    });
  });
});
