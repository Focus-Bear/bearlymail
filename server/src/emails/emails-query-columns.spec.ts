import * as fs from "fs";
import * as path from "path";

/**
 * This test ensures that the raw SQL LATERAL subquery in getInbox()
 * selects all columns that the outer SELECT references from the `e` alias.
 *
 * Background: The getInbox() method uses a raw SQL query with a LATERAL JOIN
 * to fetch the most recent email per thread. The outer SELECT references
 * columns from the LATERAL subquery alias `e`, but if a column is added to
 * the outer SELECT without also adding it to the LATERAL subquery, PostgreSQL
 * throws "column e.X does not exist". This happened in production with
 * googleAccountId (issue #354).
 */
describe("getInbox raw SQL query column coverage", () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(
      path.join(__dirname, "email-inbox-query.helpers.ts"),
      "utf-8",
    );
  });

  it("should include all outer-SELECT e.* columns in the LATERAL subquery", () => {
    // Extract the full inbox SQL query (starts with thread."starCount" after SELECT,
    // ends before the closing backtick)
    const fullQueryMatch = source.match(
      /`SELECT\s+thread\."starCount",([\s\S]*?)LIMIT \$\{/,
    );
    expect(fullQueryMatch).toBeTruthy();
    const fullQuery = fullQueryMatch![0];

    // Extract the outer SELECT (before FROM email_threads)
    const outerSelectMatch = fullQuery.match(
      /SELECT\s+([\s\S]*?)FROM email_threads thread/,
    );
    expect(outerSelectMatch).toBeTruthy();
    const outerSelect = outerSelectMatch![1];

    // Find all e."col" or e.col references in outer SELECT
    const outerEColumns = new Set<string>();
    const eColRegex = /\be\."(\w+)"/g;
    let match;
    while ((match = eColRegex.exec(outerSelect)) !== null) {
      outerEColumns.add(match[1]);
    }
    // Also match unquoted: e.id, e.subject, e.summary, e.labels
    const eColUnquotedRegex = /\be\.(\w+)/g;
    while ((match = eColUnquotedRegex.exec(outerSelect)) !== null) {
      // Skip aliases like e.id (which is actually fine as-is)
      outerEColumns.add(match[1]);
    }

    // Extract the LATERAL subquery columns
    const lateralMatch = fullQuery.match(
      /CROSS JOIN LATERAL \(\s*SELECT\s+([\s\S]*?)FROM emails em/,
    );
    expect(lateralMatch).toBeTruthy();
    const lateralSelect = lateralMatch![1];

    // Find all em."col" or em.col references in LATERAL subquery
    const lateralColumns = new Set<string>();
    const emColRegex = /\bem\."(\w+)"/g;
    while ((match = emColRegex.exec(lateralSelect)) !== null) {
      lateralColumns.add(match[1]);
    }
    const emColUnquotedRegex = /\bem\.(\w+)/g;
    while ((match = emColUnquotedRegex.exec(lateralSelect)) !== null) {
      lateralColumns.add(match[1]);
    }

    // Every column referenced from `e` in the outer SELECT must exist in the LATERAL subquery
    const missingColumns: string[] = [];
    for (const col of outerEColumns) {
      if (!lateralColumns.has(col)) {
        missingColumns.push(col);
      }
    }

    expect(missingColumns).toEqual([]);
  });
});
