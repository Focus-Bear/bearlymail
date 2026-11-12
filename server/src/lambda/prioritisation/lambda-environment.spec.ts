import { LAMBDA_ENV, loadLambdaEnvironment } from "./lambda-environment";

const MANAGED_KEYS = [
  LAMBDA_ENV.APP_SECRET_ARN,
  LAMBDA_ENV.DB_SECRET_ARN,
  LAMBDA_ENV.RDS_PROXY_ENDPOINT,
  "OPENAI_API_KEY",
  "LLM_PROVIDER",
  "DB_HOST",
  "DB_PORT",
  "DB_USERNAME",
  "DB_PASSWORD",
  "DB_NAME",
];

describe("loadLambdaEnvironment", () => {
  const original = { ...process.env };

  beforeEach(() => {
    for (const key of MANAGED_KEYS) delete process.env[key];
    process.env[LAMBDA_ENV.APP_SECRET_ARN] = "app-secret-arn";
    process.env[LAMBDA_ENV.DB_SECRET_ARN] = "db-secret-arn";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  const fetchSecret = jest.fn(async (secretId: string) =>
    secretId === "app-secret-arn"
      ? { OPENAI_API_KEY: "sk-test", LLM_PROVIDER: "openai" }
      : {
          host: "rds-instance",
          port: "5432",
          username: "app",
          password: "pw",
          dbname: "bearlymail",
        },
  );

  it("copies every app secret key into the environment", async () => {
    await loadLambdaEnvironment(fetchSecret);
    expect(process.env.OPENAI_API_KEY).toBe("sk-test");
    expect(process.env.LLM_PROVIDER).toBe("openai");
  });

  it("maps the RDS secret onto DB_* and routes through the proxy", async () => {
    process.env[LAMBDA_ENV.RDS_PROXY_ENDPOINT] = "proxy-endpoint";
    await loadLambdaEnvironment(fetchSecret);
    expect(process.env.DB_HOST).toBe("proxy-endpoint");
    expect(process.env.DB_PORT).toBe("5432");
    expect(process.env.DB_USERNAME).toBe("app");
    expect(process.env.DB_PASSWORD).toBe("pw");
    expect(process.env.DB_NAME).toBe("bearlymail");
  });

  it("falls back to the secret's host when no proxy is configured", async () => {
    await loadLambdaEnvironment(fetchSecret);
    expect(process.env.DB_HOST).toBe("rds-instance");
  });

  it("lets explicit Lambda env vars win over secret values", async () => {
    process.env.LLM_PROVIDER = "gemini";
    await loadLambdaEnvironment(fetchSecret);
    expect(process.env.LLM_PROVIDER).toBe("gemini");
  });
});
