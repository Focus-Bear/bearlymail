#!/usr/bin/env node
/**
 * End-to-end check of the MCP OAuth flow against a running API, using the
 * official @modelcontextprotocol/sdk client the way claude.ai / Claude Code do:
 * 401 discovery → metadata → client registration → authorize + PKCE → consent
 * (as the logged-in user) → token → MCP calls → refresh → revoke.
 *
 * Runs twice: once with dynamic client registration, once with a Client ID
 * Metadata Document (Claude Code's real one, fetched from claude.ai).
 *
 * Usage (with `npm run local` running):
 *   node server/scripts/verify-mcp-oauth.mjs
 * Env: API_URL (default http://localhost:3001), LOGIN_EMAIL / LOGIN_PASSWORD
 * (default: the seeded user in .localdata/local.env).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API_URL = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const MCP_URL = `${API_URL}/mcp`;
const CLAUDE_CODE_METADATA_URL = 'https://claude.ai/oauth/claude-code-client-metadata';
const LOOPBACK_CALLBACK = 'http://localhost:53682/callback';

const log = (message) => console.log(`\x1b[36m[verify]\x1b[0m ${message}`);

function localCredentials() {
  if (process.env.LOGIN_EMAIL && process.env.LOGIN_PASSWORD) {
    return { email: process.env.LOGIN_EMAIL, password: process.env.LOGIN_PASSWORD };
  }
  const env = Object.fromEntries(
    readFileSync(join(repoRoot, '.localdata', 'local.env'), 'utf8')
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
  return { email: env.LOCAL_USER_EMAIL, password: env.LOCAL_USER_PASSWORD };
}

async function login() {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(localCredentials()),
  });
  assert.equal(response.status, 201, `login failed: ${response.status}`);
  const body = await response.json();
  return body.access_token;
}

/** In-memory OAuthClientProvider; "redirecting" just records the URL. */
class RecordingProvider {
  constructor({ clientMetadataUrl } = {}) {
    this.clientMetadataUrl = clientMetadataUrl;
    this.authorizationUrl = null;
  }
  get redirectUrl() {
    return LOOPBACK_CALLBACK;
  }
  get clientMetadata() {
    return {
      client_name: 'BearlyMail OAuth e2e',
      redirect_uris: [LOOPBACK_CALLBACK],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }
  state() {
    return 'e2e-state';
  }
  clientInformation() {
    return this.client;
  }
  saveClientInformation(client) {
    this.client = client;
  }
  tokens() {
    return this.savedTokens;
  }
  saveTokens(tokens) {
    this.savedTokens = tokens;
  }
  redirectToAuthorization(url) {
    this.authorizationUrl = url;
  }
  saveCodeVerifier(verifier) {
    this.verifier = verifier;
  }
  codeVerifier() {
    return this.verifier;
  }
}

async function expectDiscoveryChallenge() {
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(response.status, 401);
  const challenge = response.headers.get('www-authenticate') ?? '';
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
  assert.ok(metadataUrl, `no resource_metadata in: ${challenge}`);
  assert.match(challenge, /scope="mail:read mail:send"/);
  const resource = await (await fetch(metadataUrl)).json();
  assert.equal(resource.resource, MCP_URL);
  const issuer = resource.authorization_servers[0];
  const server = await (await fetch(`${issuer}/.well-known/oauth-authorization-server`)).json();
  assert.equal(server.client_id_metadata_document_supported, true);
  assert.deepEqual(server.code_challenge_methods_supported, ['S256']);
  assert.ok(server.token_endpoint_auth_methods_supported.includes('none'));
  log(`401 challenge → ${metadataUrl} → issuer ${issuer}: OK`);
}

/** What the browser + consent page do: follow /oauth/authorize, answer as the user. */
async function requestStepUpToken(auth) {
  const response = await fetch(`${API_URL}/auth/step-up`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ password: localCredentials().password }),
  });
  assert.ok(response.ok, `step-up failed: ${response.status}`);
  return (await response.json()).step_up_token;
}

