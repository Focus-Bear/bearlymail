/**
 * JXA (JavaScript for Automation) sources executed against Mail.app via
 * `osascript -l JavaScript`. Each script defines `run(argv)` where argv[0] is
 * a JSON-encoded params object, and returns a JSON string.
 *
 * Performance notes (measured against a real Mail.app store):
 * - Bulk property getters over envelope-indexed fields (id, subject, sender,
 *   dateReceived, readStatus, flaggedStatus) are fast (~1ms/message).
 * - `messageId()` (the RFC-822 ID) is NOT indexed — ~300ms/message because
 *   Mail opens each message. It is therefore only read in the per-message
 *   detail fetch for messages we haven't imported yet.
 * - `mailbox.messages.byId(appleId)` resolves in ~25ms and finds the message
 *   even when it lives in a different mailbox of the account, so all
 *   targeted operations (flag, move, attachments, reply) address messages by
 *   Mail's numeric id.
 */

/**
 * Shared JXA helper functions prepended to every script that needs them.
 * findAccount/findMailbox do case-insensitive name matching because localized
 * Mail versions vary mailbox naming; getMessageById resolves a message by
 * Mail's numeric id through any mailbox collection of its account.
 *
 * Params are passed as a JSON file path in argv[0] (not inline JSON) because
 * macOS caps command-line arguments at ARG_MAX (~256 KB) and email bodies
 * can exceed that.
 */
const JXA_HELPERS = `
ObjC.import("Foundation");

function readParams(argv) {
  const contents = $.NSString.stringWithContentsOfFileEncodingError(
    argv[0],
    $.NSUTF8StringEncoding,
    null,
  );
  return JSON.parse(ObjC.unwrap(contents));
}

function findAccount(Mail, name) {
  const accounts = Mail.accounts();
  for (let i = 0; i < accounts.length; i++) {
    try {
      if (accounts[i].name() === name) return accounts[i];
    } catch (e) { /* account unavailable */ }
  }
  return null;
}

function findMailbox(account, candidateNames) {
  const wanted = candidateNames.map(function (n) { return n.toLowerCase(); });
  let mailboxes = [];
  try { mailboxes = account.mailboxes(); } catch (e) { return null; }
  for (let i = 0; i < mailboxes.length; i++) {
    try {
      const name = (mailboxes[i].name() || "").toLowerCase();
      if (wanted.indexOf(name) !== -1) return mailboxes[i];
    } catch (e) { /* skip unreadable mailbox */ }
  }
  return null;
}

const INBOX_NAMES = ["INBOX", "Inbox"];
const ARCHIVE_NAMES = ["Archive", "Archived", "All Mail", "[Gmail]/All Mail", "BearlyMail-archived"];
const TRASH_NAMES = ["Trash", "Deleted Messages", "Bin", "Deleted Items"];
const SENT_NAMES = ["Sent", "Sent Mail", "Sent Messages", "Sent Items"];

function getMessageById(Mail, accountName, appleId) {
  const account = findAccount(Mail, accountName);
  if (!account) return null;
  let mailboxes = [];
  try { mailboxes = account.mailboxes(); } catch (e) { /* none */ }
  // byId resolves across mailboxes of the account in practice (measured),
  // but fall back to every mailbox collection in case a Mail version scopes
  // it strictly - each failed attempt costs only ~25ms.
  const inbox = findMailbox(account, INBOX_NAMES);
  const collections = inbox ? [inbox].concat(mailboxes) : mailboxes;
  for (let i = 0; i < collections.length; i++) {
    try {
      const msg = collections[i].messages.byId(appleId);
      msg.id();
      return msg;
    } catch (e) { /* not resolvable through this collection */ }
  }
  return null;
}
`;

/**
 * Lists every account configured in Mail.app.
 * Returns: [{ name, enabled, emails, fullName }]
 */
export const LIST_ACCOUNTS_SCRIPT = `
function run() {
  const Mail = Application("Mail");
  const out = Mail.accounts().map(function (a) {
    let emails = [];
    let fullName = "";
    let enabled = false;
    try { emails = a.emailAddresses() || []; } catch (e) { /* not readable */ }
    try { fullName = a.fullName() || ""; } catch (e) { /* not readable */ }
    try { enabled = a.enabled(); } catch (e) { /* not readable */ }
    return { name: a.name(), enabled: enabled, emails: emails, fullName: fullName };
  });
  return JSON.stringify(out);
}
`;

