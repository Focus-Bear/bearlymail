import './email-thread-print.css';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Email } from 'types/email';
import { humanizeTimestamp } from 'utils/dateUtils';
import { sanitizeAndProcessHtml } from 'utils/emailBodyUtils';
import { toPrintSafeEmailHtml } from 'utils/printSafeEmailHtml';

import { useIsPrinting } from 'hooks/useIsPrinting';

interface PrintableThreadProps {
  email: Email;
  threadEmails: Email[];
}

/**
 * Print-only copy of the thread. It is mounted only while the browser is
 * printing (Ctrl+P / Cmd+P or window.print(), tracked by `useIsPrinting`) and
 * removed afterwards; the print stylesheet in email-thread-print.css hides all
 * other DOM nodes and reveals only this container so the printed page looks clean.
 *
 * Unlike normal viewing (sandboxed EmailBodyIframe), these bodies are inserted
 * into the app's own document, so after DOMPurify sanitisation they also go
 * through `toPrintSafeEmailHtml`, which drops message CSS (`<style>`, `id`,
 * `class`, fetchable inline style values) so it can't affect the app.
 */
export const PrintableThread: React.FC<PrintableThreadProps> = ({ email, threadEmails }) => {
  const isPrinting = useIsPrinting();
  if (!isPrinting) {
    return null;
  }
  return <PrintableThreadContent email={email} threadEmails={threadEmails} />;
};

const PrintableThreadContent: React.FC<PrintableThreadProps> = ({ email, threadEmails }) => {
  const { t } = useTranslation();
  const emails = threadEmails.length > 0 ? threadEmails : [email];

  return (
    // Hidden on screen and laid out for paper by email-thread-print.css. No inline
    // styles here: they would outrank the @media print rules.
    <div id="printable-email-thread">
      <div className="print-thread-subject">{email.subject}</div>

      {emails.map(msg => (
        <div key={msg.id} className="print-message">
          <div className="print-message-header">
            <strong>{t('printableThread.from')}</strong> {msg.from}
            {msg.to && (
              <>
                &nbsp;&nbsp;<strong>{t('printableThread.to')}</strong> {msg.to}
              </>
            )}
            &nbsp;&nbsp;
            <strong>{t('printableThread.date')}</strong> {msg.receivedAt ? humanizeTimestamp(msg.receivedAt) : ''}
          </div>
          <div
            className="print-message-body"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: toPrintSafeEmailHtml(sanitizeAndProcessHtml(msg.htmlBody || msg.body || '', msg.attachments)),
            }}
          />
        </div>
      ))}
    </div>
  );
};

export default PrintableThread;
