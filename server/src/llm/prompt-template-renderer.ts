/**
 * Minimal Nunjucks-subset renderer for the prompt markdown files in
 * `promptfoo/prompts/`. promptfoo renders the same files with real Nunjucks, so
 * everything supported here must behave identically there:
 *
 * - `{{ path }}` and `{{ path | join(', ') }}` — dotted paths resolve through
 *   nested objects; an undefined path leaves the tag in place (so a missing
 *   variable is visible in the rendered prompt rather than silently blank).
 * - `{% if path %}` / `{% if not path %}` / `{% elif path %}` / `{% else %}` /
 *   `{% endif %}` — nestable; empty arrays are falsy.
 * - `{% for item in path %} … {% endfor %}` with `loop.index0` / `loop.index`;
 *   inside the body a bare `{{ prop }}` resolves against the current item
 *   before the outer variables.
 *
 * Anything else (unknown tags, unknown filters, stray `endif`s) is left as
 * literal text so the "no template syntax remains" spec catches it.
 */

type TemplateVars = Record<string, unknown>;

type TemplateNode =
  | { type: "text"; value: string }
  | { type: "var"; expression: string; raw: string }
  | {
      type: "if";
      branches: Array<{ condition: string | null; body: TemplateNode[] }>;
    }
  | {
      type: "for";
      itemName: string;
      listExpression: string;
      body: TemplateNode[];
    };

type Token =
  | { kind: "text"; value: string }
  | { kind: "var"; expression: string; raw: string }
  | { kind: "tag"; name: string; argument: string; raw: string };

interface LoopFrame {
  itemName: string;
  item: unknown;
  loop: { index: number; index0: number };
}

const TAG_PATTERN = /\{\{([\s\S]*?)\}\}|\{%([\s\S]*?)%\}/g;
const NO_TERMINATORS: ReadonlySet<string> = new Set();
const FOR_TAG_PATTERN = /^(\w+)\s+in\s+(.+)$/;
const JOIN_FILTER_PATTERN = /^join\((?:'([^']*)'|"([^"]*)")?\)$/;
const NOT_PREFIX = "not ";
const LOOP_VARIABLE = "loop";
const TAG = {
  IF: "if",
  ELIF: "elif",
  ELSE: "else",
  ENDIF: "endif",
  FOR: "for",
  ENDFOR: "endfor",
} as const;
const TOKEN_KIND = { TEXT: "text", VAR: "var", TAG: "tag" } as const;
const NODE = {
  TEXT: "text",
  VAR: "var",
  IF: "if",
  FOR: "for",
} as const;

function tokenize(template: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  for (const match of template.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ kind: "text", value: template.slice(lastIndex, index) });
    }
    if (match[1] !== undefined) {
      tokens.push({ kind: "var", expression: match[1].trim(), raw: match[0] });
    } else {
      const [name, ...rest] = match[2].trim().split(/\s+/);
      tokens.push({
        kind: "tag",
        name,
        argument: rest.join(" "),
        raw: match[0],
      });
    }
    lastIndex = index + match[0].length;
  }
  if (lastIndex < template.length) {
    tokens.push({ kind: "text", value: template.slice(lastIndex) });
  }
  return tokens;
}

/** Recursive-descent parser over the token stream; `stopAt` names the tags that end the current block. */
class TemplateParser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parseBlock(stopAt: ReadonlySet<string>): {
    nodes: TemplateNode[];
    terminator: Token | null;
  } {
    const nodes: TemplateNode[] = [];
    while (this.position < this.tokens.length) {
      const token = this.tokens[this.position];
      if (token.kind === TOKEN_KIND.TAG && stopAt.has(token.name)) {
        return { nodes, terminator: token };
      }
      this.position++;
      nodes.push(this.parseToken(token));
    }
    return { nodes, terminator: null };
  }

  private parseToken(token: Token): TemplateNode {
    if (token.kind === TOKEN_KIND.TEXT) {
      return { type: "text", value: token.value };
    }
    if (token.kind === TOKEN_KIND.VAR) {
      return { type: "var", expression: token.expression, raw: token.raw };
    }
    if (token.name === TAG.IF) {
      return this.parseIf(token.argument);
    }
    if (token.name === TAG.FOR) {
      return this.parseFor(token);
    }
    // Stray else/elif/endif/endfor or an unknown tag: keep it visible.
    return { type: "text", value: token.raw };
  }

  private parseIf(firstCondition: string): TemplateNode {
    const branches: Array<{ condition: string | null; body: TemplateNode[] }> =
      [];
    let condition: string | null = firstCondition;
    const stopAt = new Set<string>([TAG.ELIF, TAG.ELSE, TAG.ENDIF]);
    for (;;) {
      const { nodes, terminator } = this.parseBlock(stopAt);
      branches.push({ condition, body: nodes });
      // An unterminated block closes implicitly at the end of the input.
      if (!terminator || terminator.kind !== TOKEN_KIND.TAG) {
        break;
      }
      this.position++;
      if (terminator.name === TAG.ENDIF) {
        break;
      }
      condition = terminator.name === TAG.ELIF ? terminator.argument : null;
    }
    return { type: "if", branches };
  }

  private parseFor(token: Extract<Token, { kind: "tag" }>): TemplateNode {
    const match = token.argument.match(FOR_TAG_PATTERN);
    if (!match) {
      return { type: "text", value: token.raw };
    }
    const { nodes, terminator } = this.parseBlock(
      new Set<string>([TAG.ENDFOR]),
    );
    if (terminator) {
      this.position++;
    }
    return {
      type: "for",
      itemName: match[1],
      listExpression: match[2].trim(),
      body: nodes,
    };
  }
}