async function approveInBrowser(authorizationUrl, jwt, allowSend) {
  const authorize = await fetch(authorizationUrl, { redirect: 'manual' });
  assert.equal(authorize.status, 302, `authorize: ${authorize.status} ${await authorize.text()}`);
  const consentUrl = new URL(authorize.headers.get('location'));
  assert.equal(consentUrl.pathname, '/oauth/consent');
  const requestId = consentUrl.searchParams.get('request');
  const auth = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

  const view = await (await fetch(`${API_URL}/oauth/consent-requests/${requestId}`, { headers: auth })).json();
  log(`consent screen: "${view.clientName}" (${view.clientHost ?? 'self-described'}) → ${view.redirectHost}, loopback=${view.isLoopbackRedirect}`);

  const decision = await fetch(`${API_URL}/oauth/consent-requests/${requestId}/decision`, {
    method: 'POST',
    headers: { ...auth, 'X-Step-Up-Token': await requestStepUpToken(auth) },
    body: JSON.stringify({ approve: true, allowSend }),
  });
  assert.equal(decision.status, 200);
  const callback = new URL((await decision.json()).redirectUrl);
  assert.equal(callback.searchParams.get('state'), 'e2e-state');
  assert.equal(callback.searchParams.get('iss'), API_URL);
  return callback.searchParams.get('code');
}

async function connectedClient(provider) {
  const client = new Client({ name: 'bearlymail-oauth-e2e', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider }));
  return client;
}

async function mcpStatus(accessToken) {
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });
  return response.status;
}

async function runFlow(label, provider, jwt, allowSend) {
  log(`── ${label} ──`);
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider });
  const client = new Client({ name: 'bearlymail-oauth-e2e', version: '1.0.0' });
  await assert.rejects(client.connect(transport), UnauthorizedError);
  assert.ok(provider.authorizationUrl, 'SDK never started authorization');
  const authorizationUrl = new URL(provider.authorizationUrl);
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorizationUrl.searchParams.get('resource'), MCP_URL);
  log(`client_id ${authorizationUrl.searchParams.get('client_id')}, scope "${authorizationUrl.searchParams.get('scope')}"`);

  const code = await approveInBrowser(authorizationUrl, jwt, allowSend);
  await transport.finishAuth(code);
  const tokens = provider.tokens();
  assert.ok(tokens.refresh_token, 'no refresh token');
  log(`tokens: scope "${tokens.scope}", expires_in ${tokens.expires_in}s`);

  const mcp = await connectedClient(provider);
  const tools = (await mcp.listTools()).tools.map((tool) => tool.name);
  log(`tools/list: ${tools.join(', ')}`);
  assert.equal(tools.includes('send_email'), allowSend);
  const result = await mcp.callTool({ name: 'list_follow_ups', arguments: {} });
  log(`list_follow_ups → isError=${Boolean(result.isError)}`);
  await mcp.close();

  const refreshed = await fetch(`${API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: provider.clientInformation().client_id,
      resource: MCP_URL,
    }),
  });
  assert.equal(refreshed.status, 200, `refresh: ${await refreshed.clone().text()}`);
  const rotated = await refreshed.json();
  assert.notEqual(rotated.refresh_token, tokens.refresh_token);
  assert.equal(await mcpStatus(tokens.access_token), 401, 'old access token still works after refresh');
  assert.equal(await mcpStatus(rotated.access_token), 200);
  log('refresh rotates both tokens; old access token → 401: OK');
  return rotated.access_token;
}

async function revokeFromSettings(jwt, accessToken) {
  const headers = { Authorization: `Bearer ${jwt}` };
  const list = await (await fetch(`${API_URL}/personal-access-tokens`, { headers })).json();
  const connections = list.filter((row) => row.kind === 'oauth');
  log(`Settings lists ${connections.length} OAuth connection(s): ${connections.map((row) => row.name).join('; ')}`);
  for (const row of connections) {
    const response = await fetch(`${API_URL}/personal-access-tokens/${row.id}`, { method: 'DELETE', headers });
    assert.equal(response.status, 204);
  }
  assert.equal(await mcpStatus(accessToken), 401, 'revoked connection still works');
  log('revoke from Settings → 401: OK');
}

await expectDiscoveryChallenge();
const jwt = await login();
await runFlow('dynamic client registration, read only', new RecordingProvider(), jwt, false);
const accessToken = await runFlow(
  'Client ID Metadata Document (Claude Code), read + send',
  new RecordingProvider({ clientMetadataUrl: CLAUDE_CODE_METADATA_URL }),
  jwt,
  true,
);
await revokeFromSettings(jwt, accessToken);
log('\x1b[32mAll MCP OAuth checks passed.\x1b[0m');
