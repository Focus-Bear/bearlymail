import {
  FOCUS_BEAR_CREATE_TASK_URL,
  FOCUS_BEAR_TASK_ELLIPSIS,
  FOCUS_BEAR_TASK_MAX_NOTES_LENGTH,
  FOCUS_BEAR_TASK_MAX_TITLE_LENGTH,
  FOCUS_BEAR_TASK_MAX_URL_LENGTH,
} from 'constants/focusBearTaskLink';

import { buildFocusBearTaskLink, focusBearTaskSourceFor, truncateForFocusBear } from './focusBearTaskLink';

const EMAIL_URL = 'https://app.bearlymail.com/email/3f0c6a52-0000-4000-8000-000000000001';

function paramsOf(link: string): URLSearchParams {
  return new URL(link).searchParams;
}

describe('buildFocusBearTaskLink', () => {
  it('opens the create-task route with the title, notes, link back and source', () => {
    const link = buildFocusBearTaskLink({
      title: 'Send Sam the signed contract',
      notes: 'From Sam Patel: "Contract & next steps"',
      link: EMAIL_URL,
    });

    expect(link.startsWith(`${FOCUS_BEAR_CREATE_TASK_URL}?`)).toBe(true);
    const params = paramsOf(link);
    expect(params.get('title')).toBe('Send Sam the signed contract');
    expect(params.get('notes')).toBe('From Sam Patel: "Contract & next steps"');
    expect(params.get('link')).toBe(EMAIL_URL);
    expect(params.get('source')).toBe('bearlymail');
  });

  it('percent-encodes so an & or = in the text cannot split a parameter', () => {
    const link = buildFocusBearTaskLink({ title: 'Q&A = done? #1 100%', link: EMAIL_URL });

    expect(link).not.toContain('Q&A');
    expect(link).not.toContain('+');
    expect(link).toContain('Q%26A%20%3D%20done%3F%20%231%20100%25');
    expect(paramsOf(link).get('title')).toBe('Q&A = done? #1 100%');
  });

  it('leaves notes out when there are none', () => {
    expect(paramsOf(buildFocusBearTaskLink({ title: 'Reply' })).has('notes')).toBe(false);
  });

  it('caps the title and notes at their budgets', () => {
    const params = paramsOf(
      buildFocusBearTaskLink({
        title: 'a'.repeat(FOCUS_BEAR_TASK_MAX_TITLE_LENGTH + 50),
        notes: 'b'.repeat(FOCUS_BEAR_TASK_MAX_NOTES_LENGTH + 50),
      })
    );

    expect(Array.from(params.get('title') ?? '')).toHaveLength(FOCUS_BEAR_TASK_MAX_TITLE_LENGTH);
    expect(params.get('title')?.endsWith(FOCUS_BEAR_TASK_ELLIPSIS)).toBe(true);
    expect(Array.from(params.get('notes') ?? '')).toHaveLength(FOCUS_BEAR_TASK_MAX_NOTES_LENGTH);
  });

  it('shortens non-Latin notes until the encoded link fits, keeping the link back whole', () => {
    const link = buildFocusBearTaskLink({
      title: 'Ответить Наталье',
      notes: '日本語のメール本文🐻'.repeat(100),
      link: EMAIL_URL,
    });

    expect(link.length).toBeLessThanOrEqual(FOCUS_BEAR_TASK_MAX_URL_LENGTH);
    const params = paramsOf(link);
    expect(params.get('link')).toBe(EMAIL_URL);
    expect(params.get('title')).toBe('Ответить Наталье');
    expect(params.get('notes')?.endsWith(FOCUS_BEAR_TASK_ELLIPSIS)).toBe(true);
  });

  it('shortens the title too when the notes alone cannot make it fit', () => {
    const link = buildFocusBearTaskLink({ title: '🐻'.repeat(FOCUS_BEAR_TASK_MAX_TITLE_LENGTH), notes: '' });

    expect(link.length).toBeLessThanOrEqual(FOCUS_BEAR_TASK_MAX_URL_LENGTH);
    expect(paramsOf(link).get('title')?.endsWith(FOCUS_BEAR_TASK_ELLIPSIS)).toBe(true);
  });
});

describe('buildFocusBearTaskLink — project and due date', () => {
  const PROJECT_ID = '9b2f7c1e-0000-4000-8000-0000000000aa';

  it('carries the chosen project, due date and duration', () => {
    const params = paramsOf(
      buildFocusBearTaskLink({
        title: 'Complete the evaluation form',
        projectId: PROJECT_ID,
        dueDate: '2026-11-12',
        durationMinutes: 90,
      })
    );

    expect(params.get('project_id')).toBe(PROJECT_ID);
    expect(params.get('due_date')).toBe('2026-11-12');
    expect(params.get('duration_minutes')).toBe('90');
  });

  it('leaves them out when there are none, so Focus Bear picks the next free day', () => {
    const params = paramsOf(buildFocusBearTaskLink({ title: 'Reply' }));

    expect(params.has('project_id')).toBe(false);
    expect(params.has('due_date')).toBe(false);
    expect(params.has('duration_minutes')).toBe(false);
  });

  it('never cuts them when the text has to shrink to fit', () => {
    const link = buildFocusBearTaskLink({
      title: 'Ответить Наталье',
      notes: '日本語のメール本文🐻'.repeat(100),
      link: EMAIL_URL,
      projectId: PROJECT_ID,
      dueDate: '2026-11-12',
      durationMinutes: 45,
    });

    expect(link.length).toBeLessThanOrEqual(FOCUS_BEAR_TASK_MAX_URL_LENGTH);
    expect(paramsOf(link).get('project_id')).toBe(PROJECT_ID);
    expect(paramsOf(link).get('due_date')).toBe('2026-11-12');
    expect(paramsOf(link).get('duration_minutes')).toBe('45');
  });
});

describe('truncateForFocusBear', () => {
  it('never splits an emoji', () => {
    expect(truncateForFocusBear('🐻🐻🐻', 2)).toBe(`🐻${FOCUS_BEAR_TASK_ELLIPSIS}`);
  });

  it('keeps text that already fits, trimmed', () => {
    expect(truncateForFocusBear('  short  ', 10)).toBe('short');
  });
});

describe('focusBearTaskSourceFor', () => {
  it('names the sender and links back to the email', () => {
    expect(
      focusBearTaskSourceFor(
        { id: 'abc 1', subject: 'Contract', from: 'sam@example.com', fromName: 'Sam Patel' },
        'https://app.bearlymail.com'
      )
    ).toEqual({
      emailSubject: 'Contract',
      sender: 'Sam Patel',
      emailUrl: 'https://app.bearlymail.com/email/abc%201',
    });
  });

  it('falls back to the address when the sender has no name', () => {
    expect(focusBearTaskSourceFor({ id: 'e1', subject: 'Hi', from: 'sam@example.com' }, 'https://x.test').sender).toBe(
      'sam@example.com'
    );
  });
});