function parseTemplate(template: string): TemplateNode[] {
  return new TemplateParser(tokenize(template)).parseBlock(NO_TERMINATORS)
    .nodes;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveRoot(
  name: string,
  vars: TemplateVars,
  frames: LoopFrame[],
): unknown {
  for (let depth = frames.length - 1; depth >= 0; depth--) {
    const frame = frames[depth];
    if (name === frame.itemName) return frame.item;
    if (name === LOOP_VARIABLE) return frame.loop;
    if (isPlainObject(frame.item) && frame.item[name] !== undefined) {
      return frame.item[name];
    }
  }
  return vars[name];
}

function resolvePath(
  path: string,
  vars: TemplateVars,
  frames: LoopFrame[],
): unknown {
  const [root, ...segments] = path.split(".");
  let current = resolveRoot(root, vars, frames);
  for (const segment of segments) {
    if (!isPlainObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function isTruthy(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function evaluateCondition(
  condition: string,
  vars: TemplateVars,
  frames: LoopFrame[],
): boolean {
  const trimmed = condition.trim();
  if (trimmed.startsWith(NOT_PREFIX)) {
    return !isTruthy(
      resolvePath(trimmed.slice(NOT_PREFIX.length).trim(), vars, frames),
    );
  }
  return isTruthy(resolvePath(trimmed, vars, frames));
}

function stringifyValue(value: unknown): string {
  return isPlainObject(value) ? JSON.stringify(value) : String(value);
}

/** Applies `| join('sep')`; returns undefined for any other filter so the tag is left literal. */
function applyFilter(value: unknown, filter: string): unknown {
  const joinMatch = filter.trim().match(JOIN_FILTER_PATTERN);
  if (!joinMatch) return undefined;
  const separator = joinMatch[1] ?? joinMatch[2] ?? "";
  return Array.isArray(value)
    ? value.map(stringifyValue).join(separator)
    : value;
}

function evaluateExpression(
  expression: string,
  vars: TemplateVars,
  frames: LoopFrame[],
): unknown {
  const [path, ...filters] = expression.split("|");
  let value = resolvePath(path.trim(), vars, frames);
  for (const filter of filters) {
    if (value === undefined) return undefined;
    value = applyFilter(value, filter);
  }
  return value;
}

function renderNodes(
  nodes: TemplateNode[],
  vars: TemplateVars,
  frames: LoopFrame[],
): string {
  let output = "";
  for (const node of nodes) {
    output += renderNode(node, vars, frames);
  }
  return output;
}

function renderNode(
  node: TemplateNode,
  vars: TemplateVars,
  frames: LoopFrame[],
): string {
  switch (node.type) {
    case NODE.TEXT:
      return node.value;
    case NODE.VAR: {
      const value = evaluateExpression(node.expression, vars, frames);
      return value === undefined ? node.raw : stringifyValue(value);
    }
    case NODE.IF: {
      const branch = node.branches.find(
        ({ condition }) =>
          condition === null || evaluateCondition(condition, vars, frames),
      );
      return branch ? renderNodes(branch.body, vars, frames) : "";
    }
    case NODE.FOR: {
      const list = resolvePath(node.listExpression, vars, frames);
      if (!Array.isArray(list)) return "";
      return list
        .map((item, index0) =>
          renderNodes(node.body, vars, [
            ...frames,
            {
              itemName: node.itemName,
              item,
              loop: { index: index0 + 1, index0 },
            },
          ]),
        )
        .join("");
    }
  }
}

/**
 * Renders a prompt template with the given variables. Missing variables are
 * left as their `{{tag}}` so the omission is visible rather than silently blank.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return renderNodes(parseTemplate(template), vars, []);
}

/** Matches any Nunjucks tag left in a rendered prompt (`{{ … }}` or `{% … %}`). */
export const UNRENDERED_TEMPLATE_SYNTAX_PATTERN = /\{\{|\}\}|\{%|%\}/;
