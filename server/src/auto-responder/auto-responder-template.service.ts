import { Injectable } from "@nestjs/common";

import { PRIORITY_LEVELS } from "../constants/domain-types";
import { BRANDING, DISPLAY_LIMITS } from "./auto-responder-constants";
import {
  AutoResponderConfig,
  AutoResponseTemplateVars,
  QueueStats,
} from "./types/auto-responder.types";

/**
 * Service for handling auto-responder template selection and rendering
 */
@Injectable()
export class AutoResponderTemplateService {
  /**
   * Convert markdown-style formatting to HTML
   * Supports: **bold**, *italic*, _italic_, bullet lists (- item), links [text](url)
   */
  markdownToHtml(text: string): string {
    let html = text;

    // Escape HTML special characters first (except for our markdown)
    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Convert markdown links [text](url) to HTML links
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" style="color: #E07A5F;">$1</a>',
    );

    // Convert **bold** to <strong>
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Convert *italic* or _italic_ to <em>
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/_([^_]+)_/g, "<em>$1</em>");

    // Convert bullet lists (lines starting with "- ")
    // First, identify consecutive bullet lines and wrap them in <ul>
    const lines = html.split("\n");
    const processedLines: string[] = [];
    let inList = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("- ")) {
        if (!inList) {
          processedLines.push("<ul>");
          inList = true;
        }
        processedLines.push(`<li>${trimmedLine.substring(2)}</li>`);
      } else {
        if (inList) {
          processedLines.push("</ul>");
          inList = false;
        }
        processedLines.push(line);
      }
    }
    if (inList) {
      processedLines.push("</ul>");
    }

    html = processedLines.join("\n");

    // Convert --- to horizontal rule
    html = html.replace(/^---$/gm, "<hr>");

    // Convert double newlines to paragraph breaks
    html = html.replace(/\n\n/g, "</p><p>");

    // Convert single newlines to <br> (within paragraphs)
    html = html.replace(/\n/g, "<br>");

    // Wrap in paragraph tags and basic HTML structure
    html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
p { margin: 0 0 1em 0; }
ul { margin: 0.5em 0; padding-left: 1.5em; }
li { margin: 0.25em 0; }
strong { font-weight: 600; }
em { font-style: italic; }
hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
a { color: #E07A5F; text-decoration: none; }
a:hover { text-decoration: underline; }
</style>
</head>
<body>
<p>${html}</p>
</body>
</html>`;

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, "");
    html = html.replace(/<p><br><\/p>/g, "");

    return html;
  }
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
      case PRIORITY_LEVELS.HIGH:
        return config.templates.highPriority;
      case PRIORITY_LEVELS.LOW:
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

    // Ensure "BearlyMail" is always a clickable link.
    // First normalize any existing markdown links for BearlyMail to plain text,
    // then re-link all occurrences with the correct URL.
    // This handles both custom templates (plain text) and default templates (already linked).
    result = result.replace(/\[BearlyMail\]\([^)]*\)/g, "BearlyMail");
    result = result.replace(
      /BearlyMail/g,
      `[BearlyMail](${BRANDING.WEBSITE_URL})`,
    );

    return result.trim();
  }
}
