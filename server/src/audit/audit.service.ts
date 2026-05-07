import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AuditLog } from "../database/entities/audit-log.entity";

export interface AuditLogParams {
  userId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * SAQ Q52 / GAP-12: append-only audit trail of admin endpoint access.
 *
 * Only `log()` is exposed — there are intentionally no update or delete methods.
 * Failures are logged but never thrown: an audit-write failure must not break
 * the admin request path.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(params: AuditLogParams): Promise<void> {
    try {
      const entity = this.auditLogRepository.create({
        userId: params.userId,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        metadata: params.metadata ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      });
      await this.auditLogRepository.save(entity);
    } catch (err) {
      this.logger.error(
        `Failed to write audit log for action="${params.action}" userId="${params.userId}"`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
