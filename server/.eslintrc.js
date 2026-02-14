module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
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
    // FILE SIZE LIMITS
    // ===========================================
    // Flag files with more than 800 lines
    'max-lines': [
      'warn',
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
      'warn',
      {
        max: 100,
        skipBlankLines: true,
        skipComments: true,
        IIFEs: true,
      },
    ],

    // Flag functions with more than 30 statements
    'max-statements': ['warn', 30, { ignoreTopLevelFunctions: true }],

    // Limit callback nesting depth (helps with readability)
    'max-nested-callbacks': ['warn', 4],

    // Limit function parameters (too many suggests function does too much)
    'max-params': ['warn', 6],

    // Limit cyclomatic complexity (number of independent paths through code)
    complexity: ['warn', 20],

    // ===========================================
    // CLEAN CODE - NAMING CONVENTIONS
    // ===========================================
    // Enforce minimum identifier length (avoid single-letter variables except loops)
    'id-length': [
      'warn',
      {
        min: 2,
        // Common acceptable short names in various contexts
        exceptions: ['i', 'j', 'k', 'x', 'y', 'z', 'e', 't', '_', 'a', 'b', 'c', 'n', 'r', 'w', 'h'],
        properties: 'never', // Don't check object properties
      },
    ],

    // Disallow specific identifiers that are too generic
    'id-denylist': [
      'warn',
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
      'warn',
      {
        terms: ['fixme', 'hack', 'xxx'], // Removed 'todo' - it's often acceptable
        location: 'start',
      },
    ],

    // Enforce consistent comment spacing
    'spaced-comment': [
      'warn',
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
    'no-inline-comments': 'warn',

    // ===========================================
    // CLEAN CODE - CODE QUALITY
    // ===========================================
    // Disallow magic numbers (use named constants instead)
    // Note: This rule can be noisy, so we configure it carefully
    // Using TypeScript-specific version from @typescript-eslint
    '@typescript-eslint/no-magic-numbers': [
      'error',
      {
        ignore: [0, 1, -1, 2, 3, 4, 5, 10, 24, 60, 100, 200, 404, 401, 403, 500, 1000, 2000, 5000],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        ignoreNumericLiteralTypes: true,
        ignoreEnums: true,
        ignoreReadonlyClassProperties: true,
        ignoreTypeIndexes: true,
      },
    ],

    // Require const for variables that are never reassigned
    'prefer-const': 'warn',

    // Disallow var (use let or const)
    'no-var': 'error',

    // Prefer template literals over string concatenation
    'prefer-template': 'warn',

    // Disallow nested ternary expressions (hard to read)
    'no-nested-ternary': 'warn',

    // Disallow reassigning function parameters
    'no-param-reassign': ['warn', { props: false }],

    // Prefer destructuring from arrays and objects
    'prefer-destructuring': [
      'warn',
      {
        array: false, // Allow array[index] for clarity
        object: true,
      },
      {
        enforceForRenamedProperties: false,
      },
    ],

    // Prefer arrow functions as callbacks
    'prefer-arrow-callback': 'warn',

    // Enforce consistent arrow function body style
    'arrow-body-style': ['warn', 'as-needed'],

    // Disallow console statements (use logger instead)
    'no-console': ['warn', { allow: ['warn', 'error'] }],

    // Disallow debugger statements
    'no-debugger': 'warn',

    // Prefer object shorthand
    'object-shorthand': ['warn', 'always'],

    // Prefer spread operator over Object.assign
    'prefer-spread': 'warn',

    // Prefer rest parameters over arguments
    'prefer-rest-params': 'warn',

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
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      // Relax rules for test files
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        'max-lines-per-function': 'off',
        'max-lines': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-magic-numbers': 'off',
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
      // Relax rules for migration files
      files: ['**/migrations/**/*.ts'],
      rules: {
        'max-lines': 'off',
        'max-lines-per-function': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      // Relax rules for script files
      files: ['**/scripts/**/*.ts'],
      rules: {
        'max-lines': 'off',
        'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
      },
    },
  ],
};





