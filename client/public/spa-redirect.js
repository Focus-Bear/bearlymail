// SPA deep-link recovery: on the static host, unknown routes 404 → redirect to /
// with the original path stored in sessionStorage. This script (which runs before the
// React bundle) restores the URL so the client-side router can pick it up.
//
// Lives in a separate file (rather than inline in index.html) so the CSP can omit
// `script-src 'unsafe-inline'`. The Vite SRI plugin injects an integrity hash on build.
(function () {
  var redirect = sessionStorage.getItem('spa-redirect');
  if (redirect) {
    sessionStorage.removeItem('spa-redirect');
    try {
      history.replaceState(null, '', redirect);
    } catch (error) {
      console.error('[spa-redirect] Failed to restore redirect URL:', error);
    }
  }
})();
