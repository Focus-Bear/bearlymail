import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { CATEGORY_DEBUG_OPAQUE_HEX_MIN_LEN, CATEGORY_DEBUG_RAW_NAME_PREVIEW_CHARS } from 'constants/numbers';

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
          <strong>{t('priority.categoryDebug.from')}:</strong> {email.fromName || email.from}{' '}
          {email.fromName ? `<${email.from}>` : ''}
        </div>
        {email.senderJobTitle && (
          <div>
            <strong>{t('priority.categoryDebug.jobTitle')}:</strong> {email.senderJobTitle}
          </div>
        )}
        <div>
          <strong>{t('priority.categoryDebug.subject')}:</strong> {email.subject}
        </div>
        {email.receivedAt ? (
          <div>
            <strong>{t('priority.categoryDebug.receivedAt')}:</strong>{' '}
            {new Date(email.receivedAt).toLocaleString()}
          </div>
        ) : null}
        <div style={{ marginTop: theme.spacing.xs }}>
          <strong>{t('priority.categoryDebug.bodyPreview')}:</strong>
          <div
            style={{
              marginTop: '4px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '120px',
              overflowY: 'auto',
            }}
          >
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
        {thread.categorySource ? (
          <div
            style={{
              marginTop: theme.spacing.xs,
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
            }}
          >
            <strong>{t('priority.categoryDebug.categorySourceLabel')}:</strong> {thread.categorySource}
          </div>
        ) : null}
        {thread.categoryExplanation && (
          <div style={{ marginTop: theme.spacing.xs }}>
            <strong>{t('priority.categoryDebug.explanation')}:</strong>
            <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {thread.categoryExplanation}
            </div>
          </div>
        )}
        <div style={{ marginTop: theme.spacing.sm }}>
          <strong>{t('priority.categoryDebug.shortlistedCategoriesLabel')}:</strong>
          {thread.shortlistedCategoryNames === null ? (
            <span style={{ ...emptyStyle, marginLeft: 4 }}>{t('priority.categoryDebug.shortlistNotApplicable')}</span>
          ) : thread.shortlistedCategoryNames.length === 0 ? (
            <span style={{ ...emptyStyle, marginLeft: 4 }}>{t('priority.categoryDebug.none')}</span>
          ) : (
            <ol
              style={{
                margin: `${theme.spacing.xs} 0 0`,
                paddingLeft: theme.spacing.lg,
                fontSize: theme.typography.fontSize.xs,
              }}
            >
              {thread.shortlistedCategoryNames.map(name => (
                <li key={name} style={{ marginBottom: theme.spacing.xs }}>
                  {name}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  );
};

function categoryNameLooksLikeOpaqueId(name: string): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) {
    return true;
  }
  return name.length >= CATEGORY_DEBUG_OPAQUE_HEX_MIN_LEN && /^[0-9a-f]+$/i.test(name.replace(/-/g, ''));
}

// --- CategoriesList ---

interface CategoriesListProps {
  categories: Array<{
    id: string;
    name: string;
    description?: string;
    categoryKey?: string | null;
  }>;
  headerLabel: string;
  emptyLabel: string;
  /** When false, only the list box is rendered (e.g. inside a parent accordion title). */
  includeHeading?: boolean;
}

export const CategoriesList: React.FC<CategoriesListProps> = ({
  categories,
  headerLabel,
  emptyLabel,
  includeHeading = true,
}) => {
  const { t } = useTranslation();
  return (
    <>
      {includeHeading ? <div style={sectionHeaderStyle}>{headerLabel}</div> : null}
      <div style={sectionBoxStyle}>
        {categories.length === 0 ? (
          <span style={emptyStyle}>{emptyLabel}</span>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '16px' }}>
            {categories.map(cat => {
              const opaque = categoryNameLooksLikeOpaqueId(cat.name);
              const title = opaque
                ? t('priority.categoryDebug.categoryLabelUnreadable', { shortId: cat.id.slice(0, 8) })
                : cat.name;
              return (
                <li key={cat.id}>
                  <strong>{title}</strong>
                  {opaque ? (
                    <span
                      style={{
                        color: theme.colors.text.tertiary,
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: '10px',
                      }}
                    >
                      {' '}
                      ({t('priority.categoryDebug.categoryRawValue')}:{' '}
                      {cat.name.length > CATEGORY_DEBUG_RAW_NAME_PREVIEW_CHARS
                        ? `${cat.name.slice(0, CATEGORY_DEBUG_RAW_NAME_PREVIEW_CHARS)}…`
                        : cat.name}
                      )
                    </span>
                  ) : null}
                  {!opaque && cat.description ? (
                    <span style={{ color: theme.colors.text.secondary }}> — {cat.description}</span>
                  ) : null}
                  {cat.categoryKey ? (
                    <div
                      style={{
                        fontSize: '10px',
                        fontFamily: 'ui-monospace, monospace',
                        color: theme.colors.text.tertiary,
                        marginTop: theme.spacing.xs,
                      }}
                    >
                      {t('priority.categoryDebug.categoryStableIdLine', { key: cat.categoryKey })}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
};

// --- UserContextSection ---

interface UserContextSectionProps {
  userContext: CategoryDebugData['userContext'];
  includeHeading?: boolean;
}

export const UserContextSection: React.FC<UserContextSectionProps> = ({ userContext, includeHeading = true }) => {
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
      {includeHeading ? <div style={sectionHeaderStyle}>{t('priority.categoryDebug.userContext')}</div> : null}
      <div style={sectionBoxStyle}>
        {urgentItems.length > 0 && (
          <div style={{ marginBottom: theme.spacing.xs }}>
            <strong>{t('priority.categoryDebug.urgentItems')}:</strong>
            <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
              {urgentItems.map(item => (
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
              {notUrgentItems.map(item => (
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
              {goals.map(item => (
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
              {workingOn.map(item => (
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
              {dontCare.map(item => (
                <li key={item.value}>{item.value}</li>
              ))}
            </ul>
          </div>
        )}
        {hasNoContext && <span style={emptyStyle}>{t('priority.categoryDebug.noContext')}</span>}
      </div>
    </>
  );
};
