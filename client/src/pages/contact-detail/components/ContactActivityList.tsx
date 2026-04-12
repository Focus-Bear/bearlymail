import React from 'react';
import { theme } from 'theme/theme';
import { ContactDealSummary, ContactDetail, ContactNote } from 'types/contact';

import { OPACITY_FULL, OPACITY_HALF } from 'constants/numbers';

interface Props {
  contact: ContactDetail;
  newNote: string;
  addingNote: boolean;
  onNewNoteChange: (v: string) => void;
  onAddNote: () => void;
  onDeleteNote: (id: string) => void;
  sectionStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  buttonPrimary: React.CSSProperties;
  buttonSecondary: React.CSSProperties;
  dealsOnView: () => void;
  dealsOnAdd: () => void;
  t: (tKey: string) => string;
}

interface ContactNotesListProps {
  contact: ContactDetail;
  newNote: string;
  addingNote: boolean;
  onNewNoteChange: (v: string) => void;
  onAddNote: () => void;
  onDeleteNote: (id: string) => void;
  sectionStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  buttonPrimary: React.CSSProperties;
  buttonSecondary: React.CSSProperties;
  t: (tKey: string) => string;
}

const ContactNotesList: React.FC<ContactNotesListProps> = ({
  contact,
  newNote,
  addingNote,
  onNewNoteChange,
  onAddNote,
  onDeleteNote,
  sectionStyle,
  inputStyle,
  buttonPrimary,
  buttonSecondary,
  t,
}) => {
  const submitDisabled = addingNote || !newNote.trim();
  return (
    <div style={sectionStyle}>
      <h2
        style={{
          ...theme.typography.heading.h5,
          color: theme.colors.text.primary,
          margin: 0,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('contacts.notes')}
      </h2>
      <div style={{ display: 'flex', gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
        <textarea
          value={newNote}
          onChange={event => onNewNoteChange(event.target.value)}
          placeholder={t('contacts.notePlaceholder')}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <button
          onClick={onAddNote}
          disabled={submitDisabled}
          style={{ ...buttonPrimary, alignSelf: 'flex-end', opacity: !newNote.trim() ? OPACITY_HALF : OPACITY_FULL }}
        >
          {t('contacts.addNote')}
        </button>
      </div>
      {contact.notes.length === 0 ? (
        <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>
          {t('contacts.noNotes')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
          {contact.notes.map((note: ContactNote) => (
            <div
              key={note.id}
              style={{
                padding: theme.spacing.md,
                backgroundColor: theme.colors.background.default,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.border.light}`,
              }}
            >
              <div
                style={{
                  color: theme.colors.text.primary,
                  fontSize: theme.typography.fontSize.base,
                  whiteSpace: 'pre-wrap',
                  marginBottom: theme.spacing.xs,
                }}
              >
                {note.content}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
                  {new Date(note.createdAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => onDeleteNote(note.id)}
                  style={{
                    ...buttonSecondary,
                    padding: `2px ${theme.spacing.sm}`,
                    fontSize: theme.typography.fontSize.xs,
                    color: theme.colors.accent.error,
                  }}
                >
                  {t('contacts.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface ContactDealsListProps {
  contact: ContactDetail;
  sectionStyle: React.CSSProperties;
  buttonPrimary: React.CSSProperties;
  dealsOnView: () => void;
  dealsOnAdd: () => void;
  t: (tKey: string) => string;
}

const ContactDealsList: React.FC<ContactDealsListProps> = ({
  contact,
  sectionStyle,
  buttonPrimary,
  dealsOnView,
  dealsOnAdd,
  t,
}) => (
  <div style={sectionStyle}>
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}
    >
      <h2 style={{ ...theme.typography.heading.h5, color: theme.colors.text.primary, margin: 0 }}>
        {t('contacts.deals')}
      </h2>
      <button onClick={dealsOnAdd} style={buttonPrimary}>
        {t('deals.addDeal')}
      </button>
    </div>
    {contact.deals.length === 0 ? (
      <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>
        {t('contacts.noDealsSummary')}
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        {contact.deals.map((deal: ContactDealSummary) => (
          <div
            key={deal.id}
            onClick={dealsOnView}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: theme.spacing.md,
              backgroundColor: theme.colors.background.default,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.border.light}`,
              cursor: 'pointer',
            }}
          >
            <div>
              <div style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>
                {deal.title}
              </div>
              {deal.stageName && (
                <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                  {deal.stageName}
                </div>
              )}
            </div>
            {deal.value !== null && deal.value !== undefined && (
              <div style={{ color: theme.colors.primary.main, fontWeight: theme.typography.fontWeight.semibold }}>
                ${deal.value.toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

const ContactActivityList: React.FC<Props> = ({
  contact,
  newNote,
  addingNote,
  onNewNoteChange,
  onAddNote,
  onDeleteNote,
  sectionStyle,
  inputStyle,
  buttonPrimary,
  buttonSecondary,
  dealsOnView,
  dealsOnAdd,
  t,
}) => (
  <>
    <ContactNotesList
      contact={contact}
      newNote={newNote}
      addingNote={addingNote}
      onNewNoteChange={onNewNoteChange}
      onAddNote={onAddNote}
      onDeleteNote={onDeleteNote}
      sectionStyle={sectionStyle}
      inputStyle={inputStyle}
      buttonPrimary={buttonPrimary}
      buttonSecondary={buttonSecondary}
      t={t}
    />
    <ContactDealsList
      contact={contact}
      sectionStyle={sectionStyle}
      buttonPrimary={buttonPrimary}
      dealsOnView={dealsOnView}
      dealsOnAdd={dealsOnAdd}
      t={t}
    />
  </>
);

export default ContactActivityList;
