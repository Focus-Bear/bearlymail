import { gmail_v1 } from "googleapis";

import { GMAIL_LABELS } from "../../../constants/email-labels";
import {
  markMessageUnreadInGmail,
  markThreadReadInGmail,
} from "./gmail-operations";

function buildGmailMock() {
  const threadsModify = jest.fn().mockResolvedValue({ data: {} });
  const messagesModify = jest.fn().mockResolvedValue({ data: {} });
  const gmail = {
    users: {
      threads: { modify: threadsModify },
      messages: { modify: messagesModify },
    },
  } as unknown as gmail_v1.Gmail;
  return { gmail, threadsModify, messagesModify };
}

describe("Gmail read-status operations", () => {
  it("marks the whole thread read by removing UNREAD at thread level", async () => {
    const { gmail, threadsModify, messagesModify } = buildGmailMock();

    await markThreadReadInGmail("thread-1", gmail);

    expect(threadsModify).toHaveBeenCalledWith({
      userId: "me",
      id: "thread-1",
      requestBody: { removeLabelIds: [GMAIL_LABELS.UNREAD] },
    });
    expect(messagesModify).not.toHaveBeenCalled();
  });

  it("marks only the given message unread by adding UNREAD", async () => {
    const { gmail, threadsModify, messagesModify } = buildGmailMock();

    await markMessageUnreadInGmail("message-1", gmail);

    expect(messagesModify).toHaveBeenCalledWith({
      userId: "me",
      id: "message-1",
      requestBody: { addLabelIds: [GMAIL_LABELS.UNREAD] },
    });
    expect(threadsModify).not.toHaveBeenCalled();
  });

  it("propagates Gmail errors so the queued job can retry", async () => {
    const { gmail, threadsModify } = buildGmailMock();
    threadsModify.mockRejectedValueOnce(new Error("rate limited"));

    await expect(markThreadReadInGmail("thread-1", gmail)).rejects.toThrow(
      "rate limited",
    );
  });
});
