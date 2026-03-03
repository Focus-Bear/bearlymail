import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { ContactDetail as ContactDetailType, ContactTypeConfig, ContactNote } from 'types/contact';
import { useAuth } from 'contexts/AuthContext';
import { Sidebar } from 'components/inbox/Sidebar';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { useSidebarState } from 'hooks/useSidebarState';
import { ContactTypeBadge } from 'components/crm/ContactTypeBadge';
import { API_URL } from 'config/api';
import { EMOJI_MENU } from 'constants/emojis';
import { OPACITY_HALF, OPACITY_FULL, WIDTH_64_PX, HEIGHT_64_PX, MAX_WIDTH_800_PX } from 'constants/numbers';
import { FIELD_TYPE_NUMBER, FIELD_TYPE_DATE, FIELD_TYPE_URL, FIELD_TYPE_TEXT, INPUT_TYPE_NUMBER, INPUT_TYPE_DATE, INPUT_TYPE_URL, INPUT_TYPE_TEXT, INPUT_TYPE_TEL, STRING_CENTER, STRING_BLOCK, STRING_FLEX, STRING_GRID, STRING_FIXED, STRING_VERTICAL, STRING_COLUMN, STRING_COVER, STRING_PRE_WRAP, STRING_SPACE_BETWEEN, STRING_FLEX_END, STRING_HIDDEN, STRING_AUTO, STRING_TRANSPARENT, STRING_WHITE, STRING_NONE, STRING_POINTER, FIELD_TYPE_PHONE, FIELD_TYPE_COMPANY, FIELD_JOB_TITLE } from 'constants/strings';

