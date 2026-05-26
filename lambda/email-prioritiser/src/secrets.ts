/**
 * AWS Secrets Manager client for the Lambda function.
 * Secrets are cached in-memory across warm invocations to reduce latency.
 */
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({
  region: process.env.AWS_REGION || "ap-southeast-2",
});

const SECRET_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedSecret = {
  value: Record<string, string>;
  expiresAt: number;
};

const secretCache = new Map<string, CachedSecret>();

async function getSecret(secretName: string): Promise<Record<string, string>> {
  const now = Date.now();
  const cached = secretCache.get(secretName);
  if (cached && now < cached.expiresAt) return cached.value;

  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error(`Secret ${secretName} has no string value`);
  }

  const parsed = JSON.parse(response.SecretString) as Record<string, string>;
  secretCache.set(secretName, { value: parsed, expiresAt: now + SECRET_CACHE_TTL_MS });
  return parsed;
}

export interface DbSecrets {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export interface LlmSecrets {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  LLM_PROVIDER?: string;
}

export function resolveLlmProvider(secrets: LlmSecrets): string {
  const raw = secrets.LLM_PROVIDER?.trim();
  return (raw || "openai").toLowerCase();
}

const DB_SECRET_NAME =
  process.env.DB_SECRET_ARN || "bearlymail/lambda/db";
const LLM_SECRET_NAME =
  process.env.APP_SECRET_ARN || "bearlymail/lambda/llm";

export async function getDbSecrets(): Promise<DbSecrets> {
  const raw = await getSecret(DB_SECRET_NAME);
  return {
    host: raw.host || raw.DB_HOST,
    port: parseInt(raw.port || raw.DB_PORT || "5432", 10),
    username: raw.username || raw.DB_USERNAME,
    password: raw.password || raw.DB_PASSWORD,
    database: raw.database || raw.DB_NAME || "bearlymail",
  };
}

export async function getLlmSecrets(): Promise<LlmSecrets> {
  return getSecret(LLM_SECRET_NAME) as Promise<LlmSecrets>;
}

/**
 * The global ENCRYPTION_KEY (same JSON app secret as ECS / the batch Lambda).
 * Used as the AES key material when KMS is disabled or a user has no per-user
 * data key; the per-user key (when KMS is enabled) is derived in user-key.ts.
 */
export async function getEncryptionKeyString(): Promise<string> {
  const raw = await getSecret(LLM_SECRET_NAME);
  const key = raw.ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY is missing from the app secret — prioritiser cannot encrypt email_threads explanation columns",
    );
  }
  return key;
}
