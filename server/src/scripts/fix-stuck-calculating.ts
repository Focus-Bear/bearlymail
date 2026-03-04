import { NestFactory } from "@nestjs/core";

import { AppModule } from "../app.module";
import { EmailsService } from "../emails/emails.service";

async function fixStuckCalculating() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const emailsService = app.get(EmailsService);

  // Get user ID from command line argument or use default
  const userId = process.argv[2];

  if (!userId) {
    console.error("Usage: npm run fix:stuck-calculating <userId>");
    console.error("Or set USER_ID environment variable");
    process.exit(1);
  }

  console.log(`Fixing stuck calculating threads for user: ${userId}`);

  try {
    const result = await emailsService.fixStuckCalculatingThreads(userId);

    console.log(`✅ Fixed ${result.fixed} stuck threads`);

    console.log(`✅ Re-queued ${result.requeued} jobs`);
    if (result.errors.length > 0) {
      console.error(`❌ ${result.errors.length} errors:`);
      result.errors.forEach((err) => console.error(`  - ${err}`));
    }
  } catch (error) {
    console.error("❌ Error fixing stuck threads:", error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

fixStuckCalculating();
