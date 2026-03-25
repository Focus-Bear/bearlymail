# Lambda Secrets Setup (Post-Deploy)

After deploying `BearlyMailContextAnalysisStack`, populate the two Secrets Manager secrets
created by CDK. The secrets are created with placeholder values — update them before enabling
the Lambda path.

## 1. DB Secret (`bearlymail/lambda/db`)

The Lambda connects to RDS via RDS Proxy. Set the credentials:

```bash
aws secretsmanager put-secret-value \
  --secret-id bearlymail/lambda/db \
  --secret-string '{
    "host": "<RDS_PROXY_ENDPOINT>",
    "port": "5432",
    "username": "<DB_USERNAME>",
    "password": "<DB_PASSWORD>",
    "database": "bearlymail"
  }'
```

Get the RDS Proxy endpoint from CDK outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name BearlyMailContextAnalysisStack \
  --query "Stacks[0].Outputs[?OutputKey=='RdsProxyEndpoint'].OutputValue" \
  --output text
```

## 2. LLM Secret (`bearlymail/lambda/llm`)

Set the LLM provider API keys. Only the key for the active `LLM_PROVIDER` is required.

```bash
aws secretsmanager put-secret-value \
  --secret-id bearlymail/lambda/llm \
  --secret-string '{
    "ANTHROPIC_API_KEY": "<your-anthropic-key>",
    "OPENAI_API_KEY": "<your-openai-key>",
    "GEMINI_API_KEY": "<your-gemini-key>",
    "LLM_PROVIDER": "anthropic"
  }'
```

## 3. Enable the Lambda path

Set the following environment variables on the ECS server task definition (via CDK or console):

| Variable | Value |
|---|---|
| `LAMBDA_CONTEXT_ANALYSIS_ENABLED` | `true` |
| `CONTEXT_ANALYSIS_SQS_QUEUE_URL` | (from CDK output `BearlyMailContextAnalysisQueueUrl`) |

Get the queue URL:

```bash
aws cloudformation describe-stacks \
  --stack-name BearlyMailContextAnalysisStack \
  --query "Stacks[0].Outputs[?OutputKey=='QueueUrl'].OutputValue" \
  --output text
```

## 4. Verify

After enabling, monitor:

- **DLQ depth** — CloudWatch alarm `BearlyMail-ContextAnalysis-DLQ-NonEmpty`
- **Lambda errors** — CloudWatch alarm `BearlyMail-BatchAnalyzer-Errors`
- **Lambda invocations** — CloudWatch metrics for `bearlymail-batch-analyzer`

Feature flag defaults to `false` — safe to deploy the stack before enabling.

## 5. CI/CD: Add Lambda build + CDK deploy to deploy.yml

The GitHub App does not have `workflows` permission so this must be applied manually.
Add the following steps to `.github/workflows/deploy.yml` in the `deploy` job,
**before** the "CDK Deploy (infrastructure changes only)" section:

```yaml
      # ============================================
      # Lambda: Build batch-analyzer for deployment
      # ============================================
      - name: Install Lambda dependencies
        working-directory: lambda/batch-analyzer
        run: npm ci --legacy-peer-deps

      - name: Build Lambda
        working-directory: lambda/batch-analyzer
        run: npm run build
```

And **after** the `CDK Deploy Application Stack` step, add:

```yaml
      - name: CDK Deploy Context Analysis Stack
        working-directory: infrastructure
        run: |
          cdk deploy BearlyMailContextAnalysisStack \
            --require-approval never
```
