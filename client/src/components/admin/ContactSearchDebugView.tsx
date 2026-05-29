/*
 * Admin-internal debug rendering. Field names mirror backend implementation
 * terms (`stored searchTokens`, `post-filter result`, hex hashes) — they
 * are intentionally English-only because translating them would obscure
 * what they refer to, and only admins see this screen.
 */
/* eslint-disable i18next/no-literal-string, max-lines-per-function, no-restricted-syntax, complexity */
import React from 'react';
import { theme } from 'theme/theme';

import {
  ContactSearchDebugResponse,
  DebugAccountStats,
  DebugSqlCandidate,
  DebugTargetContact,
  RebuildSearchTokensResponse,
  useRebuildSearchTokens,
} from './useContactSearchDebug';

type BadgeKind = 'pass' | 'fail' | 'info';

const BADGE_PALETTES: Record<BadgeKind, { bg: string; fg: string }> = {
  pass: { bg: '#dcfce7', fg: '#166534' },
  fail: { bg: '#fee2e2', fg: '#991b1b' },
  info: { bg: '#e0e7ff', fg: '#3730a3' },
};

const BADGE_PADDING = '2px 8px';
const BADGE_RADIUS = 999;
const BADGE_FONT_SIZE = '0.75rem';
const CANDIDATES_MATCHED_PREVIEW_COUNT = 4;

const monospace: React.CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: '0.85rem',
};

const card: React.CSSProperties = {
  padding: theme.spacing.lg,
  marginBottom: theme.spacing.lg,
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: 6,
};

const cardHeading: React.CSSProperties = {
  margin: 0,
  marginBottom: theme.spacing.sm,
  fontSize: theme.typography.fontSize.lg,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.primary,
};

const tableHeaderCell: React.CSSProperties = {
  textAlign: 'left',
  padding: theme.spacing.xs,
  borderBottom: `1px solid ${theme.colors.border.medium}`,
  fontWeight: theme.typography.fontWeight.semibold,
};

const tableCell: React.CSSProperties = {
  padding: theme.spacing.xs,
  borderBottom: `1px solid ${theme.colors.border.light}`,
  verticalAlign: 'top',
};

export const Badge: React.FC<{ text: string; kind: BadgeKind }> = ({ text, kind }) => {
  const palette = BADGE_PALETTES[kind];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: BADGE_PADDING,
        borderRadius: BADGE_RADIUS,
        fontSize: BADGE_FONT_SIZE,
        fontWeight: theme.typography.fontWeight.semibold,
        backgroundColor: palette.bg,
        color: palette.fg,
      }}
    >
      {text}
    </span>
  );
};

const NullLabel: React.FC = () => <i>(null)</i>;

const REBUILD_DISABLED_OPACITY = 0.6;

const primaryButton: React.CSSProperties = {
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  backgroundColor: theme.colors.primary.main,
  color: theme.colors.common.white,
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: theme.typography.fontWeight.semibold,
  fontSize: theme.typography.fontSize.sm,
};

const RebuildResultSummary: React.FC<{ result: RebuildSearchTokensResponse }> = ({ result }) => (
  <div style={{ marginTop: theme.spacing.sm, fontSize: theme.typography.fontSize.sm }}>
    <Badge text={`scanned ${result.scanned}`} kind="info" />{' '}
    <Badge text={`updated ${result.updated}`} kind={result.updated > 0 ? 'pass' : 'info'} />{' '}
    {result.remaining > 0 && <Badge text={`${result.remaining} still missing`} kind="fail" />}{' '}
    {result.errors.length > 0 && <Badge text={`${result.errors.length} errors`} kind="fail" />}
  </div>
);

