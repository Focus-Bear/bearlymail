import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

import { API_URL } from 'config/api';
import { HTTP_FORBIDDEN, PENDING_GOOGLE_PERMISSION_ACTION_MAX_AGE_MS } from 'constants/numbers';
import {
  GMAIL_WRITE_ACTION_ARCHIVE,
  GMAIL_WRITE_ACTION_BLOCK_SENDER,
  GMAIL_WRITE_ACTION_DELETE,
  GMAIL_WRITE_ACTION_SEND,
  GMAIL_WRITE_ACTION_SNOOZE,
  GMAIL_WRITE_ACTION_STAR,
  GmailWriteAction,
  GOOGLE_PERMISSION_CALENDAR,
  GOOGLE_PERMISSION_CONTACTS,
  GOOGLE_PERMISSION_GMAIL_MANAGE,
  GOOGLE_PERMISSION_GMAIL_SEND,
  GOOGLE_PERMISSION_REQUIRED_CODE,
  IncrementalGooglePermissionGroup,
  PENDING_GOOGLE_PERMISSION_ACTION_KEY,
} from 'constants/strings';

const INCREMENTAL_GROUPS: readonly string[] = [
  GOOGLE_PERMISSION_GMAIL_MANAGE,
  GOOGLE_PERMISSION_GMAIL_SEND,
  GOOGLE_PERMISSION_CALENDAR,
  GOOGLE_PERMISSION_CONTACTS,
];
const GMAIL_WRITE_ACTIONS: readonly string[] = [
  GMAIL_WRITE_ACTION_ARCHIVE,
  GMAIL_WRITE_ACTION_DELETE,
  GMAIL_WRITE_ACTION_STAR,
  GMAIL_WRITE_ACTION_SNOOZE,
  GMAIL_WRITE_ACTION_BLOCK_SENDER,
  GMAIL_WRITE_ACTION_SEND,
];
const REPLAYABLE_METHODS: readonly string[] = ['post', 'put', 'patch', 'delete'];

function isIncrementalGroup(value: unknown): value is IncrementalGooglePermissionGroup {
  return typeof value === 'string' && INCREMENTAL_GROUPS.includes(value);
}

function isGmailWriteAction(value: unknown): value is GmailWriteAction {
  return typeof value === 'string' && GMAIL_WRITE_ACTIONS.includes(value);
}

/** What the server's GOOGLE_PERMISSION_REQUIRED 403 asks for. */
export interface GooglePermissionRequirement {
  permission: IncrementalGooglePermissionGroup;
  action?: GmailWriteAction;
}

interface GooglePermissionRequiredBody {
  code?: unknown;
  permission?: unknown;
  action?: unknown;
}

export function readGooglePermissionRequirement(error: unknown): GooglePermissionRequirement | null {
  if (!axios.isAxiosError(error) || error.response?.status !== HTTP_FORBIDDEN) {
    return null;
  }
  const body = error.response.data as GooglePermissionRequiredBody | undefined;
  if (body?.code !== GOOGLE_PERMISSION_REQUIRED_CODE || !isIncrementalGroup(body.permission)) {
    return null;
  }
  return {
    permission: body.permission,
    ...(isGmailWriteAction(body.action) ? { action: body.action } : {}),
  };
}

/**
 * The request a 403 refused, in a form that survives the trip to Google's
 * consent screen (a full-page redirect), so it can be sent again on return.
 */
export interface PendingGooglePermissionAction {
  permission: IncrementalGooglePermissionGroup;
  method: string;
  url: string;
  /** Already-serialised body (JSON) and its content type. */
  body?: string;
  contentType?: string;
  /** Text fields of a multipart body without files. */
  formFields?: [string, string][];
  params?: Record<string, string | number | boolean>;
  savedAt: number;
}

function readFormFields(formData: FormData): [string, string][] | null {
  const fields: [string, string][] = [];
  for (const [name, value] of formData.entries()) {
    if (typeof value !== 'string') {
      return null;
    }
    fields.push([name, value]);
  }
  return fields;
}

function readPrimitiveParams(params: unknown): Record<string, string | number | boolean> | null {
  if (params === undefined || params === null) {
    return {};
  }
  if (typeof params !== 'object') {
    return null;
  }
  const entries = Object.entries(params as Record<string, unknown>);
  const isPrimitive = (value: unknown) => ['string', 'number', 'boolean'].includes(typeof value);
  if (!entries.every(([, value]) => isPrimitive(value))) {
    return null;
  }
  return Object.fromEntries(entries) as Record<string, string | number | boolean>;
}

function readContentType(config: InternalAxiosRequestConfig): string | undefined {
  const header = config.headers?.['Content-Type'];
  return typeof header === 'string' ? header : undefined;
}

