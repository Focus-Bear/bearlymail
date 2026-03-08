import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { theme } from 'theme/theme';

import { Sidebar } from 'components/inbox/Sidebar';
import { EMOJI_MENU } from 'constants/emojis';
import { HEIGHT_64_PX, MAX_WIDTH_800_PX, WIDTH_64_PX } from 'constants/numbers';
import {
  FIELD_JOB_TITLE,
  FIELD_TYPE_COMPANY,
  FIELD_TYPE_DATE,
  FIELD_TYPE_NUMBER,
  FIELD_TYPE_PHONE,
  FIELD_TYPE_TEXT,
  FIELD_TYPE_URL,
  INPUT_TYPE_DATE,
  INPUT_TYPE_NUMBER,
  INPUT_TYPE_TEL,
  INPUT_TYPE_TEXT,
  INPUT_TYPE_URL,
  STRING_AUTO,
  STRING_BLOCK,
  STRING_CENTER,
  STRING_FIXED,
  STRING_FLEX,
  STRING_FLEX_END,
  STRING_GRID,
  STRING_HIDDEN,
  STRING_NONE,
  STRING_POINTER,
  STRING_SPACE_BETWEEN,
  STRING_TRANSPARENT,
  STRING_WHITE,
} from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { useSidebarState } from 'hooks/useSidebarState';

import ContactActivityList from './contact-detail/components/ContactActivityList';
import ContactDetailHeader from './contact-detail/components/ContactDetailHeader';
import useContactActions from './contact-detail/hooks/useContactActions';
import useContactDetailData from './contact-detail/hooks/useContactDetailData';

interface EditableFieldProps {
  label: string;
  value: string | null | undefined;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onEditValueChange: (v: string) => void;
  inputType?: string;
  inputStyle: React.CSSProperties;
  buttonPrimary: React.CSSProperties;
  buttonSecondary: React.CSSProperties;
  saveLabel: string;
  cancelLabel: string;
}

const EditableField: React.FC<EditableFieldProps> = ({
  label,
  value,
  isEditing,
  editValue,
  onStartEdit,
  onSave,
  onCancel,
  onEditValueChange,
  inputType = INPUT_TYPE_TEXT,
  inputStyle,
  buttonPrimary,
  buttonSecondary,
  saveLabel,
  cancelLabel,
}) => {
  return (
    <div>
      <label
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          display: STRING_BLOCK,
          marginBottom: theme.spacing.xs,
        }}
      >
        {label}
      </label>
      {isEditing ? (
        <div style={{ display: STRING_FLEX, gap: theme.spacing.xs }}>
          <input
            type={inputType}
            value={editValue}
            onChange={event => onEditValueChange(event.target.value)}
            style={inputStyle}
            autoFocus
          />
          <button onClick={onSave} style={buttonPrimary}>
            {saveLabel}
          </button>
          <button onClick={onCancel} style={buttonSecondary}>
            {cancelLabel}
          </button>
        </div>
      ) : (
        <div
          onClick={onStartEdit}
          style={{
            ...inputStyle,
            cursor: STRING_POINTER,
            color: value ? theme.colors.text.primary : theme.colors.text.tertiary,
            minHeight: '38px',
            display: STRING_FLEX,
            alignItems: STRING_CENTER,
          }}
        >
          {value || '--'}
        </div>
      )}
    </div>
  );
};

