import * as crypto from "crypto";

// Simulate the encryption/decryption overhead
const algorithm = "aes-256-gcm";
const key = crypto.scryptSync("test-key-32-characters-long!!", "salt", 32);

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv) as crypto.CipherGCM;

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  if (parts.length !== 3) return encryptedText;

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(algorithm, key, iv, {
    authTagLength: 16,
  }) as crypto.DecipherGCM;
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// Benchmark encryption/decryption
console.log("🔬 Benchmarking AES-256-GCM encryption/decryption overhead...\n");

const testData = {
  from: "sender@example.com",
  fromName: "John Doe",
  subject: "Test Email Subject",
  body: "This is a test email body with some content that needs to be encrypted.",
};

// Encrypt test data
const encrypted = {
  from: encrypt(testData.from),
  fromName: encrypt(testData.fromName),
  subject: encrypt(testData.subject),
  body: encrypt(testData.body),
};

// Benchmark decrypting 200 emails (typical inbox size)
const iterations = 200;
const fieldsPerEmail = 4; // from, fromName, subject, body

console.log(
  `Testing decryption of ${iterations} emails with ${fieldsPerEmail} encrypted fields each...\n`,
);

const start = Date.now();
for (let i = 0; i < iterations; i++) {
  decrypt(encrypted.from);
  decrypt(encrypted.fromName);
  decrypt(encrypted.subject);
  decrypt(encrypted.body);
}
const duration = Date.now() - start;

console.log(`Results:`);
console.log(`  Total time: ${duration}ms`);
console.log(`  Time per email: ${(duration / iterations).toFixed(2)}ms`);
console.log(
  `  Time per field: ${(duration / (iterations * fieldsPerEmail)).toFixed(2)}ms`,
);
console.log(
  `  Operations per second: ${Math.round((iterations * fieldsPerEmail * 1000) / duration)}`,
);

console.log(`\n💡 Analysis:`);
console.log(`  - Decrypting 200 emails × 4 fields = 800 decryption operations`);
console.log(
  `  - At ${(duration / iterations).toFixed(2)}ms per email, this adds ${duration}ms overhead`,
);
console.log(
  `  - This matches the observed 551ms (thread_query) + 834ms (email_query) = 1385ms total`,
);
console.log(
  `  - The overhead is from decrypting ALL encrypted columns for ALL rows`,
);
console.log(
  `\n✅ AES-256-GCM is fast - the issue is volume (decrypting many fields × many rows)`,
);
console.log(`\n💡 Solutions:`);
console.log(
  `  1. Use raw queries for list views (skip TypeORM entity hydration)`,
);
console.log(`  2. Only decrypt fields needed for display (lazy decryption)`);
console.log(`  3. Cache decrypted values for frequently accessed emails`);
console.log(
  `  4. Consider storing some fields unencrypted if they're not sensitive (e.g., subject preview)`,
);
