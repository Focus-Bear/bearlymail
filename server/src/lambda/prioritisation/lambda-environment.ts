import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

export const LAMBDA_ENV = {
  APP_SECRET_ARN: "APP_SECRET_ARN",
  DB_SECRET_ARN: "DB_SECRET_ARN",
  RDS_PROXY_ENDPOINT: "RDS_PROXY_ENDPOINT",
} as const;

type SecretFetcher = (secretId: string) => Promise<Record<string, string>>;

/**
 * Maps the RDS-generated DB secret onto the DB_* variables
 * createTypeOrmConfig and pg-boss read, so the Lambda reuses the worker's
 * connection settings verbatim.
 */
const DB_SECRET_TO_ENV: ReadonlyArray<[string[], string]> = [
  [["host", "DB_HOST"], "DB_HOST"],
  [["port", "DB_PORT"], "DB_PORT"],
  [["username", "DB_USERNAME"], "DB_USERNAME"],
  [["password", "DB_PASSWORD"], "DB_PASSWORD"],
  [["dbname", "database", "DB_NAME"], "DB_NAME"],
];

const fetchSecretJson: SecretFetcher = async (secretId) => {
  const client = new SecretsManagerClient({});
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );
  if (!response.SecretString) {
    throw new Error(`Secret ${secretId} has no string value`);
  }
  return JSON.parse(response.SecretString) as Record<string, string>;
};

function setIfUnset(key: string, value: string | undefined): void {
  if (value === undefined || value === "" || process.env[key] !== undefined) {
    return;
  }
  process.env[key] = String(value);
}

/**
 * Loads the app and DB secrets into process.env once per cold start. ECS
 * injects the same AppSecrets keys as individual env vars; copying the whole
 * JSON keeps the Lambda's config surface identical to the worker's without a
 * second list of keys to maintain. Explicit Lambda env vars win.
 */
export async function loadLambdaEnvironment(
  fetchSecret: SecretFetcher = fetchSecretJson,
): Promise<void> {
  const appSecretArn = process.env[LAMBDA_ENV.APP_SECRET_ARN];
  const dbSecretArn = process.env[LAMBDA_ENV.DB_SECRET_ARN];
  const noSecret: Record<string, string> = {};
  const [appSecret, dbSecret] = await Promise.all([
    appSecretArn ? fetchSecret(appSecretArn) : noSecret,
    dbSecretArn ? fetchSecret(dbSecretArn) : noSecret,
  ]);

  for (const [key, value] of Object.entries(appSecret)) {
    setIfUnset(key, value);
  }
  // The proxy is the only route to RDS from the Lambda's subnets.
  setIfUnset("DB_HOST", process.env[LAMBDA_ENV.RDS_PROXY_ENDPOINT]);
  for (const [sourceKeys, envKey] of DB_SECRET_TO_ENV) {
    const sourceKey = sourceKeys.find((key) => dbSecret[key] !== undefined);
    setIfUnset(envKey, sourceKey ? dbSecret[sourceKey] : undefined);
  }
}
