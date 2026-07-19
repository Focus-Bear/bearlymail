import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { theme } from 'theme/theme';
import { ContactCustomFieldValue, ContactDetail as ContactDetailType, ContactTypeConfig } from 'types/contact';

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
import { useAuth, User } from 'contexts/AuthContext';
import { useContactThreads } from 'hooks/useContactThreads';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { useSidebarState } from 'hooks/useSidebarState';

import ContactActivityList from './contact-detail/components/ContactActivityList';
import ContactDetailHeader from './contact-detail/components/ContactDetailHeader';
import { ContactGroupMembership } from './contact-detail/components/ContactGroupMembership';
import { ContactThreadList } from './contact-detail/components/ContactThreadList';
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

interface ContactStyles {
  inputStyle: React.CSSProperties;
  buttonPrimary: React.CSSProperties;
  buttonSecondary: React.CSSProperties;
  sectionStyle: React.CSSProperties;
}

function buildContactDetailStyles(): ContactStyles {
  return {
    inputStyle: {
      padding: theme.spacing.sm,
      border: `1px solid ${theme.colors.border.medium}`,
      borderRadius: theme.borderRadius.md,
      fontSize: theme.typography.fontSize.base,
      outline: STRING_NONE,
      backgroundColor: theme.colors.background.paper,
      width: '100%',
    },
    buttonPrimary: {
      padding: `${theme.spacing.xs} ${theme.spacing.md}`,
      backgroundColor: theme.colors.primary.main,
      color: STRING_WHITE,
      border: STRING_NONE,
      borderRadius: theme.borderRadius.md,
      cursor: STRING_POINTER,
      fontSize: theme.typography.fontSize.sm,
      fontWeight: theme.typography.fontWeight.medium,
    },
    buttonSecondary: {
      padding: `${theme.spacing.xs} ${theme.spacing.md}`,
      backgroundColor: STRING_TRANSPARENT,
      color: theme.colors.text.secondary,
      border: `1px solid ${theme.colors.border.medium}`,
      borderRadius: theme.borderRadius.md,
      cursor: STRING_POINTER,
      fontSize: theme.typography.fontSize.sm,
    },
    sectionStyle: {
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.lg,
      boxShadow: theme.shadows.sm,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
    },
  };
}

interface ContactDetailStateViewProps {
  user: User | null;
  logout: () => void;
  isCollapsed: boolean;
  canToggleCollapse: boolean;
  onToggleCollapse: () => void;
  isMobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  message: string;
  isError?: boolean;
}

const ContactDetailStateView: React.FC<ContactDetailStateViewProps> = ({
  user,
  logout,
  isCollapsed,
  canToggleCollapse,
  onToggleCollapse,
  isMobileMenuOpen,
  onCloseMobileMenu,
  message,
  isError,
}) => (
  <div style={{ display: STRING_FLEX, height: '100vh' }}>
    <Sidebar
      user={user}
      logout={logout}
      isCollapsed={isCollapsed}
      canToggleCollapse={canToggleCollapse}
      onToggleCollapse={onToggleCollapse}
      isMobileMenuOpen={isMobileMenuOpen}
      onCloseMobileMenu={onCloseMobileMenu}
    />
    <div
      style={{
        flex: 1,
        display: STRING_FLEX,
        justifyContent: STRING_CENTER,
        alignItems: STRING_CENTER,
        color: isError ? theme.colors.accent.error : theme.colors.text.secondary,
      }}
    >
      {message}
    </div>
  </div>
);

interface ContactBasicFieldsProps {
  contact: ContactDetailType;
  contactTypes: ContactTypeConfig[];
  editingField: string | null;
  editValue: string;
  styles: ContactStyles;
  t: (key: string) => string;
  onUpdateField: (field: string, value: string | null) => void;
  setEditingField: (field: string | null) => void;
  setEditValue: (value: string) => void;
}

const ContactBasicFields: React.FC<ContactBasicFieldsProps> = ({
  contact,
  contactTypes,
  editingField,
  editValue,
  styles,
  t,
  onUpdateField,
  setEditingField,
  setEditValue,
}) => {
  const { inputStyle, buttonPrimary, buttonSecondary } = styles;
  return (
    <div style={{ display: STRING_GRID, gridTemplateColumns: '1fr 1fr', gap: theme.spacing.md }}>
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
          onChange={event => onUpdateField('contactType', event.target.value || null)}
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
          onUpdateField(FIELD_TYPE_PHONE, editValue);
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
          onUpdateField(FIELD_TYPE_COMPANY, editValue);
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
          onUpdateField(FIELD_JOB_TITLE, editValue);
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
            onUpdateField('followUpDate', event.target.value || null);
          }}
          style={inputStyle}
        />
      </div>
    </div>
  );
};

function getCustomFieldInputType(fieldType: string): string {
  if (fieldType === FIELD_TYPE_NUMBER) {
    return INPUT_TYPE_NUMBER;
  }
  if (fieldType === FIELD_TYPE_DATE) {
    return INPUT_TYPE_DATE;
  }
  if (fieldType === FIELD_TYPE_URL) {
    return INPUT_TYPE_URL;
  }
  return INPUT_TYPE_TEXT;
}

