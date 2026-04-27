# DNS Subdomain Takeover Audit — Runbook

**Related**: GAP-7 in `docs/security-remediation-plan.md` | SAQ Q7 compliance requirement  
**Workflow**: `.github/workflows/dns-audit.yml`  
**Severity**: High — a successful subdomain takeover allows an attacker to serve content under `bearlymail.com` and steal user credentials or session cookies.

---

## What is Subdomain Takeover?

When a DNS record (CNAME or alias) points to a third-party service that no longer has a resource configured for that hostname, an attacker can register the resource themselves and take control of the subdomain.

**Example attack chain**:
1. BearlyMail had `staging.app.bearlymail.com` → CNAME → `bearlymail-staging.somecdn.net`
2. The staging environment was decommissioned, but the DNS record was not removed.
3. An attacker registers `bearlymail-staging.somecdn.net` on the CDN provider.
4. They now control `staging.app.bearlymail.com` — can serve phishing pages, steal cookies, etc.

---

## Monitored Subdomains

The workflow checks these subdomains on every run. **Keep this list in sync with `infrastructure/bin/app.ts`.**

| Subdomain | Service | DNS Record Type |
|---|---|---|
| `app.bearlymail.com` | CloudFront (S3 frontend) | Route53 Alias (A) |
| `api.app.bearlymail.com` | Application Load Balancer | Route53 Alias (A) |
| `queue.api.app.bearlymail.com` | Application Load Balancer (PgBoss dashboard) | Route53 Alias (A) |

### Adding a New Subdomain to Monitor

When you provision a new DNS record:

1. Open `.github/workflows/dns-audit.yml`.
2. Add the new subdomain to the `DOMAINS` array near the top of the `Run DNS audit` step:

```yaml
DOMAINS=(
  "app.bearlymail.com"
  "api.app.bearlymail.com"
  "queue.api.app.bearlymail.com"
  "your-new-subdomain.bearlymail.com"   # ← add here
)
```

3. Commit and push. The next weekly run will include the new subdomain.

---

## Audit Schedule and Manual Runs

- **Automatic**: Every Monday at 09:00 UTC (weekly).
- **Manual trigger**: GitHub Actions → **DNS Subdomain Takeover Audit** → **Run workflow**. Optionally enable *debug* mode for verbose output.

---

## Understanding Audit Results

### ✅ All Clear

All checked subdomains resolve correctly and return expected HTTP status codes. No action required.

### ⚠️ Warnings

The audit passed without critical failures, but flagged something worth reviewing:

| Warning | Meaning | Action |
|---|---|---|
| HTTP status unexpected (e.g. 500) | Subdomain resolves but service may be degraded | Investigate health of the backing service |
| HTTP check timed out (status 000) | Connectivity issue or TLS misconfiguration | Verify the resource is running; check ACM certificate |
| CNAME to a historically vulnerable service | Service type (e.g. S3, GitHub Pages) can be taken over if deprovisioned | Confirm the backing resource still exists; document why this CNAME is expected |

### ❌ Critical Issues (GitHub issue auto-created)

| Issue | Meaning | Immediate Action |
|---|---|---|
| Domain does not resolve (NXDOMAIN) | DNS record exists but target is gone | Remove the DNS record from Route53 **now** |
| CNAME target does not resolve | Dangling CNAME — prime takeover vector | Remove or update the CNAME record **now** |
| Takeover indicator in HTTP response | Service confirms no resource exists | Remove DNS record and investigate for active takeover |
| No A/AAAA/CNAME records | Orphaned DNS entry | Remove the record |

---

## Incident Response

### Severity Classification

| Scenario | Severity | SLA |
|---|---|---|
| CNAME target NXDOMAIN (not yet claimed) | **High** | Remediate within 4 hours |
| Takeover indicator returned by HTTP probe | **Critical** | Remediate within 1 hour; initiate security incident |
| HTTP timeout / unexpected status | **Medium** | Remediate within 24 hours |

### Response Procedure

#### 1. Triage (< 15 minutes)

