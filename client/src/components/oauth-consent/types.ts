/** A pending authorization as `GET /oauth/consent-requests/:id` returns it. */
export interface OAuthConsentRequest {
  id: string;
  clientName: string;
  clientId: string;
  /** Host that published the client's metadata document (claude.ai), if it used one. */
  clientHost: string | null;
  /** Where the browser is sent after the user answers. */
  redirectHost: string;
  isLoopbackRedirect: boolean;
  canRequestSend: boolean;
  expiresAt: string;
}

export interface OAuthConsentDecision {
  approve: boolean;
  allowSend: boolean;
}
