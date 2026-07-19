import './email-thread-print.css';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Email } from 'types/email';
import { humanizeTimestamp } from 'utils/dateUtils';
import { sanitizeAndProcessHtml } from 'utils/emailBodyUtils';

interface PrintableThreadProps {
  email: Email;
  threadEmails: Email[];
}

/**
 * A hidden element (visibility: hidden in normal view) that becomes visible
 * when the user triggers browser print (Ctrl+P / Cmd+P or window.print()).
 * The print stylesheet in email-thread-print.css hides all other DOM nodes and
 * reveals only this container so the printed page looks clean.
 *
 * HTML sanitization: email bodies are sanitized with DOMPurify before rendering
 * to prevent XSS from malicious email content, even in this print-only context.
 */
export const PrintableThread: React.FC<PrintableThreadProps> = ({ email, threadEmails }) => {
  const { t } = useTranslation();
  const emails = threadEmails.length > 0 ? threadEmails : [email];

  return (
    <div
      id="printable-email-thread"
      style={{
        visibility: 'hidden', // hidden during normal rendering; shown via @media print
        position: 'absolute',
        left: '-9999px',
        top: 0,
      }}
    >
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
            dangerouslySetInnerHTML={{ __html: sanitizeAndProcessHtml(msg.htmlBody || msg.body || '', msg.attachments) }}
          />
        </div>
      ))}
    </div>
  );
};

export default PrintableThread;