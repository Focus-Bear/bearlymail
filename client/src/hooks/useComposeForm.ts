import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Contact } from 'types/contact';

import { EMAIL_FIELD_CC, EMAIL_FIELD_TO } from 'constants/strings';

interface Recipient {
  email: string;
  name?: string;
}

export const useComposeForm = () => {
  const [searchParams] = useSearchParams();

  const [to, setTo] = useState<Recipient[]>([]);
  const [cc, setCc] = useState<Recipient[]>([]);
  const [bcc, setBcc] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);

  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  useEffect(() => {
    const toParam = searchParams.get('to');
    const subjectParam = searchParams.get('subject');
    if (toParam) {
      setTo([{ email: toParam }]);
    }
    if (subjectParam) {
      setSubject(subjectParam);
    }
  }, [searchParams]);

  const addRecipient = useCallback(
    (contact: Contact | { email: string; name?: string }, field: 'to' | 'cc' | 'bcc') => {
      const recipient: Recipient = {
        email: contact.email,
        name: 'name' in contact ? contact.name : undefined,
      };

      const getSetter = () => {
        if (field === EMAIL_FIELD_TO) {
          return setTo;
        }
        if (field === EMAIL_FIELD_CC) {
          return setCc;
        }
        return setBcc;
      };

      const setter = getSetter();
      setter(prev => {
        if (prev.some(existingRecipient => existingRecipient.email.toLowerCase() === recipient.email.toLowerCase())) {
          return prev;
        }
        return [...prev, recipient];
      });
    },
    []
  );

  const removeRecipient = useCallback((email: string, field: 'to' | 'cc' | 'bcc') => {
    const getSetter = () => {
      if (field === EMAIL_FIELD_TO) {
        return setTo;
      }
      if (field === EMAIL_FIELD_CC) {
        return setCc;
      }
      return setBcc;
    };

    const setter = getSetter();
    setter(prev => prev.filter(recipient => recipient.email !== email));
  }, []);

  return {
    to,
    cc,
    bcc,
    subject,
    body,
    attachments,
    showCc,
    showBcc,
    setTo,
    setCc,
    setBcc,
    setSubject,
    setBody,
    setAttachments,
    setShowCc,
    setShowBcc,
    addRecipient,
    removeRecipient,
  };
};