```bash
# Check current DNS resolution
dig +short <subdomain>
dig +short CNAME <subdomain>

# Check if the CNAME target resolves
dig +short <cname-target>

# Check HTTP response
curl -I https://<subdomain>
```

Confirm the scope:
- Is the DNS record intentional (active service) or stale (decommissioned service)?
- Has the CNAME target already been claimed by someone else?

#### 2. Remediation

**Option A: Remove the stale DNS record (most common)**

```bash
# Via AWS CLI
aws route53 change-resource-record-sets \
  --hosted-zone-id <HOSTED_ZONE_ID> \
  --change-batch '{
    "Changes": [{
      "Action": "DELETE",
      "ResourceRecordSet": {
        "Name": "<subdomain>",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "<cname-target>"}]
      }
    }]
  }'
```

Or use the AWS Console → Route53 → Hosted Zones → `bearlymail.com` → delete the record.

**Option B: Re-provision the backing resource**

If the subdomain should still be active but the resource was accidentally deleted:
1. Re-create the AWS resource (CloudFront distribution, ALB, S3 bucket, etc.).
2. Update the DNS record to point to the new resource.
3. Verify the subdomain resolves correctly.
4. Re-run the DNS audit to confirm.

#### 3. Verify Resolution

After remediation, re-run the audit workflow manually:

1. Go to **Actions** → **DNS Subdomain Takeover Audit** → **Run workflow**.
2. Enable *debug* mode for detailed output.
3. Confirm all checks pass.
4. Close the GitHub security issue with a comment describing what was done.

#### 4. Post-Incident Review

For any **Critical** or **High** severity incident:
1. Add the subdomain to the monitored list if it was missing.
2. Document the root cause (e.g., "CloudFormation stack deletion didn't clean up DNS records").
3. Add a step to the relevant runbook/offboarding checklist: "Remove DNS records when decommissioning service X".
4. Consider adding automated DNS cleanup to CDK destroy commands.

---

## False Positives

If the audit flags a domain that you believe is healthy:

1. Run the audit in debug mode and review the raw dig/curl output.
2. Check if the domain has an unusual setup (e.g., returns 403 Forbidden intentionally).
3. If the domain is legitimately restricted (e.g., admin dashboard behind IP allowlist): update the workflow's HTTP check for that domain to accept 4xx responses.
4. Suppress persistent warnings by adding a comment in the workflow YAML explaining why the pattern is safe for this specific domain.

---

## Decommissioning a Subdomain

**Always follow this order** when retiring a service:

1. **Remove the DNS record first** (Route53 → delete the CNAME/A/alias record).
2. Wait for TTL to expire (typically 5 minutes for Route53 alias, up to TTL value for CNAMEs).
3. Then delete the backing resource (CloudFront distribution, ALB, S3 bucket, etc.).
4. Remove the subdomain from the `DOMAINS` list in the DNS audit workflow.
5. Run the audit to confirm the subdomain no longer appears as an issue.

> ⚠️ **Never delete the backing resource before removing the DNS record.** This is the root cause of subdomain takeover vulnerabilities.

---

## Route53 Hosted Zone Reference

| Property | Value |
|---|---|
| Root domain | `bearlymail.com` |
| Application domain | `app.bearlymail.com` |
| Hosted Zone ID | `Z04117591ORLVZWX6SSWO` |
| AWS Region | `ap-southeast-2` (Sydney) |

---

## Related Resources

- [`infrastructure/bin/app.ts`](../infrastructure/bin/app.ts) — CDK app with all domain configuration
- [`infrastructure/lib/bearlymail-networking-stack.ts`](../infrastructure/lib/bearlymail-networking-stack.ts) — Route53 and certificate setup
- [`docs/security-remediation-plan.md`](security-remediation-plan.md) — GAP-7 full context
- [AWS Route53 documentation](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html)
- [Subdomain Takeover — HackTricks](https://book.hacktricks.xyz/pentesting-web/domain-subdomain-takeover)
- [can-i-take-over-xyz](https://github.com/EdOverflow/can-i-take-over-xyz) — Reference list of takeover-vulnerable services
