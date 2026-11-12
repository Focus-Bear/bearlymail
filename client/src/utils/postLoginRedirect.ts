/**
 * Remembers an in-app page to come back to after login, so a user who starts
 * on the OAuth consent page (from claude.ai) and has to sign in first — by
 * password or through Google/Microsoft, which land on /inbox — ends up back
 * on it. Session-scoped: it shouldn't survive closing the tab.
 */
const POST_LOGIN_PATH_KEY = 'bearlymail_post_login_path';

/** Only same-origin paths: never a scheme or protocol-relative `//host`. */
function isInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');
}

export function rememberPostLoginPath(path: string): void {
  if (!isInternalPath(path)) {
    return;
  }
  try {
    sessionStorage.setItem(POST_LOGIN_PATH_KEY, path);
  } catch {
    // Best-effort: without storage the user just lands on the inbox.
  }
}

export function peekPostLoginPath(): string | null {
  try {
    const path = sessionStorage.getItem(POST_LOGIN_PATH_KEY);
    return path && isInternalPath(path) ? path : null;
  } catch {
    return null;
  }
}

export function clearPostLoginPath(): void {
  try {
    sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
  } catch {
    // Best-effort.
  }
}
