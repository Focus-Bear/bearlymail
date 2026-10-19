import fs from 'node:fs';
import path from 'node:path';

import { PROVIDER_GOOGLE, PROVIDER_MICROSOFT, PROVIDER_ZOHO } from 'constants/strings';

import { OAUTH_PERMISSIONS, type OAuthProvider } from './oauth-permissions';

const SERVER_AUTH_DIR = path.resolve(__dirname, '../../../../server/src/auth');

const STRATEGY_FILES: Record<OAuthProvider, string> = {
  [PROVIDER_GOOGLE]: 'google.strategy.ts',
  [PROVIDER_MICROSOFT]: 'microsoft.strategy.ts',
  [PROVIDER_ZOHO]: 'zoho.strategy.ts',
};

/** Pulls the string literals out of the strategy's `scope: [...]` array. */
function readServerScopes(file: string): string[] {
  const source = fs.readFileSync(path.join(SERVER_AUTH_DIR, file), 'utf8');
  const scopeBlock = source.match(/scope:\s*\[([\s\S]*?)\]/);
  if (!scopeBlock) {
    throw new Error(`No scope array found in ${file}`);
  }
  const withoutComments = scopeBlock[1].replace(/^\s*\/\/.*$/gm, '');
  return Array.from(withoutComments.matchAll(/"([^"]+)"/g), match => match[1]).sort();
}

describe('OAUTH_PERMISSIONS', () => {
  it.each(Object.keys(STRATEGY_FILES) as OAuthProvider[])(
    'explains exactly the scopes the %s strategy requests',
    provider => {
      const explained = OAUTH_PERMISSIONS[provider].flatMap(permission => permission.scopes).sort();
      expect(explained).toEqual(readServerScopes(STRATEGY_FILES[provider]));
    }
  );
});
