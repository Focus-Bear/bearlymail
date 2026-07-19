'use strict';

const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');
const simpleImportSort = require('eslint-plugin-simple-import-sort');
const betterMaxParams = require('eslint-plugin-better-max-params');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  // Global ignores (replaces ignorePatterns)
  {
    ignores: ['eslint.config.js', 'dist/**/*', 'src/database/migrations/**/*'],
  },

  // Spread @typescript-eslint/recommended flat config (base + eslint-recommended + recommended rules)
  ...tsPlugin.configs['flat/recommended'],

  // Main config for all TypeScript files
  {
    files: ['**/*.ts'],
    plugins: {
      'simple-import-sort': simpleImportSort,
      'better-max-params': betterMaxParams,
      prettier: prettierPlugin,
    },
    languageOptions: {
      parserOptions: {
        project: 'tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
    },
    rules: {
      // Prettier: disable formatting rules that conflict, then enable prettier rule
      ...prettierConfig.rules,
      'prettier/prettier': 'error',

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
      'max-lines-per-function': [
        'error',
        {
          max: 100,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true,
        },
      ],

      'max-statements': ['error', 30, { ignoreTopLevelFunctions: true }],
      'max-nested-callbacks': ['error', 4],

      'max-params': 'off',
      'better-max-params/better-max-params': [
        'error',
        { func: 5, constructor: 20 },
      ],

      complexity: ['error', 20],

      // ===========================================
      // CLEAN CODE - NAMING CONVENTIONS
      // ===========================================
      'id-length': [
        'error',
        {
          min: 2,
          exceptions: ['_', 'i', 'j', 'x', 'y', 'z'],
          exceptionPatterns: ['^_'],
          properties: 'never',
        },
      ],

      'id-denylist': [
        'error',
        'data',
        'temp',
        'tmp',
        'val',
        'cb',
        'fn',
        'obj',
        'arr',
        'num',
        'str',
      ],

      // ===========================================
      // CLEAN CODE - COMMENTING PRACTICES
      // ===========================================
      'no-warning-comments': [
        'error',
        {
          terms: ['fixme', 'hack', 'xxx'],
          location: 'start',
        },
      ],

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

      'no-inline-comments': 'error',

      // ===========================================
      // CLEAN CODE - CODE QUALITY
      // ===========================================
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

      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='getPrompt'] > Literal",
          message:
            'Pass a named constant (from SUMMARY_PROMPT_IDS, PRIORITY_PROMPT_IDS, REPLY_PROMPT_IDS, CLASSIFICATION_PROMPT_IDS, CONTEXT_PROMPT_IDS, or UTILITY_PROMPT_IDS) to getPrompt() instead of a magic string prompt ID.',
        },
        {
          selector:
            "CallExpression[callee.property.name='captureEvent'] > Literal:first-child",
          message:
            'Use a named constant for PostHog event names instead of a magic string.',
        },
        {
          selector: "Property[key.name=/^(tier|eventName)$/] > Literal",
          message:
            'Use a named constant for event/tier identifiers instead of a magic string.',
        },
        {
          selector:
            "BinaryExpression[operator=/^(===|!==)$/]:not(:has(UnaryExpression[operator='typeof'])) > Literal[value=/^[a-z][a-z_-]{3,}$/]",
          message:
            'Use a named constant instead of a magic string in comparisons. See server/src/constants/.',
        },
        {
          selector: "SwitchCase > Literal[value=/^[a-z][a-z_-]{3,}$/]",
          message:
            'Use a named constant instead of a magic string in switch cases. See server/src/constants/.',
        },
        {
          selector:
            "Decorator[expression.callee.name='Inject'] > CallExpression > Literal",
          message:
            'Use a named constant from INJECT_TOKENS instead of a magic string in @Inject(). See server/src/constants/inject-tokens.ts.',
        },
      ],

      'prefer-const': 'error',
      'no-var': 'error',
      'prefer-template': 'error',
      'no-nested-ternary': 'error',
      'no-param-reassign': ['error', { props: false }],

      'prefer-destructuring': [
        'error',
        {
          array: false,
          object: true,
        },
        {
          enforceForRenamedProperties: false,
        },
      ],

      'prefer-arrow-callback': 'error',
      'arrow-body-style': ['error', 'as-needed'],

      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-spread': 'error',
      'prefer-rest-params': 'error',

      curly: 'off',

      // ===========================================
      // TYPESCRIPT SPECIFIC
      // ===========================================
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',

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

  // Override: relax rules for test files
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      'max-statements': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      'id-denylist': 'off',
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

  // Override: relax rules for configuration files
  {
    files: ['*.config.js', '*.config.ts', 'nest-cli.json', 'tsconfig.json'],
    rules: {
      'max-lines': 'off',
      'id-length': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  // Override: scripts are CLI tools that legitimately use console.log
  {
    files: ['**/scripts/**/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': [
        'error',
        { max: 200, skipBlankLines: true, skipComments: true },
      ],
      'max-statements': ['error', 60, { ignoreTopLevelFunctions: true }],
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  // Override: type definition files may use property names defined by external API contracts
  {
    files: ['**/types/**/*.ts'],
    rules: {
      'id-denylist': 'off',
    },
  },

  // Override: constant definition files — string literals ARE the constants
  {
    files: [
      '**/constants/**/*.ts',
      '**/prompts.ts',
      '**/llm-operations.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // Override: module files that provide NestJS injection tokens
  {
    files: ['**/*.module.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='getPrompt'] > Literal",
          message:
            'Pass a named constant to getPrompt() instead of a magic string.',
        },
        {
          selector:
            "CallExpression[callee.property.name='captureEvent'] > Literal:first-child",
          message:
            'Use a named constant for PostHog event names instead of a magic string.',
        },
        {
          selector: "Property[key.name=/^(tier|eventName)$/] > Literal",
          message:
            'Use a named constant for event/tier identifiers instead of a magic string.',
        },
      ],
    },
  },

  // Override: long files that predate the max-lines limit
  {
    files: [
      '**/email-search.service.ts',
      '**/context-gmail-data.service.ts',
      '**/zoho.provider.ts',
    ],
    rules: {
      'max-lines': 'off',
    },
  },

  // Override: files with pre-existing complexity violations exposed by ESLint v10's stricter
  // optional-chaining branch counting (eslint.org/docs/latest/rules/complexity). These should
  // be refactored in follow-up PRs.
  {
    files: [
      '**/auth/auth.controller.ts',
      '**/auth/zoho.strategy.ts',
      '**/calendar/calendar-free-slots.helper.ts',
      '**/contacts/providers/gmail-contacts.provider.ts',
      '**/context/context-gmail-data.service.ts',
      '**/emails/llm-priority-batch.service.ts',
      '**/emails/providers/office365/office365-message-parser.ts',
      '**/github/github-project-status.service.ts',
      '**/llm/llm-actions.service.ts',
      '**/llm/llm-reply.service.ts',
    ],
    rules: {
      complexity: 'off',
    },
  },
];
