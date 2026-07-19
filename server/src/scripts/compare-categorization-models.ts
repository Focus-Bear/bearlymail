/**
 * One-off head-to-head: current Gemini model vs AWS Bedrock Amazon Nova Micro
 * on REAL categorisation for a user, using the production `analyze_priority`
 * (prioritise-email) prompt via PriorityAnalysisService — the exact path where
 * category mis-routing happens.
 *
 * Runs in prod (so TypeORM auto-decrypts email + category data). Emits ONLY an
 * aggregate agreement summary + redacted disagreement examples (short subject
 * snippet + the two category names) — no email bodies leave the process.
 *
 *   node dist/scripts/compare-categorization-models.js <userId> [limit=40]
 */
import { NestFactory } from "@nestjs/core";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AppModule } from "../app.module";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailDebugCategoryService } from "../emails/email-debug-category.service";
import { LLMProvider } from "../llm/llm.types";
import { PriorityAnalysisService } from "../llm/priority-analysis.service";

const SUBJECT_SNIPPET = 50;
const BODY_CHARS = 2000;
const ERR_MSG_CHARS = 120;
const PCT_SCALE = 1000;

async function main() {
  const userId = process.argv[2];
  const limit = parseInt(process.argv[3] || "40", 10);
  if (!userId) {
    console.error("Usage: compare-categorization-models <userId> [limit]");
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const priority = app.get(PriorityAnalysisService);
  const debugCat = app.get(EmailDebugCategoryService);
  const threadRepo = app.get<Repository<EmailThread>>(
    getRepositoryToken(EmailThread),
  );
  const emailRepo = app.get<Repository<Email>>(getRepositoryToken(Email));

  // Real category taxonomy for this user (decrypted).
  const catCtx = await debugCat.listEmailCategoryContexts(userId);
  const emailCategories = catCtx.contexts.map((ctx) => ({
    name: ctx.parsedName,
    description: ctx.parsedDescription || undefined,
  }));
  const userContext = { emailCategories };
  // Map the stored categoryId (FK) back to its display name for readability.
  const catNameById = new Map(
    catCtx.contexts.map((ctx) => [ctx.contextId, ctx.parsedName]),
  );

  // Most-recently-updated non-archived threads that already have a category.
  const threads = await threadRepo.find({
    where: { userId, isArchived: false },
    order: { updatedAt: "DESC" },
    take: limit,
  });

  let compared = 0;
  let agree = 0;
  const disagreements: Array<{
    subject: string;
    stored: string | null;
    gemini: string | null;
    nova: string | null;
  }> = [];
  const novaErrors: string[] = [];

  for (const thread of threads) {
    const email = await emailRepo.findOne({
      where: { emailThreadId: thread.id },
      order: { receivedAt: "DESC" },
    });
    if (!email || !email.subject) continue;

    const emailInput = {
      from: email.from || "",
      fromName: email.fromName || undefined,
      senderJobTitle: email.senderJobTitle || undefined,
      subject: email.subject || "",
      body: (email.body || "").slice(0, BODY_CHARS),
    };

    try {
      const [gemini, nova] = await Promise.all([
        priority.analyzePriority({ email: emailInput, userId, userContext }),
        priority.analyzePriority({
          email: emailInput,
          userId,
          userContext,
          provider: LLMProvider.BEDROCK,
        }),
      ]);
      compared++;
      if (gemini.category === nova.category) {
        agree++;
      } else {
        disagreements.push({
          subject: (email.subject || "").slice(0, SUBJECT_SNIPPET),
          stored: thread.categoryId
            ? (catNameById.get(thread.categoryId) ?? thread.categoryId)
            : null,
          gemini: gemini.category ?? null,
          nova: nova.category ?? null,
        });
      }
    } catch (err) {
      novaErrors.push((err as Error).message.slice(0, ERR_MSG_CHARS));
    }
  }

  const summary = {
    userId,
    taxonomySize: emailCategories.length,
    threadsFetched: threads.length,
    compared,
    agree,
    disagree: disagreements.length,
    agreementPct:
      compared > 0 ? Math.round((agree / compared) * PCT_SCALE) / 10 : null,
    errors: novaErrors.length,
    disagreements,
    errorSamples: novaErrors.slice(0, 5),
  };
  console.log(`CATEGORIZATION_COMPARE_RESULT ${JSON.stringify(summary)}`);

  await app.close();
}

main().catch((err) => {
  console.error("compare-categorization-models failed:", err);
  process.exit(1);
});
