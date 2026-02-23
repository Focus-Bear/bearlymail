module.exports = {
  extends: ['react-app', 'react-app/jest'],
  plugins: ['i18next'],
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
    // Flag functions with more than 100 lines (relaxed for React components with JSX)
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
    // Note: 'info' is allowed as it's a standard semantic name for color categories in design systems
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

    // ===========================================
    // CLEAN CODE - CODE QUALITY
    // ===========================================
    // Disallow magic numbers (use named constants instead)
    // Configured to allow common UI values while flagging business logic numbers
    'no-magic-numbers': [
      'error',
      {
        ignore: [
          0, 1, -1, // Common zero/one values
          2, 3, 4, 5, 6, 7, 8, 9, 10, // Common small numbers
          100, 1000, // Common percentage/scale values
          24, 60, 3600, // Time-related (hours, minutes, seconds)
        ],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
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

    // Require curly braces for all control statements (off - too strict)
    curly: 'off',

    // Enforce consistent brace style (off - too strict)
    'brace-style': 'off',

    // ===========================================
    // REACT SPECIFIC CLEAN CODE
    // ===========================================
    // Enforce component methods order (lifecycle, handlers, render)
    'react/sort-comp': 'off', // Disabled as it can be too strict for functional components

    // Prevent usage of array index in keys (can cause issues with re-renders)
    'react/no-array-index-key': 'warn',

    // Enforce boolean attributes notation in JSX
    'react/jsx-boolean-value': ['warn', 'never'],

    // Limit JSX depth (too deep = hard to read) - relaxed
    'react/jsx-max-depth': ['warn', { max: 8 }],

    // ===========================================
    // MAGIC STRINGS ENFORCEMENT
    // ===========================================
    // Warn about magic strings (string literals that should be constants)
    // This uses no-restricted-syntax to flag string literals in certain contexts
    'no-restricted-syntax': [
      'warn',
      {
        selector: 'BinaryExpression[operator=/^(===|!==|==|!=)$/] > Literal[value=/^[a-zA-Z_][a-zA-Z0-9_]*$/]',
        message: 'Avoid magic strings in comparisons. Define them as constants instead.',
      },
      {
        selector: 'CallExpression[callee.name=/^(includes|indexOf|startsWith|endsWith)$/] > Literal[value=/^[a-zA-Z_][a-zA-Z0-9_]*$/]',
        message: 'Avoid magic strings in string methods. Define them as constants instead.',
      },
    ],

    // ===========================================
    // I18N ENFORCEMENT
    // ===========================================
    // Error on literal strings in JSX that should use i18n
    // Use file-level overrides to disable for debug/test files
    'i18next/no-literal-string': [
      'error',
      {
        markupOnly: true, // Only check JSX, not regular code
        onlyAttribute: [], // Check all attributes, not just specific ones
        ignore: [
          // Ignore common non-translatable strings
          'className',
          'id',
          'data-testid',
          'aria-label',
          'aria-labelledby',
          'aria-describedby',
          'role',
          'type',
          'method',
          'action',
          'href',
          'src',
          'alt',
          'title',
          'placeholder',
          'name',
          'value',
          'key',
          'for',
          'htmlFor',
        ],
        // Allow strings that are clearly not user-facing
        validateTemplate: true,
        ignoreAttribute: [
          'className',
          'id',
          'data-testid',
          'key',
          'for',
          'htmlFor',
          'type',
          'method',
          'action',
          'href',
          'src',
          'name',
          'value',
        ],
      },
    ],

    // ===========================================
    // VITE ENVIRONMENT VARIABLES
    // ===========================================
    // Disallow process.env in client code - this is a Vite project, not CRA.
    // Use import.meta.env.VITE_* instead of process.env.REACT_APP_*.
    'no-restricted-properties': [
      'error',
      {
        object: 'process',
        property: 'env',
        message: 'Use import.meta.env instead of process.env. This is a Vite project - use VITE_* prefixed variables.',
      },
    ],

    // ===========================================
    // IMPORT ENFORCEMENT
    // ===========================================
    // Disallow relative imports that go up directories (enforce absolute imports from src/)
    'no-restricted-imports': [
      'warn',
      {
        patterns: [
          {
            group: ['../*', '../../*', '../../../*', '../../../../*'],
            message: 'Use absolute imports from src/ instead of relative imports (e.g., use "components/..." instead of "../components/...")',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // Relax rules for test files
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
      rules: {
        'max-lines-per-function': 'off',
        'max-lines': 'off',
        'i18next/no-literal-string': 'off', // Test files don't need i18n
        'no-magic-numbers': 'off', // Test files can use magic numbers
      },
    },
    {
      // Relax rules for configuration files
      files: ['*.config.js', '*.config.ts', 'setupTests.ts'],
      rules: {
        'max-lines': 'off',
        'id-length': 'off',
        'i18next/no-literal-string': 'off', // Config files don't need i18n
      },
    },
    {
      // Relax function length for page components (they often have lots of JSX)
      files: ['**/pages/*.tsx', '**/pages/*.ts'],
      rules: {
        'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
      },
    },
    {
      // Disable i18n for debug files - these are developer tools, not user-facing
      files: ['**/debug/**/*.tsx', '**/debug/**/*.ts', '**/Debug*.tsx', '**/Debug*.ts'],
      rules: {
        'i18next/no-literal-string': 'off',
      },
    },
    {
      // Disable i18n for legal content files - legal text is typically not translated
      files: ['**/terms/**/*.tsx', '**/privacy/**/*.tsx', '**/legal/**/*.tsx'],
      rules: {
        'i18next/no-literal-string': 'off',
      },
    },
    {
      // Disable i18n for booking/public pages - these may be intentionally in English
      files: ['**/booking/**/*.tsx', '**/booking/**/*.ts'],
      rules: {
        'i18next/no-literal-string': 'warn', // Still warn, but don't block
      },
    },
    {
      // Disable i18n for ErrorBoundary - error boundaries catch errors during render
      // and may not have access to translation context when the app crashes
      files: ['**/ErrorBoundary.tsx'],
      rules: {
        'i18next/no-literal-string': 'off',
      },
    },
  ],
};
