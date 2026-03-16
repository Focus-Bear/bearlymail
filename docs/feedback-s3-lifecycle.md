# Feedback Screenshots — S3 Lifecycle Rule

## Overview

Feedback screenshots are uploaded to S3 under the `feedback/` prefix. To limit
storage costs and comply with data minimisation principles, an S3 lifecycle rule
must be configured to expire objects under this prefix after **90 days**.

After 90 days the S3 object is deleted. The corresponding database row (feedback
text + encrypted email) is **not** automatically deleted — only the screenshot.
Once expired, the `screenshotUrl` field in the admin view will return a 403/404;
the text content remains visible.

---

## AWS Console

1. Open **S3 → your-bucket → Management → Lifecycle rules → Create lifecycle rule**.
2. **Rule name:** `feedback-screenshot-expiry`
3. **Filter:** Prefix = `feedback/`
4. **Lifecycle rule actions:** ✅ Expire current versions of objects
5. **Days after object creation:** `90`
6. Save.

---

## Terraform / OpenTofu

```hcl
resource "aws_s3_bucket_lifecycle_configuration" "feedback_expiry" {
  bucket = var.feedback_screenshots_bucket

  rule {
    id     = "feedback-screenshot-expiry"
    status = "Enabled"

    filter {
      prefix = "feedback/"
    }

    expiration {
      days = 90
    }
  }
}
```

---

## AWS CLI (one-shot)

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$FEEDBACK_SCREENSHOTS_BUCKET" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "feedback-screenshot-expiry",
        "Status": "Enabled",
        "Filter": { "Prefix": "feedback/" },
        "Expiration": { "Days": 90 }
      }
    ]
  }'
```

---

## Notes

- This rule must be applied **before go-live** in staging and production.
- Cloudflare R2 supports lifecycle rules via the S3-compatible API (same CLI
  command above) or the R2 dashboard under **Bucket Settings → Object
  Lifecycle Policies**.
- The rule does not affect non-`feedback/` prefixes in the same bucket.