function readBody(
  config: InternalAxiosRequestConfig
): Pick<PendingGooglePermissionAction, 'body' | 'contentType' | 'formFields'> | null {
  const requestBody: unknown = config.data;
  if (requestBody === undefined || requestBody === null) {
    return {};
  }
  if (typeof requestBody === 'string') {
    return { body: requestBody, contentType: readContentType(config) };
  }
  if (requestBody instanceof FormData) {
    const formFields = readFormFields(requestBody);
    return formFields ? { formFields } : null;
  }
  return null;
}

/**
 * Null when the request can't be replayed faithfully: not one of our API's
 * mutations, or carrying files (attachments can't be kept across the
 * redirect — the user sends again once Google returns).
 */
export function toPendingAction(
  permission: IncrementalGooglePermissionGroup,
  config: InternalAxiosRequestConfig | undefined
): PendingGooglePermissionAction | null {
  const method = config?.method?.toLowerCase();
  const url = config?.url;
  if (!config || !method || !url || !REPLAYABLE_METHODS.includes(method) || !url.startsWith(API_URL)) {
    return null;
  }
  const body = readBody(config);
  const params = readPrimitiveParams(config.params);
  if (!body || !params) {
    return null;
  }
  return { permission, method, url, ...body, params, savedAt: Date.now() };
}

export function savePendingAction(action: PendingGooglePermissionAction): void {
  try {
    sessionStorage.setItem(PENDING_GOOGLE_PERMISSION_ACTION_KEY, JSON.stringify(action));
  } catch (err: unknown) {
    // Storage full or disabled: the grant still works, the action just isn't retried.
    console.warn('Could not keep the action to retry after the Google grant:', err);
  }
}

export function clearPendingAction(): void {
  try {
    sessionStorage.removeItem(PENDING_GOOGLE_PERMISSION_ACTION_KEY);
  } catch {
    // Nothing stored if storage is unavailable.
  }
}

function isPendingAction(value: unknown): value is PendingGooglePermissionAction {
  const candidate = value as Partial<PendingGooglePermissionAction> | null;
  return (
    !!candidate &&
    isIncrementalGroup(candidate.permission) &&
    typeof candidate.method === 'string' &&
    REPLAYABLE_METHODS.includes(candidate.method) &&
    typeof candidate.url === 'string' &&
    candidate.url.startsWith(API_URL) &&
    typeof candidate.savedAt === 'number'
  );
}

/** Returns the saved action once (it is removed), or null if none, stale or malformed. */
export function takePendingAction(now: number = Date.now()): PendingGooglePermissionAction | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PENDING_GOOGLE_PERMISSION_ACTION_KEY);
  } catch {
    return null;
  }
  clearPendingAction();
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPendingAction(parsed) || now - parsed.savedAt > PENDING_GOOGLE_PERMISSION_ACTION_MAX_AGE_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function rebuildFormData(fields: [string, string][]): FormData {
  const formData = new FormData();
  fields.forEach(([name, value]) => formData.append(name, value));
  return formData;
}

export async function replayPendingAction(action: PendingGooglePermissionAction): Promise<void> {
  const config: AxiosRequestConfig = {
    method: action.method,
    url: action.url,
    params: action.params,
    _skipGooglePermissionPrompt: true,
  };
  if (action.formFields) {
    config.data = rebuildFormData(action.formFields);
  } else if (action.body !== undefined) {
    config.data = action.body;
    config.headers = action.contentType ? { 'Content-Type': action.contentType } : undefined;
  }
  await axios.request(config);
}

/** Shown by the app (GooglePermissionExplainer); settles once the user cancels or the grant can't start. */
export interface GooglePermissionPrompt extends GooglePermissionRequirement {
  pendingAction: PendingGooglePermissionAction | null;
}
type GooglePermissionPromptHandler = (prompt: GooglePermissionPrompt) => Promise<void>;

// Interceptors live outside React, so the explainer registers itself here (as AiLimitBanner does).
let promptHandler: GooglePermissionPromptHandler | null = null;

export function registerGooglePermissionPromptHandler(handler: GooglePermissionPromptHandler | null): void {
  promptHandler = handler;
}

/**
 * For a GOOGLE_PERMISSION_REQUIRED 403: shows the explainer and holds the
 * caller's request until the user cancels (the original error is then
 * rethrown, so optimistic UI rolls back) or continues to Google (the page
 * navigates away). Returns false when the error isn't one, or nothing can
 * explain it.
 */
export async function promptForGooglePermission(
  error: unknown,
  config: InternalAxiosRequestConfig | undefined
): Promise<boolean> {
  const requirement = readGooglePermissionRequirement(error);
  if (!requirement || !promptHandler || config?._skipGooglePermissionPrompt) {
    return false;
  }
  await promptHandler({ ...requirement, pendingAction: toPendingAction(requirement.permission, config) });
  return true;
}

/** Fired after a retried action succeeds so open views (the inbox) refresh. */
export const GOOGLE_PERMISSION_ACTION_RETRIED_EVENT = 'bearlymail:google-permission-action-retried';
