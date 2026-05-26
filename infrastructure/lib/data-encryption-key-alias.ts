/**
 * Stable KMS alias for the per-user data-encryption CMK.
 *
 * The key is created in BearlyMailStack with `alias: 'bearlymail/data-encryption'`
 * (CDK prepends `alias/`). The Lambda stacks reference it by this alias NAME —
 * not by the key object or ARN — so they can decrypt per-user data keys:
 *  - without a circular stack dependency (BearlyMailStack owns the key but
 *    depends on the Lambda stacks for their SQS queues), and
 *  - without needing the generated key ARN at synth time, and
 *  - without recreating the key.
 *
 * KMS Decrypt accepts an alias as `KeyId`, and the `kms:RequestAlias` IAM
 * condition scopes the Lambda's decrypt permission to exactly this key.
 */
export const DATA_ENCRYPTION_KEY_ALIAS = "alias/bearlymail/data-encryption";
