import { JEV } from "../constants/jev.constants";
import { requestJev } from "./jev-system-one";
import type { CategoriseFromSummaryParams } from "./llm-categorise-summary";
import { getPrompt, UTILITY_PROMPT_IDS } from "./prompts";

export interface JevCategoryAnswer {
  type: typeof JEV.QUESTION_TYPE;
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JevCategoryResponse {
  model: string;
  answers: Record<string, JevCategoryAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

export function buildJevCategoryRequest(
  params: CategoriseFromSummaryParams,
  model: string,
) {
  if (
    !params.categories.length ||
    params.categories.length >= JEV.MAX_OPTIONS
  ) {
    throw new Error("Jev category count exceeds Choice capacity or is empty");
  }
  const prompt = getPrompt(UTILITY_PROMPT_IDS.CATEGORISE_SUMMARY_JEV);
  if (!prompt?.prompt) throw new Error("Jev categorisation prompt is missing");
  const criteria: Record<string, string> = Object.fromEntries(
    params.categories.map((category, index) => [
      String(index + 1),
      category.description
        ? `${category.name} — ${category.description}`
        : category.name,
    ]),
  );
  criteria[JEV.OTHER_OPTION] =
    "Other: no listed category reasonably fits after respecting exclusions.";
  return {
    state: {
      subject: params.subject,
      senderName: params.senderName || "",
      senderEmail: params.senderEmail || "",
      summary: params.summary,
      githubFacts: params.githubFacts || "",
    },
    model,
    questions: {
      [JEV.QUESTION_ID]: {
        type: JEV.QUESTION_TYPE,
        instructions: prompt.prompt,
        criteria,
      },
    },
  };
}

export async function requestJevCategory(
  request: ReturnType<typeof buildJevCategoryRequest>,
  apiKey: string,
): Promise<JevCategoryResponse> {
  return (await requestJev(request, apiKey)) as JevCategoryResponse;
}
