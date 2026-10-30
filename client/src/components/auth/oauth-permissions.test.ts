import fs from 'node:fs';
import path from 'node:path';

import { PROVIDER_GOOGLE, PROVIDER_MICROSOFT, PROVIDER_ZOHO } from 'constants/strings';

import { OAUTH_PERMISSIONS, type OAuthProvider } from './oauth-permissions';

const SERVER_SRC_DIR = path.resolve(__dirname, '../../../../server/src');

/** Server file holding each provider's requested-scope array. */
const SCOPE_SOURCES: Record<OAuthProvider, { file: string; arrayPattern: RegExp }> = {
  [PROVIDER_GOOGLE]: {
    file: 'constants/google-oauth-scopes.ts',
    arrayPattern: /GOOGLE_OAUTH_SCOPES\s*=\s*\[([\s\S]*?)\]/,
  },
  [PROVIDER_MICROSOFT]: { file: 'auth/microsoft.strategy.ts', arrayPattern: /scope:\s*\[([\s\S]*?)\]/ },
  [PROVIDER_ZOHO]: { file: 'auth/zoho.strategy.ts', arrayPattern: /scope:\s*\[([\s\S]*?)\]/ },
};

/** `const NAME = "value"` declarations, so array entries may reference named scopes. */
function readStringConstants(source: string): Map<string, string> {
  return new Map(Array.from(source.matchAll(/const\s+(\w+)\s*=\s*"([^"]+)"/g), match => [match[1], match[2]]));
}

/** Pulls the scope strings (literals or named constants) out of the provider's scope array. */
function readServerScopes(provider: OAuthProvider): string[] {
  const { file, arrayPattern } = SCOPE_SOURCES[provider];
  const source = fs.readFileSync(path.join(SERVER_SRC_DIR, file), 'utf8');
  const scopeBlock = source.match(arrayPattern);
  if (!scopeBlock) {
    throw new Error(`No scope array found in ${file}`);
  }
  const constants = readStringConstants(source);
  const withoutComments = scopeBlock[1].replace(/^\s*\/\/.*$/gm, '');
  return Array.from(withoutComments.matchAll(/"([^"]+)"|\b([A-Z][A-Z0-9_]+)\b/g), match =>
    match[1] ?? constants.get(match[2]) ?? match[2]
  ).sort();
}

describe('OAUTH_PERMISSIONS', () => {
  it.each(Object.keys(SCOPE_SOURCES) as OAuthProvider[])(
    'explains exactly the scopes the %s strategy requests',
    provider => {
      const explained = OAUTH_PERMISSIONS[provider].flatMap(permission => permission.scopes).sort();
      expect(explained).toEqual(readServerScopes(provider));
    }
  );
});
