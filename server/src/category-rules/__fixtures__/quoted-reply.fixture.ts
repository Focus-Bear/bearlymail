/**
 * Synthetic reply emails for quoted-text rule-matching tests. Modelled on a
 * real mis-filing (an external contact's reply quoting the user's own earlier
 * message, which contained "sorry"), with every name and address invented.
 */

export const USER_ADDRESS = "jeremy@focusbear.io";
export const EXTERNAL_FROM = "Pat Example <pat.example@university.example.edu>";
export const EXTERNAL_SUBJECT = "RE: Focus Bear at Example University";

/** The user's own reschedule-style composite rule (sender + subject + body). */
export const RESCHEDULE_RULE_SENDERS = [USER_ADDRESS];
export const RESCHEDULE_RULE_SUBJECT_PHRASES = ["Invitation", "Re:"];
export const RESCHEDULE_RULE_BODY_PHRASES = [
  "wrong time",
  "corrected to",
  "sorry",
];

const QUOTED_USER_MESSAGE =
  "Hi Pat, sorry for the slow reply. Here is the Focus Bear for Universities document.";

/** The external sender's own words — none of the rule's body phrases appear. */
const EXTERNAL_REPLY_TEXT = [
  "Hi Jeremy",
  "",
  "Thanks so much for sending this through.",
  "",
  "I will start the process now. It needs to go through several levels of management before we can approach our IT department for endorsement.",
].join("\r\n");

/** Outlook desktop plain-text part: separator line, then From/Sent/To/Cc/Subject. */
export const OUTLOOK_REPLY_PLAIN = [
  EXTERNAL_REPLY_TEXT,
  "",
  "From: Jeremy Nagel <jeremy@focusbear.io>",
  "Sent: Thursday, 23 October 2026 5:45 PM",
  "To: Pat Example <pat.example@university.example.edu>",
  "Cc: Sam Other <sam.other@university.example.edu>",
  "Subject: Re: Focus Bear at Example University",
  "",
  QUOTED_USER_MESSAGE,
].join("\r\n");

/** Outlook desktop HTML part: the header block sits in a border-top div. */
export const OUTLOOK_REPLY_HTML = `<html><body><div class="WordSection1">
<p class="MsoNormal">Hi Jeremy</p>
<p class="MsoNormal">Thanks so much for sending this through.</p>
<p class="MsoNormal">I will start the process now. It needs to go through several levels of management before we can approach our IT department for endorsement.</p>
<div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0cm 0cm 0cm">
<p class="MsoNormal"><b>From:</b> Jeremy Nagel &lt;jeremy@focusbear.io&gt; <br>
<b>Sent:</b> Thursday, 23 October 2026 5:45 PM<br>
<b>To:</b> Pat Example &lt;pat.example@university.example.edu&gt;<br>
<b>Cc:</b> Sam Other &lt;sam.other@university.example.edu&gt;<br>
<b>Subject:</b> Re: Focus Bear at Example University</p>
</div>
<p class="MsoNormal">${QUOTED_USER_MESSAGE}</p>
</div></body></html>`;

/** Gmail HTML reply with a one-word answer above a gmail_quote container. */
export const GMAIL_SHORT_REPLY_HTML = `<div dir="ltr">Thanks!</div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Thu, 23 Oct 2026 at 17:45, Jeremy Nagel &lt;jeremy@focusbear.io&gt; wrote:<br></div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex">${QUOTED_USER_MESSAGE}</blockquote></div>`;

/** Gmail plain text whose attribution line wrapped before the address. */
export const GMAIL_WRAPPED_ATTRIBUTION_PLAIN = [
  "Thanks!",
  "",
  "On Thu, 23 Oct 2026 at 17:45, Jeremy Nagel <",
  "jeremy@focusbear.io> wrote:",
  "",
  `${QUOTED_USER_MESSAGE}`,
].join("\n");

/** Gmail forward with a short preamble — the forwarded text is the substance. */
export const GMAIL_FORWARD_HTML = `<div dir="ltr">FYI</div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">---------- Forwarded message ---------<br>From: <strong class="gmail_sendername">Billing</strong> &lt;billing@vendor.example.com&gt;<br>Date: Thu, 23 Oct 2026 at 09:00<br>Subject: Invoice 1234<br></div><br><div>Your invoice 1234 is now overdue.</div></div>`;

/** Outlook forward with no preamble: the header block opens the body. */
export const OUTLOOK_BARE_FORWARD_PLAIN = [
  "From: Billing <billing@vendor.example.com>",
  "Sent: Thursday, 23 October 2026 9:00 AM",
  "To: Jeremy Nagel <jeremy@focusbear.io>",
  "Subject: Invoice 1234",
  "",
  "Your invoice 1234 is now overdue.",
].join("\r\n");

/** The user's own earlier message (the one the rule was written for). */
export const USER_OWN_MESSAGE_PLAIN = `${QUOTED_USER_MESSAGE}\r\n\r\nJeremy`;