interface ContactCustomFieldsSectionProps {
  contact: ContactDetailType;
  editingField: string | null;
  editValue: string;
  showAddCustomField: boolean;
  newFieldName: string;
  newFieldType: string;
  styles: ContactStyles;
  t: (key: string) => string;
  setEditingField: (field: string | null) => void;
  setEditValue: (value: string) => void;
  setShowAddCustomField: (show: boolean) => void;
  setNewFieldName: (name: string) => void;
  setNewFieldType: (type: string) => void;
  onSetCustomFieldValue: (fieldId: string, value: string) => void;
  onAddCustomField: (name: string, type: string, onSuccess: () => void) => void;
}

const ContactCustomFieldsSection: React.FC<ContactCustomFieldsSectionProps> = ({
  contact,
  editingField,
  editValue,
  showAddCustomField,
  newFieldName,
  newFieldType,
  styles,
  t,
  setEditingField,
  setEditValue,
  setShowAddCustomField,
  setNewFieldName,
  setNewFieldType,
  onSetCustomFieldValue,
  onAddCustomField,
}) => {
  const { inputStyle, buttonPrimary, buttonSecondary, sectionStyle } = styles;
  return (
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
              onAddCustomField(newFieldName, newFieldType, () => {
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
          {contact.customFields.map((cf: ContactCustomFieldValue) => (
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
                    type={getCustomFieldInputType(cf.fieldType)}
                    value={editValue}
                    onChange={event => setEditValue(event.target.value)}
                    style={inputStyle}
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      onSetCustomFieldValue(cf.fieldId, editValue);
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
  );
};

const ContactDetailPage: React.FC = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;
  const { isCollapsed, canToggleCollapse, isMobileMenuOpen, toggleCollapse, openMobileMenu, closeMobileMenu } =
    useSidebarState({ alwaysToggleable: true });

  const { contact, contactTypes, loading, error, fetchContact, getTypeConfig } = useContactDetailData(contactId);
  const { handleUpdateField, handleAddNote, handleDeleteNote, handleSetCustomFieldValue, handleAddCustomField } =
    useContactActions(contactId, fetchContact);
  const {
    threads: filteredThreads,
    isLoading: threadsLoading,
    hasError: threadsHasError,
    keyword: threadKeyword,
    roleFilter: threadRoleFilter,
    setKeyword: setThreadKeyword,
    setRoleFilter: setThreadRoleFilter,
  } = useContactThreads(contactId);

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [showAddCustomField, setShowAddCustomField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<string>(FIELD_TYPE_TEXT);

  useEffect(() => {
    if (contact && editingField === null) {
      setEditValue('');
    }
  }, [contact, editingField]);

  const sidebarProps = {
    user,
    logout,
    isCollapsed,
    canToggleCollapse,
    onToggleCollapse: toggleCollapse,
    isMobileMenuOpen,
    onCloseMobileMenu: closeMobileMenu,
  };

  if (loading) {
    return <ContactDetailStateView {...sidebarProps} message={t('contacts.loading')} />;
  }

  if (error || !contact) {
    return (
      <ContactDetailStateView
        {...sidebarProps}
        message={error || t('contacts.notFound', { defaultValue: 'Contact not found' })}
        isError
      />
    );
  }

  const typeConfig = getTypeConfig(contact.contactType);
  const styles = buildContactDetailStyles();
  const { buttonSecondary, sectionStyle } = styles;

  return (
    <div style={{ display: STRING_FLEX, height: '100vh', overflow: STRING_HIDDEN }}>
      <Sidebar {...sidebarProps} />
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

          <div style={sectionStyle}>
            <ContactDetailHeader
              contact={contact}
              typeConfig={typeConfig}
              WIDTH_64_PX={WIDTH_64_PX}
              HEIGHT_64_PX={HEIGHT_64_PX}
            />
            <ContactBasicFields
              contact={contact}
              contactTypes={contactTypes}
              editingField={editingField}
              editValue={editValue}
              styles={styles}
              t={t}
              onUpdateField={handleUpdateField}
              setEditingField={setEditingField}
              setEditValue={setEditValue}
            />
          </div>

          {contactId && (
            <ContactGroupMembership
              contactId={contactId}
              contactEmail={contact.email}
              contactName={contact.name ?? undefined}
              sectionStyle={sectionStyle}
            />
          )}

          <ContactCustomFieldsSection
            contact={contact}
            editingField={editingField}
            editValue={editValue}
            showAddCustomField={showAddCustomField}
            newFieldName={newFieldName}
            newFieldType={newFieldType}
            styles={styles}
            t={t}
            setEditingField={setEditingField}
            setEditValue={setEditValue}
            setShowAddCustomField={setShowAddCustomField}
            setNewFieldName={setNewFieldName}
            setNewFieldType={setNewFieldType}
            onSetCustomFieldValue={handleSetCustomFieldValue}
            onAddCustomField={handleAddCustomField}
          />

          <ContactThreadList
            filteredThreads={filteredThreads}
            isLoading={threadsLoading}
            hasError={threadsHasError}
            keyword={threadKeyword}
            roleFilter={threadRoleFilter}
            onKeywordChange={setThreadKeyword}
            onRoleFilterChange={setThreadRoleFilter}
            sectionStyle={sectionStyle}
            inputStyle={styles.inputStyle}
            t={(key, opts) => t(key, opts)}
          />

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
            inputStyle={styles.inputStyle}
            buttonPrimary={styles.buttonPrimary}
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
