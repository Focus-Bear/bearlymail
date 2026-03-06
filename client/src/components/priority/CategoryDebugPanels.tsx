import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { CategoryDebugData } from './CategoryDebugModal.types';

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: theme.colors.text.secondary,
  marginBottom: theme.spacing.xs,
  marginTop: theme.spacing.md,
};

const sectionBoxStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.subtle,
  borderRadius: theme.borderRadius.sm,
  padding: theme.spacing.sm,
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.text.primary,
  lineHeight: '1.5',
  marginBottom: theme.spacing.sm,
};

const emptyStyle: React.CSSProperties = {
  color: theme.colors.text.tertiary,
  fontStyle: 'italic',
};

// --- EmailSection ---

interface EmailSectionProps {
  email: CategoryDebugData['email'];
}

export const EmailSection: React.FC<EmailSectionProps> = ({ email }) => {
  const { t } = useTranslation();
  return (
    <>
      <div style={sectionHeaderStyle}>{t('priority.categoryDebug.emailData')}</div>
      <div style={sectionBoxStyle}>
        <div>
          <strong>{t('priority.categoryDebug.from')}:</strong>{' '}
          {email.fromName || email.from}{' '}
          {email.fromName ? `<${email.from}>` : ''}
        </div>
        {email.senderJobTitle && (
          <div><strong>{t('priority.categoryDebug.jobTitle')}:</strong> {email.senderJobTitle}</div>
        )}
        <div><strong>{t('priority.categoryDebug.subject')}:</strong> {email.subject}</div>
        <div style={{ marginTop: theme.spacing.xs }}>
          <strong>{t('priority.categoryDebug.bodyPreview')}:</strong>
          <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '120px', overflowY: 'auto' }}>
            {email.bodyPreview || <span style={emptyStyle}>{t('priority.categoryDebug.empty')}</span>}
          </div>
        </div>
      </div>
    </>
  );
};

// --- CategorySection ---

interface CategorySectionProps {
  thread: CategoryDebugData['thread'];
}

export const CategorySection: React.FC<CategorySectionProps> = ({ thread }) => {
  const { t } = useTranslation();
  return (
    <>
      <div style={sectionHeaderStyle}>{t('priority.categoryDebug.currentCategory')}</div>
      <div style={sectionBoxStyle}>
        <div>
          <strong>{t('priority.categoryDebug.category')}:</strong>{' '}
          {thread.category || <span style={emptyStyle}>{t('priority.categoryDebug.none')}</span>}
        </div>
        {thread.categoryExplanation && (
          <div style={{ marginTop: theme.spacing.xs }}>
            <strong>{t('priority.categoryDebug.explanation')}:</strong>
            <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {thread.categoryExplanation}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

// --- CategoriesList ---

interface CategoriesListProps {
  categories: Array<{ name: string; description?: string }>;
  headerLabel: string;
  emptyLabel: string;
}

export const CategoriesList: React.FC<CategoriesListProps> = ({ categories, headerLabel, emptyLabel }) => (
  <>
    <div style={sectionHeaderStyle}>{headerLabel}</div>
    <div style={sectionBoxStyle}>
      {categories.length === 0 ? (
        <span style={emptyStyle}>{emptyLabel}</span>
      ) : (
        <ul style={{ margin: 0, paddingLeft: '16px' }}>
          {categories.map((cat) => (
            <li key={cat.name}>
              <strong>{cat.name}</strong>
              {cat.description && (
                <span style={{ color: theme.colors.text.secondary }}> — {cat.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  </>
);

// --- UserContextSection ---

interface UserContextSectionProps {
  userContext: CategoryDebugData['userContext'];
}

export const UserContextSection: React.FC<UserContextSectionProps> = ({ userContext }) => {
  const { t } = useTranslation();
  const { urgentItems, notUrgentItems, goals, workingOn, dontCare } = userContext;
  const hasNoContext =
    urgentItems.length === 0 &&
    notUrgentItems.length === 0 &&
    goals.length === 0 &&
    workingOn.length === 0 &&
    dontCare.length === 0;

  return (
    <>
      <div style={sectionHeaderStyle}>{t('priority.categoryDebug.userContext')}</div>
      <div style={sectionBoxStyle}>
        {urgentItems.length > 0 && (
          <div style={{ marginBottom: theme.spacing.xs }}>
            <strong>{t('priority.categoryDebug.urgentItems')}:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
              {urgentItems.map((item) => (
                <li key={item.value}>
                  {item.value}
                  {item.explanation && (
                    <span style={{ color: theme.colors.text.secondary }}> ({item.explanation})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {notUrgentItems.length > 0 && (
          <div style={{ marginBottom: theme.spacing.xs }}>
            <strong>{t('priority.categoryDebug.notUrgentItems')}:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
              {notUrgentItems.map((item) => (
                <li key={item.value}>
                  {item.value}
                  {item.explanation && (
                    <span style={{ color: theme.colors.text.secondary }}> ({item.explanation})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {goals.length > 0 && (
          <div style={{ marginBottom: theme.spacing.xs }}>
            <strong>{t('priority.categoryDebug.goals')}:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
              {goals.map((item) => (
                <li key={item.value}>
                  {item.value}
                  {item.priority !== undefined && (
                    <span style={{ color: theme.colors.text.secondary }}>
                      {t('priority.categoryDebug.priorityValue', { priority: item.priority })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {workingOn.length > 0 && (
          <div style={{ marginBottom: theme.spacing.xs }}>
            <strong>{t('priority.categoryDebug.workingOn')}:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
              {workingOn.map((item) => (
                <li key={item.value}>
                  {item.value}
                  {item.priority !== undefined && (
                    <span style={{ color: theme.colors.text.secondary }}>
                      {t('priority.categoryDebug.priorityValue', { priority: item.priority })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {dontCare.length > 0 && (
          <div>
            <strong>{t('priority.categoryDebug.dontCare')}:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
              {dontCare.map((item) => (
                <li key={item.value}>{item.value}</li>
              ))}
            </ul>
          </div>
        )}
        {hasNoContext && (
          <span style={emptyStyle}>{t('priority.categoryDebug.noContext')}</span>
        )}
      </div>
    </>
  );
};
