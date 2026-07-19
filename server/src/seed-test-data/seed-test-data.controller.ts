import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SeedTestDataService } from "./seed-test-data.service";
import { PERSONA_KEYS, PersonaKey } from "./seed-types";
import { TesterOnlyGuard } from "./tester-only.guard";

interface SeedRequestBody {
  persona?: string;
}

type AuthedRequest = { user: { userId: string; email: string } };

@UseGuards(JwtAuthGuard, TesterOnlyGuard)
@Controller("seed-test-data")
export class SeedTestDataController {
  constructor(private readonly seedTestDataService: SeedTestDataService) {}

  @Post()
  async seed(@Request() req: AuthedRequest, @Body() body: SeedRequestBody) {
    const persona = body?.persona;
    if (!persona || !PERSONA_KEYS.includes(persona as PersonaKey)) {
      throw new BadRequestException(
        `persona must be one of: ${PERSONA_KEYS.join(", ")}`,
      );
    }
    return this.seedTestDataService.seed(
      req.user.userId,
      persona as PersonaKey,
    );
  }

  @Delete()
  async deleteAll(@Request() req: AuthedRequest) {
    return this.seedTestDataService.deleteAll(req.user.userId);
  }
}
