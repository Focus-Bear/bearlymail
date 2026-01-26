import { Injectable } from "@nestjs/common";
import {
  AutoResponderConfig,
  QueueStats,
  AutoResponseTemplateVars,
} from "./types/auto-responder.types";
import { DISPLAY_LIMITS } from "./auto-responder-constants";

/**
 * Service for handling auto-responder template selection and rendering
 */
@Injectable()
export class AutoResponderTemplateService {
  /**
   * Select the appropriate template based on priority and queue state
   */
  selectTemplate(
    config: AutoResponderConfig,
    priorityLevel: "low" | "medium" | "high",
    queueStats: QueueStats,
  ): string {
    // Check for zero backlog
    if (queueStats.actionCount === 0 && queueStats.triageCount === 0) {
      return config.templates.zeroBacklog;
    }

    // Select by priority
    switch (priorityLevel) {
      case "high":
        return config.templates.highPriority;
      case "low":
        return config.templates.lowPriority;
      default:
        return config.templates.standard;
    }
  }

  /**
   * Determine which template type was used based on the template string
   */
  getTemplateType(
    config: AutoResponderConfig,
    template: string,
  ): "highPriority" | "lowPriority" | "zeroBacklog" | "standard" {
    if (template === config.templates.highPriority) {
      return "highPriority";
    }
    if (template === config.templates.lowPriority) {
      return "lowPriority";
    }
    if (template === config.templates.zeroBacklog) {
      return "zeroBacklog";
    }
    return "standard";
  }

  /**
   * Render template with variables
   */
  renderTemplate(template: string, vars: AutoResponseTemplateVars): string {
    let result = template;

    // Simple variable replacement
    result = result.replace(/\{\{userName\}\}/g, vars.userName);
    result = result.replace(/\{\{senderName\}\}/g, vars.senderName);
    result = result.replace(/\{\{originalSubject\}\}/g, vars.originalSubject);
    result = result.replace(/\{\{priorityLevel\}\}/g, vars.priorityLevel);
    result = result.replace(
      /\{\{actionCount\}\}/g,
      String(
        vars.actionCount > DISPLAY_LIMITS.MAX_DISPLAY_COUNT
          ? `${DISPLAY_LIMITS.MAX_DISPLAY_COUNT}+`
          : vars.actionCount,
      ),
    );
    result = result.replace(
      /\{\{triageCount\}\}/g,
      String(
        vars.triageCount > DISPLAY_LIMITS.MAX_DISPLAY_COUNT
          ? `${DISPLAY_LIMITS.MAX_DISPLAY_COUNT}+`
          : vars.triageCount,
      ),
    );
    result = result.replace(/\{\{avgResponseTime\}\}/g, vars.avgResponseTime);
    result = result.replace(
      /\{\{urgentResponseTime\}\}/g,
      vars.urgentResponseTime,
    );
    result = result.replace(/\{\{aiAnswer\}\}/g, vars.aiAnswer || "");

    // Handle conditional blocks
    // {{#if hasAiAnswer}}...{{/if}}
    result = result.replace(
      /\{\{#if hasAiAnswer\}\}([\s\S]*?)\{\{\/if\}\}/g,
      vars.hasAiAnswer ? "$1" : "",
    );

    // {{#unless hasAiAnswer}}...{{/unless}}
    result = result.replace(
      /\{\{#unless hasAiAnswer\}\}([\s\S]*?)\{\{\/unless\}\}/g,
      vars.hasAiAnswer ? "" : "$1",
    );

    return result.trim();
  }
}
