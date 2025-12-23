module.exports = {
  extends: ['react-app', 'react-app/jest'],
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
    // Disabled - too noisy for UI code with spacing/timing values
    'no-magic-numbers': 'off',

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
    // I18N ENFORCEMENT
    // ===========================================
    // Warn about literal strings in JSX that should use i18n
    // This is a simple regex-based check - more sophisticated rules would require a plugin
    'no-literal-strings': 'off', // Disabled - using custom check below
  },
  overrides: [
    {
      // Relax rules for test files
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
      rules: {
        'max-lines-per-function': 'off',
        'max-lines': 'off',
      },
    },
    {
      // Relax rules for configuration files
      files: ['*.config.js', '*.config.ts', 'setupTests.ts'],
      rules: {
        'max-lines': 'off',
        'id-length': 'off',
      },
    },
    {
      // Relax function length for page components (they often have lots of JSX)
      files: ['**/pages/*.tsx', '**/pages/*.ts'],
      rules: {
        'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
      },
    },
  ],
};
