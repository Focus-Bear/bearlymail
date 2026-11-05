import { PatScope } from 'constants/claudeAccess';

/** A token as `GET /personal-access-tokens` lists it (never includes the secret). */
export interface PersonalAccessToken {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: PatScope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedPersonalAccessToken {
  /** Plaintext token: shown once, then gone. */
  token: string;
  summary: PersonalAccessToken;
}

export interface CreatePersonalAccessTokenInput {
  name: string;
  scopes: PatScope[];
  expiresInDays: number | null;
}