/**
 * Bulk-lists inbox message summaries for the given accounts, newest first,
 * filtered to dateReceived >= sinceMs. Uses only envelope-indexed bulk
 * getters, so it is fast even on large inboxes. The RFC-822 message ID is
 * deliberately absent (see performance notes) — messages are identified by
 * Mail's numeric id.
 * Params: { accountNames: string[], sinceMs: number, maxMessages: number }
 * Returns: [{ appleId, subject, sender, dateReceivedMs, isRead, isFlagged,
 *            accountName }]
 */
export const FETCH_INBOX_SUMMARY_SCRIPT = `${JXA_HELPERS}
function run(argv) {
  const params = readParams(argv);
  const Mail = Application("Mail");
  const out = [];
  for (let i = 0; i < params.accountNames.length; i++) {
    const account = findAccount(Mail, params.accountNames[i]);
    if (!account) continue;
    const inbox = findMailbox(account, INBOX_NAMES);
    if (!inbox) continue;
    let appleIds, subjects, senders, dates, readFlags, flaggedFlags;
    try {
      appleIds = inbox.messages.id();
      subjects = inbox.messages.subject();
      senders = inbox.messages.sender();
      dates = inbox.messages.dateReceived();
      readFlags = inbox.messages.readStatus();
      flaggedFlags = inbox.messages.flaggedStatus();
    } catch (e) { continue; }
    for (let m = 0; m < appleIds.length; m++) {
      const receivedMs = dates[m] ? dates[m].getTime() : 0;
      if (receivedMs < params.sinceMs) continue;
      out.push({
        appleId: appleIds[m],
        subject: subjects[m] || "",
        sender: senders[m] || "",
        dateReceivedMs: receivedMs,
        isRead: !!readFlags[m],
        isFlagged: !!flaggedFlags[m],
        accountName: params.accountNames[i],
      });
    }
  }
  out.sort(function (x, y) { return y.dateReceivedMs - x.dateReceivedMs; });
  return JSON.stringify(out.slice(0, params.maxMessages));
}
`;

/**
 * Lists every message id currently in the given accounts' inboxes (no date
 * filter). Used to detect messages archived/deleted directly in Mail.app.
 * Params: { accountNames: string[] }
 * Returns: { appleIds: number[] }
 */
export const LIST_INBOX_APPLE_IDS_SCRIPT = `${JXA_HELPERS}
function run(argv) {
  const params = readParams(argv);
  const Mail = Application("Mail");
  const appleIds = [];
  for (let i = 0; i < params.accountNames.length; i++) {
    const account = findAccount(Mail, params.accountNames[i]);
    if (!account) continue;
    const inbox = findMailbox(account, INBOX_NAMES);
    if (!inbox) continue;
    let ids = [];
    try { ids = inbox.messages.id(); } catch (e) { continue; }
    for (let m = 0; m < ids.length; m++) appleIds.push(ids[m]);
  }
  return JSON.stringify({ appleIds: appleIds });
}
`;

/**
 * Fetches full detail (RFC-822 id, plain-text content, raw headers,
 * attachment metadata) for specific messages. Slow per message — callers
 * should only pass messages not yet imported.
 * Params: { items: [{ accountName, appleId }] }
 * Returns: [{ appleId, messageId, content, allHeaders, attachments: [{ id,
 *            name, mimeType, fileSize, downloaded }] }]
 */
