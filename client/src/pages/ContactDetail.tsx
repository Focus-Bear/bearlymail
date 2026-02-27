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
import { OPACITY_HALF, OPACITY_FULL } from 'constants/numbers';

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
  const [newFieldType, setNewFieldType] = useState('text');

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
      setNewFieldType('text');
      setShowAddCustomField(false);
      fetchCustomFieldDefs();
      fetchContact();
    } catch (err) {
      console.error('Failed to add custom field:', err);
    }
  };

  const getTypeConfig = (typeName: string | null | undefined) => {
    if (!typeName) return undefined;
    return contactTypes.find(ct => ct.name === typeName);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh' }}>
        <Sidebar user={user} logout={logout} isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} isMobileMenuOpen={isMobileMenuOpen} onCloseMobileMenu={closeMobileMenu} />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: theme.colors.text.secondary }}>
          {t('contacts.loading')}
        </div>
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div style={{ display: 'flex', height: '100vh' }}>
        <Sidebar user={user} logout={logout} isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} isMobileMenuOpen={isMobileMenuOpen} onCloseMobileMenu={closeMobileMenu} />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: theme.colors.accent.error }}>
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
    outline: 'none',
    backgroundColor: theme.colors.background.paper,
    width: '100%',
  };

  const buttonPrimary: React.CSSProperties = {
    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
    backgroundColor: theme.colors.primary.main,
    color: 'white',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  };

  const buttonSecondary: React.CSSProperties = {
    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
    backgroundColor: 'transparent',
    color: theme.colors.text.secondary,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar user={user} logout={logout} isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} isMobileMenuOpen={isMobileMenuOpen} onCloseMobileMenu={closeMobileMenu} />

      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: theme.colors.background.default, padding: isNarrow ? `70px ${theme.spacing.sm} ${theme.spacing.md}` : theme.spacing.lg }}>
        {isNarrow && (
          <button onClick={openMobileMenu} style={{ position: 'fixed', top: theme.spacing.md, left: theme.spacing.md, width: '48px', height: '48px', borderRadius: '50%', border: `1px solid ${theme.colors.border.medium}`, backgroundColor: theme.colors.background.paper, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', boxShadow: theme.shadows.md, zIndex: 100 }} aria-label="Open navigation menu">
            {EMOJI_MENU}
          </button>
        )}

        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <button onClick={() => navigate('/crm/contacts')} style={{ ...buttonSecondary, marginBottom: theme.spacing.lg }}>
            {t('contacts.backToContacts')}
          </button>

          {/* Header section */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.lg, marginBottom: theme.spacing.lg }}>
              {contact.photoUrl ? (
                <img src={contact.photoUrl} alt="" style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: theme.colors.primary.subtle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.primary.main, fontSize: '24px', fontWeight: theme.typography.fontWeight.semibold, flexShrink: 0 }}>
                  {(contact.name || contact.email)[0].toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.xs }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.md }}>
              {/* Contact Type */}
              <div>
                <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: 'block', marginBottom: theme.spacing.xs }}>
                  {t('contacts.contactType')}
                </label>
                <select
                  value={contact.contactType || ''}
                  onChange={(e) => handleUpdateField('contactType', e.target.value || null)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">--</option>
                  {contactTypes.map(ct => (
                    <option key={ct.name} value={ct.name}>{ct.icon} {ct.label}</option>
                  ))}
                </select>
              </div>

              {/* Phone */}
              <div>
                <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: 'block', marginBottom: theme.spacing.xs }}>
                  {t('contacts.phone')}
                </label>
                {editingField === 'phone' ? (
                  <div style={{ display: 'flex', gap: theme.spacing.xs }}>
                    <input type="tel" value={editValue} onChange={(e) => setEditValue(e.target.value)} style={inputStyle} autoFocus />
                    <button onClick={() => handleUpdateField('phone', editValue)} style={buttonPrimary}>{t('contacts.save')}</button>
                    <button onClick={() => setEditingField(null)} style={buttonSecondary}>{t('contacts.cancel')}</button>
                  </div>
                ) : (
                  <div onClick={() => { setEditingField('phone'); setEditValue(contact.phone || ''); }} style={{ ...inputStyle, cursor: 'pointer', color: contact.phone ? theme.colors.text.primary : theme.colors.text.tertiary, minHeight: '38px', display: 'flex', alignItems: 'center' }}>
                    {contact.phone || '--'}
                  </div>
                )}
              </div>

              {/* Company */}
              <div>
                <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: 'block', marginBottom: theme.spacing.xs }}>
                  {t('contacts.company')}
                </label>
                {editingField === 'company' ? (
                  <div style={{ display: 'flex', gap: theme.spacing.xs }}>
                    <input value={editValue} onChange={(e) => setEditValue(e.target.value)} style={inputStyle} autoFocus />
                    <button onClick={() => handleUpdateField('company', editValue)} style={buttonPrimary}>{t('contacts.save')}</button>
                    <button onClick={() => setEditingField(null)} style={buttonSecondary}>{t('contacts.cancel')}</button>
                  </div>
                ) : (
                  <div onClick={() => { setEditingField('company'); setEditValue(contact.company || ''); }} style={{ ...inputStyle, cursor: 'pointer', color: contact.company ? theme.colors.text.primary : theme.colors.text.tertiary, minHeight: '38px', display: 'flex', alignItems: 'center' }}>
                    {contact.company || '--'}
                  </div>
                )}
              </div>

              {/* Job Title */}
              <div>
                <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: 'block', marginBottom: theme.spacing.xs }}>
                  {t('contacts.jobTitle')}
                </label>
                {editingField === 'jobTitle' ? (
                  <div style={{ display: 'flex', gap: theme.spacing.xs }}>
                    <input value={editValue} onChange={(e) => setEditValue(e.target.value)} style={inputStyle} autoFocus />
                    <button onClick={() => handleUpdateField('jobTitle', editValue)} style={buttonPrimary}>{t('contacts.save')}</button>
                    <button onClick={() => setEditingField(null)} style={buttonSecondary}>{t('contacts.cancel')}</button>
                  </div>
                ) : (
                  <div onClick={() => { setEditingField('jobTitle'); setEditValue(contact.jobTitle || ''); }} style={{ ...inputStyle, cursor: 'pointer', color: contact.jobTitle ? theme.colors.text.primary : theme.colors.text.tertiary, minHeight: '38px', display: 'flex', alignItems: 'center' }}>
                    {contact.jobTitle || '--'}
                  </div>
                )}
              </div>

              {/* Follow-up Date */}
              <div>
                <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: 'block', marginBottom: theme.spacing.xs }}>
                  {t('contacts.followUpDate')}
                </label>
                <input
                  type="date"
                  value={contact.followUpDate ? contact.followUpDate.split('T')[0] : ''}
                  onChange={(e) => handleUpdateField('followUpDate', e.target.value || null)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Custom Fields Section */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
              <h2 style={{ ...theme.typography.heading.h5, color: theme.colors.text.primary, margin: 0 }}>
                {t('contacts.customFields')}
              </h2>
              <button onClick={() => setShowAddCustomField(true)} style={buttonPrimary}>
                {t('contacts.addCustomField')}
              </button>
            </div>

            {showAddCustomField && (
              <div style={{ display: 'flex', gap: theme.spacing.sm, marginBottom: theme.spacing.md, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: 'block', marginBottom: theme.spacing.xs }}>{t('contacts.fieldName')}</label>
                  <input value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} placeholder={t('contacts.fieldName')} style={inputStyle} />
                </div>
                <div style={{ width: '120px' }}>
                  <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: 'block', marginBottom: theme.spacing.xs }}>{t('contacts.fieldType')}</label>
                  <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="text">{t('contacts.fieldTypeText')}</option>
                    <option value="number">{t('contacts.fieldTypeNumber')}</option>
                    <option value="date">{t('contacts.fieldTypeDate')}</option>
                    <option value="url">{t('contacts.fieldTypeUrl')}</option>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.md }}>
                {contact.customFields.map((cf) => (
                  <div key={cf.fieldId}>
                    <label style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, display: 'block', marginBottom: theme.spacing.xs }}>
                      {cf.fieldName}
                    </label>
                    {editingField === `cf-${cf.fieldId}` ? (
                      <div style={{ display: 'flex', gap: theme.spacing.xs }}>
                        <input
                          type={cf.fieldType === 'number' ? 'number' : cf.fieldType === 'date' ? 'date' : cf.fieldType === 'url' ? 'url' : 'text'}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          style={inputStyle}
                          autoFocus
                        />
                        <button onClick={() => handleSetCustomFieldValue(cf.fieldId, editValue)} style={buttonPrimary}>{t('contacts.save')}</button>
                        <button onClick={() => setEditingField(null)} style={buttonSecondary}>{t('contacts.cancel')}</button>
                      </div>
                    ) : (
                      <div onClick={() => { setEditingField(`cf-${cf.fieldId}`); setEditValue(cf.value || ''); }} style={{ ...inputStyle, cursor: 'pointer', color: cf.value ? theme.colors.text.primary : theme.colors.text.tertiary, minHeight: '38px', display: 'flex', alignItems: 'center' }}>
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

            <div style={{ display: 'flex', gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder={t('contacts.notePlaceholder')}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <button onClick={handleAddNote} disabled={addingNote || !newNote.trim()} style={{ ...buttonPrimary, alignSelf: 'flex-end', opacity: !newNote.trim() ? OPACITY_HALF : OPACITY_FULL }}>
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
                  <div key={note.id} style={{ padding: theme.spacing.md, backgroundColor: theme.colors.background.default, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border.light}` }}>
                    <div style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize.base, whiteSpace: 'pre-wrap', marginBottom: theme.spacing.xs }}>
                      {note.content}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
                {contact.deals.map(deal => (
                  <div key={deal.id} onClick={() => navigate('/crm/deals')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.md, backgroundColor: theme.colors.background.default, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border.light}`, cursor: 'pointer' }}>
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