const AccountStatsCard: React.FC<{
  stats: DebugAccountStats;
  onRefresh?: () => void;
}> = ({ stats, onRefresh }) => {
  const { rebuilding, error, lastResult, rebuild } = useRebuildSearchTokens();
  const missingTotal = stats.nullSearchTokens + stats.emptySearchTokens;
  const hasMissing = missingTotal > 0;

  const handleBulkRebuild = async () => {
    const outcome = await rebuild();
    if (outcome && onRefresh) {
onRefresh();
}
  };

  return (
    <div style={card}>
      <h3 style={cardHeading}>Account blind-index health</h3>
      <div style={{ marginBottom: theme.spacing.sm }}>
        <Badge text={`${stats.totalContacts} contacts`} kind="info" />{' '}
        <Badge
          text={`${stats.populatedSearchTokens} with searchTokens`}
          kind={stats.populatedSearchTokens > 0 ? 'pass' : 'fail'}
        />{' '}
        <Badge
          text={`${stats.nullSearchTokens} NULL`}
          kind={stats.nullSearchTokens > 0 ? 'fail' : 'pass'}
        />{' '}
        <Badge
          text={`${stats.emptySearchTokens} empty`}
          kind={stats.emptySearchTokens > 0 ? 'fail' : 'pass'}
        />
      </div>
      {hasMissing ? (
        <>
          <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
            {missingTotal} contact{missingTotal === 1 ? '' : 's'} have NULL or empty{' '}
            <code>searchTokens</code>. <code>LIKE</code> cannot match those rows, so they are invisible to fuzzy
            search regardless of what the user types. Rebuilding regenerates the blind index from the existing
            decrypted name / email fields — no PII leaves the server.
          </p>
          <button
            type="button"
            onClick={handleBulkRebuild}
            disabled={rebuilding}
            style={{
              ...primaryButton,
              cursor: rebuilding ? 'not-allowed' : 'pointer',
              opacity: rebuilding ? REBUILD_DISABLED_OPACITY : 1,
            }}
          >
            {rebuilding ? 'Rebuilding…' : `Rebuild missing searchTokens (next batch)`}
          </button>
        </>
      ) : (
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          All contacts have populated <code>searchTokens</code>.
        </p>
      )}
      {error && (
        <div
          role="alert"
          style={{
            marginTop: theme.spacing.sm,
            padding: theme.spacing.sm,
            backgroundColor: theme.colors.error.light,
            color: theme.colors.error.main,
            borderRadius: 4,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {error}
        </div>
      )}
      {lastResult && <RebuildResultSummary result={lastResult} />}
    </div>
  );
};

const TargetRebuildButton: React.FC<{
  contactId: string;
  onRefresh?: () => void;
}> = ({ contactId, onRefresh }) => {
  const { rebuilding, error, lastResult, rebuild } = useRebuildSearchTokens();
  const handle = async () => {
    const outcome = await rebuild(contactId);
    if (outcome && onRefresh) {
onRefresh();
}
  };
  return (
    <div style={{ marginTop: theme.spacing.sm }}>
      <button
        type="button"
        onClick={handle}
        disabled={rebuilding}
        style={{
          ...primaryButton,
          cursor: rebuilding ? 'not-allowed' : 'pointer',
          opacity: rebuilding ? REBUILD_DISABLED_OPACITY : 1,
        }}
      >
        {rebuilding ? 'Rebuilding…' : 'Rebuild searchTokens for this contact'}
      </button>
      {error && (
        <span style={{ marginLeft: theme.spacing.sm, color: theme.colors.error.main, fontSize: theme.typography.fontSize.sm }}>
          {error}
        </span>
      )}
      {lastResult && <RebuildResultSummary result={lastResult} />}
    </div>
  );
};

function describePosition(target: DebugTargetContact): string {
  if (target.positionInSqlOrder !== undefined && target.positionInSqlOrder >= 0) {
    return `position ${target.positionInSqlOrder} in SQL ordering`;
  }
  if (target.rankedBeyondScanCap) {
    return 'ranked beyond diagnostic scan cap';
  }
  return 'not in SQL candidate set';
}

const StoredTokensSummary: React.FC<{ target: DebugTargetContact }> = ({ target }) => {
  if (target.storedTokensRaw === null || target.storedTokensRaw === undefined) {
    return <Badge text="NULL" kind="fail" />;
  }
  if (target.storedTokensParseError) {
    return (
      <>
        <Badge text="parse error" kind="fail" />{' '}
        <span style={monospace}>{target.storedTokensParseError}</span>
      </>
    );
  }
  return (
    <>
      <Badge text={`${target.storedTokensParsedCount} tokens`} kind="info" />{' '}
      <span style={monospace}>({target.storedTokensRaw.length} chars)</span>
    </>
  );
};

const TargetContactCard: React.FC<{
  target: DebugTargetContact;
  onRefresh?: () => void;
}> = ({ target, onRefresh }) => {
  if (!target.found) {
    return (
      <div style={card}>
        <h3 style={cardHeading}>Target contact lookup</h3>
        <p>
          <Badge text="NOT IN DB" kind="fail" /> No contact found in your account with that email.
        </p>
        <p style={monospace}>emailHash searched: {target.lookedUpEmailHash}</p>
      </div>
    );
  }

  const presentTokens = target.queryTokensInStored?.filter(token => token.presentInStored).length ?? 0;
  const totalTokens = target.queryTokensInStored?.length ?? 0;
  const positionLabel = describePosition(target);
  const positionKind: BadgeKind =
    target.positionInSqlOrder !== undefined && target.positionInSqlOrder >= 0 ? 'info' : 'fail';

  return (
    <div style={card}>
      <h3 style={cardHeading}>Target contact diagnostic</h3>
      <div style={{ marginBottom: theme.spacing.md }}>
        <Badge text="FOUND IN DB" kind="pass" />{' '}
        <Badge
          text={target.wouldMatchSql ? 'SQL would match' : 'SQL would NOT match'}
          kind={target.wouldMatchSql ? 'pass' : 'fail'}
        />{' '}
        <Badge
          text={target.passesPostFilter ? 'post-filter passes' : 'post-filter fails'}
          kind={target.passesPostFilter ? 'pass' : 'fail'}
        />{' '}
        <Badge text={positionLabel} kind={positionKind} />{' '}
        <Badge
          text={target.wouldSurviveTake8 ? 'survives take(8)' : 'pushed out by take(8)'}
          kind={target.wouldSurviveTake8 ? 'pass' : 'fail'}
        />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: theme.spacing.md }}>
        <tbody>
          <tr>
            <td style={tableCell}><b>id</b></td>
            <td style={{ ...tableCell, ...monospace }}>{target.id}</td>
          </tr>
          <tr>
            <td style={tableCell}><b>provider / providerId</b></td>
            <td style={{ ...tableCell, ...monospace }}>
              {target.provider} / {target.providerId || '(empty)'}
            </td>
          </tr>
          <tr>
            <td style={tableCell}><b>email (decrypted)</b></td>
            <td style={{ ...tableCell, ...monospace }}>{target.email}</td>
          </tr>
          <tr>
            <td style={tableCell}><b>name</b></td>
            <td style={tableCell}>{target.name ?? <NullLabel />}</td>
          </tr>
          <tr>
            <td style={tableCell}><b>firstName / lastName</b></td>
            <td style={tableCell}>
              {target.firstName ?? <NullLabel />} / {target.lastName ?? <NullLabel />}
            </td>
          </tr>
          <tr>
            <td style={tableCell}><b>contactFrequency</b></td>
            <td style={tableCell}>{target.contactFrequency}</td>
          </tr>
          <tr>
            <td style={tableCell}><b>stored searchTokens</b></td>
            <td style={tableCell}>
              <StoredTokensSummary target={target} />
            </td>
          </tr>
          <tr>
            <td style={tableCell}><b>post-filter result</b></td>
            <td style={tableCell}>{target.postFilterReason}</td>
          </tr>
        </tbody>
      </table>
      <h4 style={{ margin: 0, marginBottom: theme.spacing.sm, fontWeight: theme.typography.fontWeight.semibold }}>
        Query-token presence in stored searchTokens ({presentTokens}/{totalTokens} present)
      </h4>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={tableHeaderCell}>input</th>
            <th style={tableHeaderCell}>source</th>
            <th style={tableHeaderCell}>hash</th>
            <th style={tableHeaderCell}>in stored?</th>
          </tr>
        </thead>
        <tbody>
          {target.queryTokensInStored?.map(token => (
            <tr key={token.hash}>
              <td style={{ ...tableCell, ...monospace }}>{token.input}</td>
              <td style={tableCell}>{token.source}</td>
              <td style={{ ...tableCell, ...monospace }}>{token.hash}</td>
              <td style={tableCell}>
                <Badge text={token.presentInStored ? 'yes' : 'no'} kind={token.presentInStored ? 'pass' : 'fail'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {target.storedTokensRaw && (
        <details style={{ marginTop: theme.spacing.md }}>
          <summary style={{ cursor: 'pointer', fontWeight: theme.typography.fontWeight.semibold }}>
            Raw stored searchTokens
          </summary>
          <pre style={{ ...monospace, whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: theme.spacing.sm }}>
            {target.storedTokensRaw}
          </pre>
        </details>
      )}
      {target.id && !target.wouldMatchSql && (
        <TargetRebuildButton contactId={target.id} onRefresh={onRefresh} />
      )}
    </div>
  );
};

const SqlCandidatesCard: React.FC<{
  candidates: DebugSqlCandidate[];
  matchingTotal: number;
  scannedCount: number;
  scanCapHit: boolean;
  scanCap: number;
  takeLimit: number;
}> = ({ candidates, matchingTotal, scannedCount, scanCapHit, scanCap, takeLimit }) => (
  <div style={card}>
    <h3 style={cardHeading}>
      SQL candidates: {matchingTotal} total{' '}
      <span style={{ color: theme.colors.text.secondary, fontWeight: 'normal', fontSize: '0.9rem' }}>
        — scanned {scannedCount}
        {scanCapHit ? ` (capped at ${scanCap})` : ''}, prod takes top {takeLimit}, showing {candidates.length}
      </span>
    </h3>
    {scanCapHit && (
      <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
        <Badge text="scan cap hit" kind="info" /> Extra rows matched the OR clause beyond the diagnostic cap; their{' '}
        <code>positionInSqlOrder</code> will show as <code>-1</code>.
      </p>
    )}
    {candidates.length === 0 ? (
      <p style={{ color: theme.colors.text.secondary }}>
        No rows matched any query token under <code>userId = you</code>.
      </p>
    ) : (
      <table style={{ width: '100%', borderCollapse: 'collapse', ...monospace }}>
        <thead>
          <tr>
            <th style={tableHeaderCell}>#</th>
            <th style={tableHeaderCell}>email</th>
            <th style={tableHeaderCell}>name</th>
            <th style={tableHeaderCell}>freq</th>
            <th style={tableHeaderCell}>matched tokens</th>
            <th style={tableHeaderCell}>post-filter</th>
            <th style={tableHeaderCell}>top {takeLimit}?</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map(candidate => (
            <tr key={candidate.id}>
              <td style={tableCell}>{candidate.positionInSqlOrder}</td>
              <td style={tableCell}>{candidate.email}</td>
              <td style={tableCell}>{candidate.name ?? <NullLabel />}</td>
              <td style={tableCell}>{candidate.contactFrequency}</td>
              <td style={tableCell}>
                {candidate.matchedQueryTokens.length}{' '}
                <span style={{ color: theme.colors.text.secondary }}>
                  (
                  {candidate.matchedQueryTokens
                    .slice(0, CANDIDATES_MATCHED_PREVIEW_COUNT)
                    .map(token => token.input)
                    .join(', ')}
                  {candidate.matchedQueryTokens.length > CANDIDATES_MATCHED_PREVIEW_COUNT ? ', …' : ''})
                </span>
              </td>
              <td style={tableCell}>
                <Badge text={candidate.passesPostFilter ? 'pass' : 'fail'} kind={candidate.passesPostFilter ? 'pass' : 'fail'} />
              </td>
              <td style={tableCell}>
                <Badge text={candidate.wouldSurviveTake8 ? 'yes' : 'no'} kind={candidate.wouldSurviveTake8 ? 'pass' : 'fail'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const QueryTokensCard: React.FC<{ tokens: ContactSearchDebugResponse['queryTokens'] }> = ({ tokens }) => (
  <div style={card}>
    <h3 style={cardHeading}>Query tokens ({tokens.length})</h3>
    <table style={{ width: '100%', borderCollapse: 'collapse', ...monospace }}>
      <thead>
        <tr>
          <th style={tableHeaderCell}>input</th>
          <th style={tableHeaderCell}>source</th>
          <th style={tableHeaderCell}>hash (LIKE %&lt;hash&gt;%)</th>
        </tr>
      </thead>
      <tbody>
        {tokens.map(token => (
          <tr key={token.hash}>
            <td style={tableCell}>{token.input}</td>
            <td style={tableCell}>{token.source}</td>
            <td style={tableCell}>{token.hash}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const GmailCard: React.FC<{ result: ContactSearchDebugResponse }> = ({ result }) => (
  <div style={card}>
    <h3 style={cardHeading}>Gmail People API fallback</h3>
    <p>
      <Badge
        text={result.gmailConnected ? 'Google connected' : 'Google NOT connected'}
        kind={result.gmailConnected ? 'pass' : 'fail'}
      />{' '}
      {result.gmailError && <Badge text="error" kind="fail" />}
    </p>
    {result.gmailError && (
      <pre style={{ ...monospace, whiteSpace: 'pre-wrap', color: theme.colors.error.main }}>{result.gmailError}</pre>
    )}
    {result.gmailResults.length === 0 ? (
      <p style={{ color: theme.colors.text.secondary }}>No results.</p>
    ) : (
      <table style={{ width: '100%', borderCollapse: 'collapse', ...monospace }}>
        <thead>
          <tr>
            <th style={tableHeaderCell}>email</th>
            <th style={tableHeaderCell}>name</th>
            <th style={tableHeaderCell}>providerId</th>
          </tr>
        </thead>
        <tbody>
          {result.gmailResults.map(person => (
            <tr key={person.providerId || person.email}>
              <td style={tableCell}>{person.email}</td>
              <td style={tableCell}>{person.name ?? <NullLabel />}</td>
              <td style={tableCell}>{person.providerId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

/**
 * Full rendering of a `ContactSearchDebugResponse`. Used by both the admin
 * dashboard tab and the inline panel on the Contacts page so they always
 * present the same diagnostic, no duplicated rendering logic.
 *
 * `onRefresh` is invoked after a successful rebuild action (bulk or single)
 * so the caller can re-fetch the diagnostic and the stats/badges refresh
 * to reflect the freshly populated tokens.
 */
export const ContactSearchDebugView: React.FC<{
  result: ContactSearchDebugResponse;
  onRefresh?: () => void;
}> = ({ result, onRefresh }) => (
  <>
    <AccountStatsCard stats={result.accountStats} onRefresh={onRefresh} />
    {result.targetContact && <TargetContactCard target={result.targetContact} onRefresh={onRefresh} />}
    <QueryTokensCard tokens={result.queryTokens} />
    <SqlCandidatesCard
      candidates={result.sqlCandidates}
      matchingTotal={result.sqlMatchingTotalCount}
      scannedCount={result.sqlCandidatesScannedCount}
      scanCapHit={result.sqlScanCapHit}
      scanCap={result.sqlScanCap}
      takeLimit={result.prodSearchTakeLimit}
    />
    <GmailCard result={result} />
    <details style={card}>
      <summary style={{ cursor: 'pointer', fontWeight: theme.typography.fontWeight.semibold }}>
        Raw JSON response
      </summary>
      <pre style={{ ...monospace, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {JSON.stringify(result, null, 2)}
      </pre>
    </details>
  </>
);