export const FETCH_MESSAGE_DETAILS_SCRIPT = `${JXA_HELPERS}
function run(argv) {
  const params = readParams(argv);
  const Mail = Application("Mail");
  const out = [];
  for (let i = 0; i < params.items.length; i++) {
    const item = params.items[i];
    const msg = getMessageById(Mail, item.accountName, item.appleId);
    if (!msg) continue;
    const detail = { appleId: item.appleId, messageId: "", content: "", allHeaders: "", attachments: [] };
    try { detail.messageId = msg.messageId() || ""; } catch (e) { /* fall back to headers */ }
    try { detail.content = msg.content() || ""; } catch (e) { /* keep empty */ }
    try { detail.allHeaders = msg.allHeaders() || ""; } catch (e) { /* keep empty */ }
    try {
      const atts = msg.mailAttachments();
      for (let t = 0; t < atts.length; t++) {
        const att = { id: "", name: "", mimeType: "", fileSize: 0, downloaded: false };
        try { att.id = atts[t].id(); } catch (e) { /* optional */ }
        try { att.name = atts[t].name(); } catch (e) { /* optional */ }
        try { att.mimeType = atts[t].mimeType(); } catch (e) { /* optional */ }
        try { att.fileSize = atts[t].fileSize() || 0; } catch (e) { /* optional */ }
        try { att.downloaded = atts[t].downloaded(); } catch (e) { /* optional */ }
        detail.attachments.push(att);
      }
    } catch (e) { /* no attachments readable */ }
    out.push(detail);
  }
  return JSON.stringify(out);
}
`;

/**
 * Sets the flagged status of specific messages.
 * Params: { items: [{ accountName, appleId }], flagged: boolean }
 * Returns: { updated: number }
 */
export const SET_FLAGGED_SCRIPT = `${JXA_HELPERS}
function run(argv) {
  const params = readParams(argv);
  const Mail = Application("Mail");
  let updated = 0;
  for (let i = 0; i < params.items.length; i++) {
    const msg = getMessageById(Mail, params.items[i].accountName, params.items[i].appleId);
    if (!msg) continue;
    try { msg.flaggedStatus = params.flagged; updated++; } catch (e) { /* skip */ }
  }
  return JSON.stringify({ updated: updated });
}
`;

/**
 * Sets the read status of specific messages.
 * Params: { items: [{ accountName, appleId }], read: boolean }
 * Returns: { updated: number }
 */
export const SET_READ_SCRIPT = `${JXA_HELPERS}
function run(argv) {
  const params = readParams(argv);
  const Mail = Application("Mail");
  let updated = 0;
  for (let i = 0; i < params.items.length; i++) {
    const msg = getMessageById(Mail, params.items[i].accountName, params.items[i].appleId);
    if (!msg) continue;
    try { msg.readStatus = params.read; updated++; } catch (e) { /* skip */ }
  }
  return JSON.stringify({ updated: updated });
}
`;

/**
 * Moves specific messages to a named target mailbox on their own account.
 * target is "archive" | "inbox" | "trash".
 * Params: { items: [{ accountName, appleId }], target: string }
 * Returns: { moved: number, errors: string[] }
 */
export const MOVE_MESSAGES_SCRIPT = `${JXA_HELPERS}
function run(argv) {
  const params = readParams(argv);
  const Mail = Application("Mail");
  const targetCandidates =
    params.target === "archive" ? ARCHIVE_NAMES :
    params.target === "trash" ? TRASH_NAMES : INBOX_NAMES;
  let moved = 0;
  const errors = [];
  for (let i = 0; i < params.items.length; i++) {
    const item = params.items[i];
    try {
      const msg = getMessageById(Mail, item.accountName, item.appleId);
      if (!msg) {
        errors.push("Message " + item.appleId + " not found on account " + item.accountName);
        continue;
      }
      const account = findAccount(Mail, item.accountName);
      const targetMailbox = findMailbox(account, targetCandidates);
      if (!targetMailbox) {
        errors.push("No " + params.target + " mailbox on account " + item.accountName);
        continue;
      }
      Mail.move(msg, { to: targetMailbox });
      moved++;
    } catch (e) {
      errors.push(String(e));
    }
  }
  return JSON.stringify({ moved: moved, errors: errors });
}
`;

/**
 * Saves one attachment of a message to a local file path.
 * Params: { accountName, appleId, attachmentId, attachmentName, targetPath }
 * Returns: { saved: boolean, error?: string }
 */
