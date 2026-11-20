import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, MoreThan, Repository } from "typeorm";

import { MCP_SETTINGS } from "../constants/mcp-server.constants";
import { AuditLog } from "../database/entities/audit-log.entity";
import { McpToolInputError } from "./mcp-tool-args";

const SETTINGS_AUDIT_ACTIONS = Object.values(MCP_SETTINGS.AUDIT_ACTIONS);

/**
 * Hourly cap on category and rule changes made through MCP, counted from the
 * audit log every such change writes. Rules decide where future mail is filed
 * (and so which of the user's automations it reaches), so a connection that
 * has been talked into rewriting them is stopped after a bounded number of
 * changes, the same way sends are.
 */
@Injectable()
export class McpSettingsWriteLimiter {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async assertWithinLimit(userId: string): Promise<void> {
    const changesInWindow = await this.auditLogRepository.count({
      where: {
        userId,
        action: In(SETTINGS_AUDIT_ACTIONS),
        createdAt: MoreThan(
          new Date(Date.now() - MCP_SETTINGS.WRITE_LIMIT_WINDOW_MS),
        ),
      },
    });
    if (changesInWindow >= MCP_SETTINGS.WRITE_LIMIT_PER_HOUR) {
      throw new McpToolInputError(
        `Change limit reached: at most ${MCP_SETTINGS.WRITE_LIMIT_PER_HOUR} category and rule changes per hour can be made through this connection. Try again later.`,
      );
    }
  }
}
