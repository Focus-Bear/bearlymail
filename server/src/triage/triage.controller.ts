import { Body, Controller, Post, Request, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { VerifyDistractionPhraseDto } from "./dto/verify-distraction-phrase.dto";
import { TriageService } from "./triage.service";

@Controller("triage")
@UseGuards(JwtAuthGuard)
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  /**
   * Verify the spoken "distraction tax" confession phrase.
   * POST /triage/verify-distraction-phrase
   *
   * Body: { transcript } — the client-side speech-to-text transcript.
   * Returns: { verified } — true when the transcript matches the phrase.
   */
  @Post("verify-distraction-phrase")
  async verifyDistractionPhrase(
    @Request() req,
    @Body() dto: VerifyDistractionPhraseDto,
  ): Promise<{ verified: boolean }> {
    const verified = await this.triageService.verifyDistractionPhrase(
      dto.transcript,
      req.user.userId,
    );
    return { verified };
  }
}