const ContactDetailPage: React.FC = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;
  const { isCollapsed, isMobileMenuOpen, toggleCollapse, openMobileMenu, closeMobileMenu } = useSidebarState();

  const { contact, contactTypes, loading, error, fetchContact, getTypeConfig } = useContactDetailData(contactId);
  const { handleUpdateField, handleAddNote, handleDeleteNote, handleSetCustomFieldValue, handleAddCustomField } =
    useContactActions(contactId, fetchContact);

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [showAddCustomField, setShowAddCustomField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState(FIELD_TYPE_TEXT);

  useEffect(() => {
    // keep local state in sync if contact changes externally
    if (contact && editingField === null) {
      setEditValue('');
    }
  }, [contact, editingField]);

  if (loading) {
    return (
      <div style={{ display: STRING_FLEX, height: '100vh' }}>
        <Sidebar
          user={user}
          logout={logout}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          isMobileMenuOpen={isMobileMenuOpen}
          onCloseMobileMenu={closeMobileMenu}
        />
        <div
          style={{
            flex: 1,
            display: STRING_FLEX,
            justifyContent: STRING_CENTER,
            alignItems: STRING_CENTER,
            color: theme.colors.text.secondary,
          }}
        >
          {t('contacts.loading')}
        </div>
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div style={{ display: STRING_FLEX, height: '100vh' }}>
        <Sidebar
          user={user}
          logout={logout}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          isMobileMenuOpen={isMobileMenuOpen}
          onCloseMobileMenu={closeMobileMenu}
        />
        <div
          style={{
            flex: 1,
            display: STRING_FLEX,
            justifyContent: STRING_CENTER,
            alignItems: STRING_CENTER,
            color: theme.colors.accent.error,
          }}
        >
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
      <Sidebar
        user={user}
        logout={logout}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={closeMobileMenu}
      />

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: theme.colors.background.default,
          padding: isNarrow ? `70px ${theme.spacing.sm} ${theme.spacing.md}` : theme.spacing.lg,
        }}
      >
        {isNarrow && (
          <button
            onClick={openMobileMenu}
            style={{
              position: STRING_FIXED,
              top: theme.spacing.md,
              left: theme.spacing.md,
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: `1px solid ${theme.colors.border.medium}`,
              backgroundColor: theme.colors.background.paper,
              cursor: STRING_POINTER,
              display: STRING_FLEX,
              alignItems: STRING_CENTER,
              justifyContent: STRING_CENTER,
              fontSize: '1.5rem',
              boxShadow: theme.shadows.md,
              zIndex: 100,
            }}
            aria-label="Open navigation menu"
          >
            {EMOJI_MENU}
          </button>
        )}

        <div style={{ maxWidth: `${MAX_WIDTH_800_PX}px`, margin: STRING_AUTO }}>
          <button
            onClick={() => navigate('/crm/contacts')}
            style={{ ...buttonSecondary, marginBottom: theme.spacing.lg }}
          >
            {t('contacts.backToContacts')}
          </button>

          {/* Header section */}
          <div style={sectionStyle}>
            <ContactDetailHeader
              contact={contact}
              typeConfig={typeConfig}
              WIDTH_64_PX={WIDTH_64_PX}
              HEIGHT_64_PX={HEIGHT_64_PX}
            />

            {/* Editable fields */}
            <div style={{ display: STRING_GRID, gridTemplateColumns: '1fr 1fr', gap: theme.spacing.md }}>
              {/* Contact Type */}
              <div>
                <label
                  style={{
                    color: theme.colors.text.secondary,
                    fontSize: theme.typography.fontSize.sm,
                    display: STRING_BLOCK,
                    marginBottom: theme.spacing.xs,
                  }}
                >
                  {t('contacts.contactType')}
                </label>
                <select
                  value={contact.contactType || ''}
                  onChange={event => handleUpdateField('contactType', event.target.value || null)}
                  style={{ ...inputStyle, cursor: STRING_POINTER }}
                >
                  <option value="">--</option>
                  {contactTypes.map(ct => (
                    <option key={ct.name} value={ct.name}>
                      {ct.icon} {ct.label}
                    </option>
                  ))}
                </select>
              </div>
              <EditableField
                label={t('contacts.phone')}
                value={contact.phone}
                isEditing={editingField === FIELD_TYPE_PHONE}
                editValue={editValue}
                onStartEdit={() => {
                  setEditingField(FIELD_TYPE_PHONE);
                  setEditValue(contact.phone || '');
                }}
                onSave={() => {
                  handleUpdateField(FIELD_TYPE_PHONE, editValue);
                  setEditingField(null);
                }}
                onCancel={() => setEditingField(null)}
                onEditValueChange={setEditValue}
                inputType={INPUT_TYPE_TEL}
                inputStyle={inputStyle}
                buttonPrimary={buttonPrimary}
                buttonSecondary={buttonSecondary}
                saveLabel={t('contacts.save')}
                cancelLabel={t('contacts.cancel')}
              />
              <EditableField
                label={t('contacts.company')}
                value={contact.company}
                isEditing={editingField === FIELD_TYPE_COMPANY}
                editValue={editValue}
                onStartEdit={() => {
                  setEditingField(FIELD_TYPE_COMPANY);
                  setEditValue(contact.company || '');
                }}
                onSave={() => {
                  handleUpdateField(FIELD_TYPE_COMPANY, editValue);
                  setEditingField(null);
                }}
                onCancel={() => setEditingField(null)}
                onEditValueChange={setEditValue}
                inputStyle={inputStyle}
                buttonPrimary={buttonPrimary}
                buttonSecondary={buttonSecondary}
                saveLabel={t('contacts.save')}
                cancelLabel={t('contacts.cancel')}
              />
              <EditableField
                label={t('contacts.jobTitle')}
                value={contact.jobTitle}
                isEditing={editingField === FIELD_JOB_TITLE}
                editValue={editValue}
                onStartEdit={() => {
                  setEditingField(FIELD_JOB_TITLE);
                  setEditValue(contact.jobTitle || '');
                }}
                onSave={() => {
                  handleUpdateField(FIELD_JOB_TITLE, editValue);
                  setEditingField(null);
                }}
                onCancel={() => setEditingField(null)}
                onEditValueChange={setEditValue}
                inputStyle={inputStyle}
                buttonPrimary={buttonPrimary}
                buttonSecondary={buttonSecondary}
                saveLabel={t('contacts.save')}
                cancelLabel={t('contacts.cancel')}
              />
              {/* Follow-up Date */}
              <div>
                <label
                  style={{
                    color: theme.colors.text.secondary,
                    fontSize: theme.typography.fontSize.sm,
                    display: STRING_BLOCK,
                    marginBottom: theme.spacing.xs,
                  }}
                >
                  {t('contacts.followUpDate')}
                </label>
                <input
                  type={INPUT_TYPE_DATE}
                  value={contact.followUpDate ? contact.followUpDate.split('T')[0] : ''}
                  onChange={event => {
                    handleUpdateField('followUpDate', event.target.value || null);
                  }}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Custom Fields Section */}
          <div style={sectionStyle}>
            <div
              style={{
                display: STRING_FLEX,
                justifyContent: STRING_SPACE_BETWEEN,
                alignItems: STRING_CENTER,
                marginBottom: theme.spacing.md,
              }}
            >
              <h2 style={{ ...theme.typography.heading.h5, color: theme.colors.text.primary, margin: 0 }}>
                {t('contacts.customFields')}
              </h2>
              <button onClick={() => setShowAddCustomField(true)} style={buttonPrimary}>
                {t('contacts.addCustomField')}
              </button>
            </div>

            {showAddCustomField && (
              <div
                style={{
                  display: STRING_FLEX,
                  gap: theme.spacing.sm,
                  marginBottom: theme.spacing.md,
                  alignItems: STRING_FLEX_END,
                }}
              >
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.fontSize.sm,
                      display: STRING_BLOCK,
                      marginBottom: theme.spacing.xs,
                    }}
                  >
                    {t('contacts.fieldName')}
                  </label>
                  <input
                    value={newFieldName}
                    onChange={event => setNewFieldName(event.target.value)}
                    placeholder={t('contacts.fieldName')}
                    style={inputStyle}
                  />
                </div>
                <div style={{ width: '120px' }}>
                  <label
                    style={{
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.fontSize.sm,
                      display: STRING_BLOCK,
                      marginBottom: theme.spacing.xs,
                    }}
                  >
                    {t('contacts.fieldType')}
                  </label>
                  <select
                    value={newFieldType}
                    onChange={event => setNewFieldType(event.target.value)}
                    style={{ ...inputStyle, cursor: STRING_POINTER }}
                  >
                    <option value={FIELD_TYPE_TEXT}>{t('contacts.fieldTypeText')}</option>
                    <option value={FIELD_TYPE_NUMBER}>{t('contacts.fieldTypeNumber')}</option>
                    <option value={FIELD_TYPE_DATE}>{t('contacts.fieldTypeDate')}</option>
                    <option value={FIELD_TYPE_URL}>{t('contacts.fieldTypeUrl')}</option>
                  </select>
                </div>
                <button
                  onClick={() => {
                    handleAddCustomField(newFieldName, newFieldType, () => {
                      setNewFieldName('');
                      setNewFieldType(FIELD_TYPE_TEXT);
                      setShowAddCustomField(false);
                    });
                  }}
                  style={buttonPrimary}
                >
                  {t('contacts.save')}
                </button>
                <button onClick={() => setShowAddCustomField(false)} style={buttonSecondary}>
                  {t('contacts.cancel')}
                </button>
              </div>
            )}

            {contact.customFields.length === 0 && !showAddCustomField ? (
              <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>
                {t('contacts.addCustomField')}
              </div>
            ) : (
              <div style={{ display: STRING_GRID, gridTemplateColumns: '1fr 1fr', gap: theme.spacing.md }}>
                {contact.customFields.map((cf: any) => (
                  <div key={cf.fieldId}>
                    <label
                      style={{
                        color: theme.colors.text.secondary,
                        fontSize: theme.typography.fontSize.sm,
                        display: STRING_BLOCK,
                        marginBottom: theme.spacing.xs,
                      }}
                    >
                      {cf.fieldName}
                    </label>
                    {editingField === `cf-${cf.fieldId}` ? (
                      <div style={{ display: STRING_FLEX, gap: theme.spacing.xs }}>
                        <input
                          type={(() => {
                            if (cf.fieldType === FIELD_TYPE_NUMBER) {
                              return INPUT_TYPE_NUMBER;
                            }
                            if (cf.fieldType === FIELD_TYPE_DATE) {
                              return INPUT_TYPE_DATE;
                            }
                            if (cf.fieldType === FIELD_TYPE_URL) {
                              return INPUT_TYPE_URL;
                            }
                            return INPUT_TYPE_TEXT;
                          })()}
                          value={editValue}
                          onChange={event => setEditValue(event.target.value)}
                          style={inputStyle}
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            handleSetCustomFieldValue(cf.fieldId, editValue);
                            setEditingField(null);
                          }}
                          style={buttonPrimary}
                        >
                          {t('contacts.save')}
                        </button>
                        <button onClick={() => setEditingField(null)} style={buttonSecondary}>
                          {t('contacts.cancel')}
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          setEditingField(`cf-${cf.fieldId}`);
                          setEditValue(cf.value || '');
                        }}
                        style={{
                          ...inputStyle,
                          cursor: STRING_POINTER,
                          color: cf.value ? theme.colors.text.primary : theme.colors.text.tertiary,
                          minHeight: '38px',
                          display: STRING_FLEX,
                          alignItems: STRING_CENTER,
                        }}
                      >
                        {cf.value || '--'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <ContactActivityList
            contact={contact}
            newNote={newNote}
            addingNote={addingNote}
            onNewNoteChange={setNewNote}
            onAddNote={() => {
              setAddingNote(true);
              handleAddNote(newNote, () => {
                setNewNote('');
                setAddingNote(false);
              });
            }}
            onDeleteNote={handleDeleteNote}
            sectionStyle={sectionStyle}
            inputStyle={inputStyle}
            buttonPrimary={buttonPrimary}
            buttonSecondary={buttonSecondary}
            dealsOnView={() => navigate('/crm/deals')}
            dealsOnAdd={() => navigate(`/crm/deals?contactId=${contactId}`)}
            t={(tKey: string) => t(tKey)}
          />
        </div>
      </div>
    </div>
  );
};

export default ContactDetailPage;
