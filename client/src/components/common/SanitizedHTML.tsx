import React from 'react';
import DOMPurify from 'dompurify';

interface SanitizedHTMLProps {
  html: string;
  className?: string;
}

/**
 * Renders sanitized HTML content using DOMPurify.
 *
 * Centralises the `dangerouslySetInnerHTML` + DOMPurify pattern so that lint
 * suppressions live in exactly one place (this wrapper) rather than scattered
 * across consumer components.
 *
 * All callers must pass HTML through this component rather than using
 * `dangerouslySetInnerHTML` directly — that keeps the "safe HTML" policy
 * auditable and testable in one location.
 */
export const SanitizedHTML: React.FC<SanitizedHTMLProps> = ({ html, className }) => (
  <div className={className} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
);
