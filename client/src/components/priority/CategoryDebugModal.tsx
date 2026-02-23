import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { ModalBackdrop, ModalContent } from 'components/modal';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { API_URL } from 'config/api';

interface CategoryDebugData {
  email: {
    from: string;
    fromName: string;
    senderJobTitle: string;
    subject: string;
    bodyPreview: string;
  };
  thread: {
    category: string | null;
    categoryExplanation: string | null;
  };
  emailCategories: Array<{ name: string; description?: string }>;
  protoCategories: Array<{ name: string; description?: string }>;
  userContext: {
    urgentItems: Array<{ value: string; explanation?: string }>;
    notUrgentItems: Array<{ value: string; explanation?: string }>;
    goals: Array<{ value: string; priority?: number }>;
    workingOn: Array<{ value: string; priority?: number }>;
    dontCare: Array<{ value: string }>;
  };
}

interface CategoryDebugModalProps {
  emailId: string;
  onClose: () => void;
}

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

const COPY_FEEDBACK_DURATION_MS = 2000;

const formatForGithubIssue = (debugInfo: CategoryDebugData): string => {
  const lines: string[] = ['## Category Debug Report', ''];

  lines.push('### Email');
  const fromDisplay = debugInfo.email.fromName
    ? `${debugInfo.email.fromName} <${debugInfo.email.from}>`
    : debugInfo.email.from;
  lines.push(`- **From**: ${fromDisplay}`);
  if (debugInfo.email.senderJobTitle) {
    lines.push(`- **Job Title**: ${debugInfo.email.senderJobTitle}`);
  }
  lines.push(`- **Subject**: ${debugInfo.email.subject}`);
  if (debugInfo.email.bodyPreview) {
    lines.push('- **Body Preview**:');
    lines.push('  ```');
    lines.push(`  ${debugInfo.email.bodyPreview.replace(/\n/g, '\n  ')}`);
    lines.push('  ```');
  }
  lines.push('');

  lines.push('### Current Category');
  lines.push(`- **Category**: ${debugInfo.thread.category ?? 'None'}`);
  if (debugInfo.thread.categoryExplanation) {
    lines.push(`- **Explanation**: ${debugInfo.thread.categoryExplanation}`);
  }
  lines.push('');

  lines.push(`### Available Categories (${debugInfo.emailCategories.length})`);
  if (debugInfo.emailCategories.length === 0) {
    lines.push('None');
  } else {
    debugInfo.emailCategories.forEach((cat) => {
      lines.push(`- **${cat.name}**${cat.description ? `: ${cat.description}` : ''}`);
    });
  }
  lines.push('');

  if (debugInfo.protoCategories.length > 0) {
    lines.push(`### Proto Categories (${debugInfo.protoCategories.length})`);
    debugInfo.protoCategories.forEach((cat) => {
      lines.push(`- **${cat.name}**${cat.description ? `: ${cat.description}` : ''}`);
    });
    lines.push('');
  }

  lines.push('### User Context');
  const { urgentItems, notUrgentItems, goals, workingOn, dontCare } = debugInfo.userContext;
  if (urgentItems.length > 0) {
    lines.push('**Urgent Items:**');
    urgentItems.forEach((item) => {
      lines.push(`- ${item.value}${item.explanation ? ` (${item.explanation})` : ''}`);
    });
  }
  if (notUrgentItems.length > 0) {
    lines.push('**Not Urgent Items:**');
    notUrgentItems.forEach((item) => {
      lines.push(`- ${item.value}${item.explanation ? ` (${item.explanation})` : ''}`);
    });
  }
  if (goals.length > 0) {
    lines.push('**Goals:**');
    goals.forEach((item) => {
      lines.push(`- ${item.value}${item.priority !== undefined ? ` (priority ${item.priority})` : ''}`);
    });
  }
  if (workingOn.length > 0) {
    lines.push('**Working On:**');
    workingOn.forEach((item) => {
      lines.push(`- ${item.value}${item.priority !== undefined ? ` (priority ${item.priority})` : ''}`);
    });
  }
  if (dontCare.length > 0) {
    lines.push("**Don't Care:**");
    dontCare.forEach((item) => {
      lines.push(`- ${item.value}`);
    });
  }
  const hasNoContext =
    urgentItems.length === 0 &&
    notUrgentItems.length === 0 &&
    goals.length === 0 &&
    workingOn.length === 0 &&
    dontCare.length === 0;
  if (hasNoContext) {
    lines.push('None');
  }

  return lines.join('\n');
};

