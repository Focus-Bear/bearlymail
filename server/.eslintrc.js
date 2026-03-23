module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin', 'simple-import-sort'],
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
    // Set to 13 to accommodate NestJS DI constructors which commonly have many injected services
    // ESLint v8 only supports numeric max-params config here (no ignoreConstructors option)
    'max-params': ['error', 13],

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
        '@typescript-eslint/no-explicit-any': 'warn',
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
    {
      // God-class files pending final decomposition into domain-specific services.
      // Phase 5 progress (issue #939):
      //   - llm-processor.ts: function violations cleared; only max-lines (1807) remains.
      //     Split into llm-summary-processor + llm-priority-processor tracked for Phase 5g.
      //   - context.service.ts: 3757 lines, multiple large functions. Split into 5 services
      //     tracked for Phase 5g.
      // gmail.provider.ts, context-gmail-data.service.ts removed — both now fully compliant.
      //
      // Phase 5B (issue #939): max-params tightened to actual constructor param counts.
      //   - llm-processor.ts constructor: 16 params (was overriding to 30 — wrong)
      //   - context.service.ts constructor: 17 params (was overriding to 30 — wrong)
      // ESLint v8 lacks ignoreConstructors; remove these overrides once constructors are decomposed.
      files: [
        'src/emails/llm-processor.ts',
      ],
      rules: {
        'max-lines': ['error', { max: 4000, skipBlankLines: true, skipComments: true }],
        'max-lines-per-function': ['error', { max: 1200, skipBlankLines: true, skipComments: true, IIFEs: true }],
        'max-statements': ['error', 400, { ignoreTopLevelFunctions: true }],
        complexity: ['error', 250],
        'id-denylist': 'off',
        'max-params': ['error', 16],
      },
    },

    {
      // llm.service.ts: function violations cleared in Phase 5f; only max-lines (2811) remains.
      // Split into 8 domain-specific LLM services tracked for Phase 5g. See issue #939.
      // Phase 5A (issue #939): removed max-params override — constructor has only 1 param,
      // so the previous max-params: 30 was a copy-paste error with no justification.
      files: [
        'src/llm/llm.service.ts',
      ],
      rules: {
        'max-lines': ['error', { max: 4000, skipBlankLines: true, skipComments: true }],
        'max-lines-per-function': ['error', { max: 1200, skipBlankLines: true, skipComments: true, IIFEs: true }],
        'max-statements': ['error', 400, { ignoreTopLevelFunctions: true }],
        complexity: ['error', 250],
      },
    },
  ],
};