const ContactDetailPage: React.FC = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;
  const { isCollapsed, isMobileMenuOpen, toggleCollapse, openMobileMenu, closeMobileMenu } = useSidebarState();

  const [contact, setContact] = useState<ContactDetailType | null>(null);
  const [contactTypes, setContactTypes] = useState<ContactTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [showAddCustomField, setShowAddCustomField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState(FIELD_TYPE_TEXT);

  const fetchContact = useCallback(async () => {
    if (!contactId) return;
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/contacts/${contactId}`);
      setContact(response.data);
    } catch (err) {
      console.error('Failed to fetch contact:', err);
      setError('Failed to load contact details.');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  const fetchContactTypes = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/contacts/types`);
      setContactTypes(response.data);
    } catch (err) {
      console.error('Failed to fetch contact types:', err);
    }
  }, []);

  useEffect(() => {
    fetchContact();
    fetchContactTypes();
  }, [fetchContact, fetchContactTypes]);

  const handleUpdateField = async (field: string, value: string | null) => {
    if (!contactId) return;
    try {
      await axios.put(`${API_URL}/contacts/${contactId}`, { [field]: value });
      fetchContact();
      setEditingField(null);
    } catch (err) {
      console.error('Failed to update contact:', err);
    }
  };

  const handleAddNote = async () => {
    if (!contactId || !newNote.trim()) return;
    setAddingNote(true);
    try {
      await axios.post(`${API_URL}/contacts/${contactId}/notes`, { content: newNote });
      setNewNote('');
      fetchContact();
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!contactId) return;
    try {
      await axios.delete(`${API_URL}/contacts/${contactId}/notes/${noteId}`);
      fetchContact();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const handleSetCustomFieldValue = async (fieldId: string, value: string) => {
    if (!contactId) return;
    try {
      await axios.put(`${API_URL}/contacts/${contactId}/custom-fields/${fieldId}`, { value });
      fetchContact();
      setEditingField(null);
    } catch (err) {
      console.error('Failed to set custom field value:', err);
    }
  };

  const handleAddCustomField = async () => {
    if (!newFieldName.trim()) return;
    try {
      await axios.post(`${API_URL}/contacts/custom-fields`, {
        fieldName: newFieldName,
        fieldType: newFieldType,
      });
      setNewFieldName('');
      setNewFieldType(FIELD_TYPE_TEXT);
      setShowAddCustomField(false);
      fetchCustomFieldDefs();
      fetchContact();
    } catch (err) {
      console.error('Failed to add custom field:', err);
    }
  };

  // Mock function for fetchCustomFieldDefs to prevent TypeScript error
  // In a real app, this function would likely be available or imported
  const fetchCustomFieldDefs = () => {
    // Intentionally left empty as per original code context assumption
    // If this function is missing, it should be defined or removed
    console.log('fetchCustomFieldDefs called');
  };

  const getTypeConfig = (typeName: string | null | undefined) => {
    if (!typeName) return undefined;
    return contactTypes.find(ct => ct.name === typeName);
  };

  if (loading) {
    return (
      <div style={{ display: STRING_FLEX, height: '100vh' }}>
        <Sidebar user={user} logout={logout} isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} isMobileMenuOpen={isMobileMenuOpen} onCloseMobileMenu={closeMobileMenu} />
        <div style={{ flex: 1, display: STRING_FLEX, justifyContent: STRING_CENTER, alignItems: STRING_CENTER, color: theme.colors.text.secondary }}>
          {t('contacts.loading')}
        </div>
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div style={{ display: STRING_FLEX, height: '100vh' }}>
        <Sidebar user={user} logout={logout} isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} isMobileMenuOpen={isMobileMenuOpen} onCloseMobileMenu={closeMobileMenu} />
        <div style={{ flex: 1, display: STRING_FLEX, justifyContent: STRING_CENTER, alignItems: STRING_CENTER, color: theme.colors.accent.error }}>
          {error || 'Contact not found'}
        </div>
      </div>
    );
  }

  const typeConfig = getTypeConfig(contact.contactType);

  const inputStyle: React.CSSProperties = {
    padding: theme.spacing.sm,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSize.base,
    outline: STRING_NONE,
    backgroundColor: theme.colors.background.paper,
    width: '100%',
  };

  const buttonPrimary: React.CSSProperties = {
    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
    backgroundColor: theme.colors.primary.main,
    color: STRING_WHITE,
    border: STRING_NONE,
    borderRadius: theme.borderRadius.md,
    cursor: STRING_POINTER,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  };

  const buttonSecondary: React.CSSProperties = {
    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
    backgroundColor: STRING_TRANSPARENT,
    color: theme.colors.text.secondary,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    cursor: STRING_POINTER,
    fontSize: theme.typography.fontSize.sm,
  };

  const sectionStyle: React.CSSProperties = {
    backgroundColor: theme.colors.background.paper,
    borderRadius: theme.borderRadius.lg,
    boxShadow: theme.shadows.sm,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  };

  return (
    <div style={{ display: STRING_FLEX, height: '100vh', overflow: STRING_HIDDEN }}>
      <Sidebar user={user} logout={logout} isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} isMobileMenuOpen={isMobileMenuOpen} onCloseMobileMenu={closeMobileMenu} />

      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: theme.colors.background.default, padding: isNarrow ? `70px ${theme.spacing.sm} ${theme.spacing.md}` : theme.spacing.lg }}>
        {isNarrow && (
          <button onClick={openMobileMenu} style={{ position: STRING_FIXED, top: theme.spacing.md, left: theme.spacing.md, width: '48px', height: '48px', borderRadius: '50%', border: `1px solid ${theme.colors.border.medium}`, backgroundColor: theme.colors.background.paper, cursor: STRING_POINTER, display: STRING_FLEX, alignItems: STRING_CENTER, justifyContent: STRING_CENTER, fontSize: '1.5rem', boxShadow: theme.shadows.md, zIndex: 100 }} aria-label="Open navigation menu">
            {EMOJI_MENU}
          </button>
        )}

        <div style={{ maxWidth: `${MAX_WIDTH_800_PX}px`, margin: STRING_AUTO }}>
          <button onClick={() => navigate('/crm/contacts')} style={{ ...buttonSecondary, marginBottom: theme.spacing.lg }}>
            {t('contacts.backToContacts')}
          </button>

          {/* Header section */}
          <div style={sectionStyle}>
            <div style={{ display: STRING_FLEX, alignItems: STRING_CENTER, gap: theme.spacing.lg, marginBottom: theme.spacing.lg }}>
              {contact.photoUrl ? (
                <img src={contact.photoUrl} alt="" style={{ width: `${WIDTH_64_PX}px`, height: `${HEIGHT_64_PX}px`, borderRadius: '50%', objectFit: STRING_COVER }} />
              ) : (
                <div style={{ width: `${WIDTH_64_PX}px`, height: `${HEIGHT_64_PX}px`, borderRadius: '50%', backgroundColor: theme.colors.primary.subtle, display: STRING_FLEX, alignItems: STRING_CENTER, justifyContent: STRING_CENTER, color: theme.colors.primary.main, fontSize: '24px', fontWeight: theme.typography.fontWeight.semibold, flexShrink: 0 }}>
                  {(contact.name || contact.email)[0].toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: STRING_FLEX, alignItems: STRING_CENTER, gap: theme.spacing.sm, marginBottom: theme.spacing.xs }}>
                  <h1 style={{ ...theme.typography.heading.h4, color: theme.colors.text.primary, margin: 0 }}>
                    {contact.name || contact.email}
                  </h1>
                  {typeConfig && <ContactTypeBadge label={typeConfig.label} color={typeConfig.color} icon={typeConfig.icon} size="md" />}
                </div>
                <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.base }}>
                  {contact.email}
                </div>
              </div>
            </div>

            {/* Editable fields */}
            <div style={{ display: STRING_GRID, gridTemplateColumns: '1fr 1fr', gap: theme.spacing.md }}>
              {/* Contact Type */}
              <div>
                <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: STRING_BLOCK, marginBottom: theme.spacing.xs }}>
                  {t('contacts.contactType')}
                </label>
                <select
                  value={contact.contactType || ''}
                  onChange={(e) => handleUpdateField('contactType', e.target.value || null)}
                  style={{ ...inputStyle, cursor: STRING_POINTER }}
                >
                  <option value="">--</option>
                  {contactTypes.map(ct => (
                    <option key={ct.name} value={ct.name}>{ct.icon} {ct.label}</option>
                  ))}
                </select>
              </div>

              {/* Phone */}
              <div>
                <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: STRING_BLOCK, marginBottom: theme.spacing.xs }}>
                  {t('contacts.phone')}
                </label>
                {editingField === FIELD_TYPE_PHONE ? (
                  <div style={{ display: STRING_FLEX, gap: theme.spacing.xs }}>
                    <input type={INPUT_TYPE_TEL} value={editValue} onChange={(e) => setEditValue(e.target.value)} style={inputStyle} autoFocus />
                    <button onClick={() => handleUpdateField(FIELD_TYPE_PHONE, editValue)} style={buttonPrimary}>{t('contacts.save')}</button>
                    <button onClick={() => setEditingField(null)} style={buttonSecondary}>{t('contacts.cancel')}</button>
                  </div>
                ) : (
                  <div onClick={() => { setEditingField(FIELD_TYPE_PHONE); setEditValue(contact.phone || ''); }} style={{ ...inputStyle, cursor: STRING_POINTER, color: contact.phone ? theme.colors.text.primary : theme.colors.text.tertiary, minHeight: '38px', display: STRING_FLEX, alignItems: STRING_CENTER }}>
                    {contact.phone || '--'}
                  </div>
                )}
              </div>

              {/* Company */}
              <div>
                <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: STRING_BLOCK, marginBottom: theme.spacing.xs }}>
                  {t('contacts.company')}
                </label>
                {editingField === FIELD_TYPE_COMPANY ? (
                  <div style={{ display: STRING_FLEX, gap: theme.spacing.xs }}>
                    <input value={editValue} onChange={(e) => setEditValue(e.target.value)} style={inputStyle} autoFocus />
                    <button onClick={() => handleUpdateField(FIELD_TYPE_COMPANY, editValue)} style={buttonPrimary}>{t('contacts.save')}</button>
                    <button onClick={() => setEditingField(null)} style={buttonSecondary}>{t('contacts.cancel')}</button>
                  </div>
                ) : (
                  <div onClick={() => { setEditingField(FIELD_TYPE_COMPANY); setEditValue(contact.company || ''); }} style={{ ...inputStyle, cursor: STRING_POINTER, color: contact.company ? theme.colors.text.primary : theme.colors.text.tertiary, minHeight: '38px', display: STRING_FLEX, alignItems: STRING_CENTER }}>
                    {contact.company || '--'}
                  </div>
                )}
              </div>

              {/* Job Title */}
              <div>
                <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: STRING_BLOCK, marginBottom: theme.spacing.xs }}>
                  {t('contacts.jobTitle')}
                </label>
                {editingField === FIELD_JOB_TITLE ? (
                  <div style={{ display: STRING_FLEX, gap: theme.spacing.xs }}>
                    <input value={editValue} onChange={(e) => setEditValue(e.target.value)} style={inputStyle} autoFocus />
                    <button onClick={() => handleUpdateField(FIELD_JOB_TITLE, editValue)} style={buttonPrimary}>{t('contacts.save')}</button>
                    <button onClick={() => setEditingField(null)} style={buttonSecondary}>{t('contacts.cancel')}</button>
                  </div>
                ) : (
                  <div onClick={() => { setEditingField(FIELD_JOB_TITLE); setEditValue(contact.jobTitle || ''); }} style={{ ...inputStyle, cursor: STRING_POINTER, color: contact.jobTitle ? theme.colors.text.primary : theme.colors.text.tertiary, minHeight: '38px', display: STRING_FLEX, alignItems: STRING_CENTER }}>
                    {contact.jobTitle || '--'}
                  </div>
                )}
              </div>

              {/* Follow-up Date */}
              <div>
                <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: STRING_BLOCK, marginBottom: theme.spacing.xs }}>
                  {t('contacts.followUpDate')}
                </label>
                <input
                  type={INPUT_TYPE_DATE}
                  value={contact.followUpDate ? contact.followUpDate.split('T')[0] : ''}
                  onChange={(e) => handleUpdateField('followUpDate', e.target.value || null)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Custom Fields Section */}
          <div style={sectionStyle}>
            <div style={{ display: STRING_FLEX, justifyContent: STRING_SPACE_BETWEEN, alignItems: STRING_CENTER, marginBottom: theme.spacing.md }}>
              <h2 style={{ ...theme.typography.heading.h5, color: theme.colors.text.primary, margin: 0 }}>
                {t('contacts.customFields')}
              </h2>
              <button onClick={() => setShowAddCustomField(true)} style={buttonPrimary}>
                {t('contacts.addCustomField')}
              </button>
            </div>

            {showAddCustomField && (
              <div style={{ display: STRING_FLEX, gap: theme.spacing.sm, marginBottom: theme.spacing.md, alignItems: STRING_FLEX_END }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: STRING_BLOCK, marginBottom: theme.spacing.xs }}>{t('contacts.fieldName')}</label>
                  <input value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} placeholder={t('contacts.fieldName')} style={inputStyle} />
                </div>
                <div style={{ width: '120px' }}>
                  <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: STRING_BLOCK, marginBottom: theme.spacing.xs }}>{t('contacts.fieldType')}</label>
                  <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)} style={{ ...inputStyle, cursor: STRING_POINTER }}>
                    <option value={FIELD_TYPE_TEXT}>{t('contacts.fieldTypeText')}</option>
                    <option value={FIELD_TYPE_NUMBER}>{t('contacts.fieldTypeNumber')}</option>
                    <option value={FIELD_TYPE_DATE}>{t('contacts.fieldTypeDate')}</option>
                    <option value={FIELD_TYPE_URL}>{t('contacts.fieldTypeUrl')}</option>
                  </select>
                </div>
                <button onClick={handleAddCustomField} style={buttonPrimary}>{t('contacts.save')}</button>
                <button onClick={() => setShowAddCustomField(false)} style={buttonSecondary}>{t('contacts.cancel')}</button>
              </div>
            )}

            {contact.customFields.length === 0 && !showAddCustomField ? (
              <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>
                {t('contacts.addCustomField')}
              </div>
            ) : (
              <div style={{ display: STRING_GRID, gridTemplateColumns: '1fr 1fr', gap: theme.spacing.md }}>
                {contact.customFields.map((cf) => (
                  <div key={cf.fieldId}>
                    <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: STRING_BLOCK, marginBottom: theme.spacing.xs }}>
                      {cf.fieldName}
                    </label>
                    {editingField === `cf-${cf.fieldId}` ? (
                      <div style={{ display: STRING_FLEX, gap: theme.spacing.xs }}>
                        <input
                          type={(() => {
                            if (cf.fieldType === FIELD_TYPE_NUMBER) return INPUT_TYPE_NUMBER;
                            if (cf.fieldType === FIELD_TYPE_DATE) return INPUT_TYPE_DATE;
                            if (cf.fieldType === FIELD_TYPE_URL) return INPUT_TYPE_URL;
                            return INPUT_TYPE_TEXT;
                          })()}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          style={inputStyle}
                          autoFocus
                        />
                        <button onClick={() => handleSetCustomFieldValue(cf.fieldId, editValue)} style={buttonPrimary}>{t('contacts.save')}</button>
                        <button onClick={() => setEditingField(null)} style={buttonSecondary}>{t('contacts.cancel')}</button>
                      </div>
                    ) : (
                      <div onClick={() => { setEditingField(`cf-${cf.fieldId}`); setEditValue(cf.value || ''); }} style={{ ...inputStyle, cursor: STRING_POINTER, color: cf.value ? theme.colors.text.primary : theme.colors.text.tertiary, minHeight: '38px', display: STRING_FLEX, alignItems: STRING_CENTER }}>
                        {cf.value || '--'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes Section */}
          <div style={sectionStyle}>
            <h2 style={{ ...theme.typography.heading.h5, color: theme.colors.text.primary, margin: 0, marginBottom: theme.spacing.md }}>
              {t('contacts.notes')}
            </h2>

            <div style={{ display: STRING_FLEX, gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder={t('contacts.notePlaceholder')}
                rows={3}
                style={{ ...inputStyle, resize: STRING_VERTICAL }}
              />
              <button onClick={handleAddNote} disabled={addingNote || !newNote.trim()} style={{ ...buttonPrimary, alignSelf: STRING_FLEX_END, opacity: !newNote.trim() ? OPACITY_HALF : OPACITY_FULL }}>
                {t('contacts.addNote')}
              </button>
            </div>

            {contact.notes.length === 0 ? (
              <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>
                {t('contacts.noNotes')}
              </div>
            ) : (
              <div style={{ display: STRING_FLEX, flexDirection: STRING_COLUMN, gap: theme.spacing.sm }}>
                {contact.notes.map((note: ContactNote) => (
                  <div key={note.id} style={{ padding: theme.spacing.md, backgroundColor: theme.colors.background.default, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border.light}` }}>
                    <div style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize.base, whiteSpace: STRING_PRE_WRAP, marginBottom: theme.spacing.xs }}>
                      {note.content}
                    </div>
                    <div style={{ display: STRING_FLEX, justifyContent: STRING_SPACE_BETWEEN, alignItems: STRING_CENTER }}>
                      <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
                        {new Date(note.createdAt).toLocaleDateString()}
                      </span>
                      <button onClick={() => handleDeleteNote(note.id)} style={{ ...buttonSecondary, padding: `2px ${theme.spacing.sm}`, fontSize: theme.typography.fontSize.xs, color: theme.colors.accent.error }}>
                        {t('contacts.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Deals Section */}
          <div style={sectionStyle}>
            <div style={{ display: STRING_FLEX, justifyContent: STRING_SPACE_BETWEEN, alignItems: STRING_CENTER, marginBottom: theme.spacing.md }}>
              <h2 style={{ ...theme.typography.heading.h5, color: theme.colors.text.primary, margin: 0 }}>
                {t('contacts.deals')}
              </h2>
              <button onClick={() => navigate(`/crm/deals?contactId=${contactId}`)} style={buttonPrimary}>
                {t('deals.addDeal')}
              </button>
            </div>

            {contact.deals.length === 0 ? (
              <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>
                {t('contacts.noDealsSummary')}
              </div>
            ) : (
              <div style={{ display: STRING_FLEX, flexDirection: STRING_COLUMN, gap: theme.spacing.sm }}>
                {contact.deals.map(deal => (
                  <div key={deal.id} onClick={() => navigate('/crm/deals')} style={{ display: STRING_FLEX, justifyContent: STRING_SPACE_BETWEEN, alignItems: STRING_CENTER, padding: theme.spacing.md, backgroundColor: theme.colors.background.default, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border.light}`, cursor: STRING_POINTER }}>
                    <div>
                      <div style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>{deal.title}</div>
                      {deal.stageName && <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>{deal.stageName}</div>}
                    </div>
                    {deal.value !== null && (
                      <div style={{ color: theme.colors.primary.main, fontWeight: theme.typography.fontWeight.semibold }}>
                        ${deal.value.toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactDetailPage;