interface EmailSectionProps {
  email: CategoryDebugData['email'];
}

const EmailSection: React.FC<EmailSectionProps> = ({ email }) => {
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

interface CategorySectionProps {
  thread: CategoryDebugData['thread'];
}

const CategorySection: React.FC<CategorySectionProps> = ({ thread }) => {
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

interface CategoriesListProps {
  categories: Array<{ name: string; description?: string }>;
  headerLabel: string;
  emptyLabel: string;
}

const CategoriesList: React.FC<CategoriesListProps> = ({ categories, headerLabel, emptyLabel }) => (
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

interface UserContextSectionProps {
  userContext: CategoryDebugData['userContext'];
}

const UserContextSection: React.FC<UserContextSectionProps> = ({ userContext }) => {
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

export const CategoryDebugModal: React.FC<CategoryDebugModalProps> = ({
  emailId,
  onClose,
}) => {
  const { t } = useTranslation();
  const [debugInfo, setDebugInfo] = useState<CategoryDebugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchDebugData = async () => {
      try {
        const response = await axios.get(`${API_URL}/emails/${emailId}/debug/category`);
        setDebugInfo(response.data);
      } catch (err) {
        setError(t('priority.categoryDebug.fetchError'));
      } finally {
        setLoading(false);
      }
    };
    fetchDebugData();
  }, [emailId, t]);

  const handleCopy = async () => {
    if (!debugInfo) return;
    const text = formatForGithubIssue(debugInfo);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    } catch {
      setError(t('priority.categoryDebug.copyFailed'));
    }
  };

  return createPortal(
    <ModalBackdrop onClose={onClose} zIndex={10001}>
      <ModalContent>
        <ModalHeaderWithClose
          title={t('priority.categoryDebug.title')}
          onClose={onClose}
        />

        {loading && (
          <div style={{ textAlign: 'center', padding: theme.spacing.md, color: theme.colors.text.secondary }}>
            {t('common.loading')}
          </div>
        )}

        {error && (
          <div style={{ color: theme.colors.feedback?.error || '#d32f2f', padding: theme.spacing.sm }}>
            {error}
          </div>
        )}

        {debugInfo && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: theme.spacing.xs }}>
              <button
                onClick={handleCopy}
                style={{
                  background: copied ? theme.colors.feedback?.success || '#388e3c' : theme.colors.background.subtle,
                  border: `1px solid ${theme.colors.border?.default || '#e0e0e0'}`,
                  borderRadius: theme.borderRadius.sm,
                  cursor: 'pointer',
                  padding: `4px ${theme.spacing.sm}`,
                  fontSize: theme.typography.fontSize.xs,
                  color: copied ? '#fff' : theme.colors.text.secondary,
                  transition: 'background 0.2s, color 0.2s',
                }}
              >
                {copied ? t('priority.categoryDebug.copied') : t('priority.categoryDebug.copyForIssue')}
              </button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '70vh' }}>
              <EmailSection email={debugInfo.email} />
              <CategorySection thread={debugInfo.thread} />
              <CategoriesList
                categories={debugInfo.emailCategories}
                headerLabel={`${t('priority.categoryDebug.availableCategories')} (${debugInfo.emailCategories.length})`}
                emptyLabel={t('priority.categoryDebug.noCategories')}
              />
              {debugInfo.protoCategories.length > 0 && (
                <CategoriesList
                  categories={debugInfo.protoCategories}
                  headerLabel={`${t('priority.categoryDebug.protoCategories')} (${debugInfo.protoCategories.length})`}
                  emptyLabel=""
                />
              )}
              <UserContextSection userContext={debugInfo.userContext} />
            </div>
          </>
        )}
      </ModalContent>
    </ModalBackdrop>,
    document.body,
  );
};