export const SAVE_ATTACHMENT_SCRIPT = `${JXA_HELPERS}
function run(argv) {
  const params = readParams(argv);
  const Mail = Application("Mail");
  const msg = getMessageById(Mail, params.accountName, params.appleId);
  if (!msg) return JSON.stringify({ saved: false, error: "message not found" });
  let atts = [];
  try { atts = msg.mailAttachments(); } catch (e) {
    return JSON.stringify({ saved: false, error: "attachments unreadable: " + String(e) });
  }
  for (let t = 0; t < atts.length; t++) {
    let id = "";
    let name = "";
    try { id = atts[t].id(); } catch (e) { /* optional */ }
    try { name = atts[t].name(); } catch (e) { /* optional */ }
    if ((params.attachmentId && id === params.attachmentId) ||
        (!params.attachmentId && params.attachmentName && name === params.attachmentName) ||
        (params.attachmentName && name === params.attachmentName)) {
      try {
        Mail.save(atts[t], { in: Path(params.targetPath) });
        return JSON.stringify({ saved: true });
      } catch (e) {
        return JSON.stringify({ saved: false, error: String(e) });
      }
    }
  }
  return JSON.stringify({ saved: false, error: "attachment not found" });
}
`;

/**
 * Sends an email through Mail.app. When replyTo is provided the message is
 * created with Mail's reply command so In-Reply-To/References headers are set
 * and recipients' clients keep the thread intact.
 * Params: { senderEmail?, senderName?, to: string[], cc: string[],
 *           bcc: string[], subject, body, attachmentPaths: string[],
 *           replyTo?: { accountName, appleId } }
 * Returns: { sent: boolean, messageId: string|null, error?: string }
 */
export const SEND_MESSAGE_SCRIPT = `${JXA_HELPERS}
function run(argv) {
  const params = readParams(argv);
  const Mail = Application("Mail");
  Mail.includeStandardAdditions = true;
  const sendStartMs = Date.now();
  let outgoing = null;

  if (params.replyTo) {
    const original = getMessageById(Mail, params.replyTo.accountName, params.replyTo.appleId);
    if (original) {
      try {
        outgoing = Mail.reply(original, { openingWindow: false, replyToAll: false });
        outgoing.content = params.body;
      } catch (e) { outgoing = null; }
    }
  }

  if (!outgoing) {
    outgoing = Mail.OutgoingMessage({
      subject: params.subject,
      content: params.body,
      visible: false,
    });
    Mail.outgoingMessages.push(outgoing);
    for (let i = 0; i < params.to.length; i++) {
      outgoing.toRecipients.push(Mail.Recipient({ address: params.to[i] }));
    }
  }

  for (let i = 0; i < (params.cc || []).length; i++) {
    outgoing.ccRecipients.push(Mail.Recipient({ address: params.cc[i] }));
  }
  for (let i = 0; i < (params.bcc || []).length; i++) {
    outgoing.bccRecipients.push(Mail.Recipient({ address: params.bcc[i] }));
  }

  if (params.senderEmail) {
    outgoing.sender = params.senderName
      ? params.senderName + " <" + params.senderEmail + ">"
      : params.senderEmail;
  }

  const paths = params.attachmentPaths || [];
  for (let i = 0; i < paths.length; i++) {
    outgoing.attachments.push(Mail.Attachment({ fileName: Path(paths[i]) }));
  }
  if (paths.length) delay(1);

  try {
    Mail.send(outgoing);
  } catch (e) {
    return JSON.stringify({ sent: false, messageId: null, error: String(e) });
  }

  // Best-effort recovery of the sent message's RFC-822 id: messages are
  // ordered newest-first, so only the head of the Sent mailbox is checked.
  let sentMessageId = null;
  const account = params.senderEmail ? (function () {
    const accounts = Mail.accounts();
    for (let a = 0; a < accounts.length; a++) {
      try {
        if ((accounts[a].emailAddresses() || []).indexOf(params.senderEmail) !== -1) return accounts[a];
      } catch (e) { /* skip */ }
    }
    return null;
  })() : null;
  if (account) {
    const sentMailbox = findMailbox(account, SENT_NAMES);
    if (sentMailbox) {
      for (let attempt = 0; attempt < 8 && !sentMessageId; attempt++) {
        delay(0.5);
        for (let m = 0; m < 5 && !sentMessageId; m++) {
          try {
            const candidate = sentMailbox.messages[m];
            if (candidate.subject() !== params.subject) continue;
            const sentMs = candidate.dateSent().getTime();
            if (sentMs < sendStartMs - 60000) break;
            sentMessageId = candidate.messageId();
          } catch (e) { break; }
        }
      }
    }
  }

  return JSON.stringify({ sent: true, messageId: sentMessageId });
}
`;
