module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin', 'simple-import-sort', 'better-max-params'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist/**/*', 'src/database/migrations/**/*'],
  rules: {
    // ===========================================
    // IMPORT ORDERING
    // ===========================================
    'simple-import-sort/imports': [
      'error',
      {
        groups: [
          // Side-effect imports (e.g. import 'reflect-metadata')
          ['^\\u0000'],
          // External packages: NestJS first, then @-scoped, then others
          ['^@nestjs', '^@?\\w'],
          // Relative imports (server has no path aliases)
          ['^\\.'],
        ],
      },
    ],
    'simple-import-sort/exports': 'error',

    // ===========================================
    // FILE SIZE LIMITS
    // ===========================================
    // Flag files with more than 800 lines
    'max-lines': [
      'error',
      {
        max: 800,
        skipBlankLines: true,
        skipComments: true,
      },
    ],

    // ===========================================
    // FUNCTION LENGTH LIMITS
    // ===========================================
    // Flag functions with more than 100 lines
    'max-lines-per-function': [
      'error',
      {
        max: 100,
        skipBlankLines: true,
        skipComments: true,
        IIFEs: true,
      },
    ],

    // Flag functions with more than 30 statements
    'max-statements': ['error', 30, { ignoreTopLevelFunctions: true }],

    // Limit callback nesting depth (helps with readability)
    'max-nested-callbacks': ['error', 4],

    // Limit function parameters (too many suggests function does too much)
    // eslint-plugin-better-max-params provides separate limits for constructors vs regular functions.
    // Replaces the old max-params: 13 global (which was set high just to accommodate NestJS DI).
    // func: 5 is the target limit per Jeremy's request (PR #1416). As of this change, there are
    // 66 existing violations across the codebase that predate this rule tightening. These will be
    // fixed incrementally via options/config object refactors in follow-up PRs.
    // constructor: 20 covers NestJS DI constructors (ESLint v8 has no built-in ignoreConstructors).
    'max-params': 'off',
    'better-max-params/better-max-params': ['error', { func: 5, constructor: 20 }],

    // Limit cyclomatic complexity (number of independent paths through code)
    complexity: ['error', 20],

    // ===========================================
    // CLEAN CODE - NAMING CONVENTIONS
    // ===========================================
    // Enforce minimum identifier length (avoid single-letter variables except loops/coords)
    'id-length': [
      'error',
      {
        min: 2,
        // Only principled exceptions: underscore (unused), loop indices, coordinates
        exceptions: ['_', 'i', 'j', 'x', 'y', 'z'],
        exceptionPatterns: ['^_'], // Allow _anything (underscore-prefixed)
        properties: 'never', // Don't check object properties
      },
    ],

    // Disallow specific identifiers that are too generic
    'id-denylist': [
      'error',
      'data', // Too generic - what kind of data?
      'temp', // Should describe what it temporarily holds
      'tmp',
      'val', // Should be 'value' or more descriptive
      'cb', // Should be 'callback' or describe what it does
      'fn', // Should be 'func' or describe the function's purpose
      'obj', // Should describe what object
      'arr', // Should describe what array
      'num', // Should describe what number
      'str', // Should describe what string
    ],

    // ===========================================
    // CLEAN CODE - COMMENTING PRACTICES
    // ===========================================
    // Warn about TODO comments (should be tracked in issue tracker)
    'no-warning-comments': [
      'error',
      {
        terms: ['fixme', 'hack', 'xxx'], // Removed 'todo' - it's often acceptable
        location: 'start',
      },
    ],

    // Enforce consistent comment spacing
    'spaced-comment': [
      'error',
      'always',
      {
        line: {
          markers: ['/'],
          exceptions: ['-', '+'],
        },
        block: {
          markers: ['!'],
          exceptions: ['*'],
          balanced: true,
        },
      },
    ],

    // Disallow inline comments (encourages meaningful comments)
    'no-inline-comments': 'error',

    // ===========================================
    // CLEAN CODE - CODE QUALITY
    // ===========================================
    // Disallow magic numbers (use named constants instead)
    // Note: This rule can be noisy, so we configure it carefully
    // Using TypeScript-specific version from @typescript-eslint
    //
    // ⚠️  COVERAGE: This rule covers ALL numeric literals in service/non-test files,
    // including object property values (e.g. `maxTokens: 256` in function call args).
    // `ignoreDefaultValues` only exempts function default parameter initializers
    // (e.g. `function foo(x = 5) {}`), NOT object literal values.
    // If a magic number slips through review, replace it with a named constant in
    // the appropriate constants file (llm-constants.ts, query-limits.ts, etc.).
    //
    // ⚠️  NOTE ON MAGIC STRINGS: `no-magic-numbers` covers numeric literals
    // only — it does NOT flag inline string literals such as "summarize_email_tldr".
    // ESLint has no built-in "no-magic-strings" rule.  To enforce named constants
    // for domain strings (prompt IDs, event names, etc.), a custom
    // `no-restricted-syntax` rule with an AST selector can be added; that is
    // tracked as a future improvement.  Until then, use `as const` objects
    // (e.g. SUMMARY_PROMPT_IDS in prompts.ts) and code-review to enforce it.
    '@typescript-eslint/no-magic-numbers': [
      'error',
      {
        // Only the most common trivially-meaningful numbers are exempted.
        // Powers-of-two, byte sizes, token counts, timeouts etc. MUST use named constants.
        ignore: [0, 1, -1, 2, 3, 4, 5, 10, 100],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        ignoreNumericLiteralTypes: true,
        ignoreEnums: true,
        ignoreReadonlyClassProperties: true,
        ignoreTypeIndexes: true,
        enforceConst: true,
      },
    ],

    // Disallow magic strings for domain-specific identifiers.
    // Catches prompt ID literals, comparison magic strings, and switch-case magic strings.
    // Use named constants from prompts.ts (SUMMARY_PROMPT_IDS, PRIORITY_PROMPT_IDS, etc.)
    // and other constant modules instead of inline string literals.
    'no-restricted-syntax': [
      'error',
      {
        // Only flag string literals that are direct arguments to getPrompt().
        // This catches getPrompt("magic_string_here") without firing on log messages
        // or named constant definitions (which live in the excluded prompts.ts / llm-operations.ts).
        selector:
          "CallExpression[callee.name='getPrompt'] > Literal",
        message:
          "Pass a named constant (from SUMMARY_PROMPT_IDS, PRIORITY_PROMPT_IDS, REPLY_PROMPT_IDS, CLASSIFICATION_PROMPT_IDS, CONTEXT_PROMPT_IDS, or UTILITY_PROMPT_IDS) to getPrompt() instead of a magic string prompt ID.",
      },
      {
        // Flag string literals used as PostHog/analytics event names.
        // Use a named constant (e.g. POSTHOG_EVENTS.RATE_LIMIT_EXCEEDED) instead of inline strings.
        selector: "CallExpression[callee.property.name='captureEvent'] > Literal:first-child",
        message:
          "Use a named constant for PostHog event names instead of a magic string.",
      },
      {
        // Flag string literals assigned to 'tier' or 'eventName' object properties.
        // These are analytics-specific keys where inline strings should be replaced with named constants
        // (e.g. THROTTLE_TIERS.FEEDBACK, POSTHOG_EVENTS.*).
        // Note: 'event' is intentionally excluded — it is too generic a property name and causes
        // false positives in non-analytics contexts (e.g. emoji lookup tables, calendar objects).
        selector: "Property[key.name=/^(tier|eventName)$/] > Literal",
        message:
          "Use a named constant for event/tier identifiers instead of a magic string.",
      },
    ],

    // Require const for variables that are never reassigned
    'prefer-const': 'error',

    // Disallow var (use let or const)
    'no-var': 'error',

    // Prefer template literals over string concatenation
    'prefer-template': 'error',

    // Disallow nested ternary expressions (hard to read)
    'no-nested-ternary': 'error',

    // Disallow reassigning function parameters
    'no-param-reassign': ['error', { props: false }],

    // Prefer destructuring from arrays and objects
    'prefer-destructuring': [
      'error',
      {
        array: false, // Allow array[index] for clarity
        object: true,
      },
      {
        enforceForRenamedProperties: false,
      },
    ],

    // Prefer arrow functions as callbacks
    'prefer-arrow-callback': 'error',

    // Enforce consistent arrow function body style
    'arrow-body-style': ['error', 'as-needed'],

    // Disallow console statements (use logger instead)
    'no-console': ['error', { allow: ['warn', 'error'] }],

    // Disallow debugger statements
    'no-debugger': 'error',

    // Prefer object shorthand
    'object-shorthand': ['error', 'always'],

    // Prefer spread operator over Object.assign
    'prefer-spread': 'error',

    // Prefer rest parameters over arguments
    'prefer-rest-params': 'error',

    // Require curly braces for all control statements (off - too strict)
    curly: 'off',

    // Enforce consistent brace style (off - too strict)
    'brace-style': 'off',

    // ===========================================
    // TYPESCRIPT SPECIFIC
    // ===========================================
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'error',

    // Allow _-prefixed variables/params to be declared but unused
    // (common for interface implementations where params must be present for the signature)
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
  },
  overrides: [
    {
      // Relax rules for test files
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        'max-lines-per-function': 'off',
        'max-lines': 'off',
        'max-statements': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-magic-numbers': 'off',
        // Test data variables often use generic names like 'data', which is acceptable in tests
        'id-denylist': 'off',
        // Allow magic strings in test fixtures
        'no-restricted-syntax': 'off',
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
          },
        ],
      },
    },
    {
      // Relax rules for configuration files
      files: ['*.config.js', '*.config.ts', 'nest-cli.json', 'tsconfig.json'],
      rules: {
        'max-lines': 'off',
        'id-length': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      // Scripts are CLI tools that legitimately use console.log for output
      files: ['**/scripts/**/*.ts'],
      rules: {
        'max-lines': 'off',
        'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
        'max-statements': ['error', 60, { ignoreTopLevelFunctions: true }],
        'no-console': 'off',
        // Scripts use prompt IDs for CLI display
        'no-restricted-syntax': 'off',
      },
    },
    {
      // Type definition files that mirror external API shapes (e.g. Google, Axios) may use
      // property names like 'data' that are defined by the external API contract.
      files: ['**/types/**/*.ts'],
      rules: {
        'id-denylist': 'off',
      },
    },
    // llm-processor.ts override removed — Phase 7b split the 2198-line monolith into:
    //   - LLMPriorityResultService (~609 lines)
    //   - LLMSummaryProcessorService (~688 lines)
    //   - LLMPriorityBatchService (~550 lines)
    //   - LLMProcessor (thin orchestrator, ~395 lines)
    // All new files pass global max-lines: 800. See issue #939.

    // llm.service.ts override removed — Phase 7a split all 3219 lines into 8 domain services.
    // llm.service.ts is now a thin facade (~617 lines) under the global max-lines: 800 limit.
    // See issue #939.
  ],
};
