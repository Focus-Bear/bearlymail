// ESLint 10 flat config.
// Uses typescript-eslint v8 (natively supports ESLint 10) for TypeScript parsing.
// eslint-plugin-react and eslint-plugin-react-hooks are direct devDependencies
// and are loaded directly here without FlatCompat.
const tseslint = require('typescript-eslint');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const i18nextPlugin = require('eslint-plugin-i18next');
const simpleImportSortPlugin = require('eslint-plugin-simple-import-sort');

module.exports = tseslint.config(
  // Ignore build artifacts and non-source files
  {
    ignores: ['build/**', 'dist/**', 'node_modules/**'],
  },

  // Main configuration for TypeScript/React source files
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      i18next: i18nextPlugin,
      'simple-import-sort': simpleImportSortPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // ===========================================
      // IMPORT ORDERING
      // ===========================================
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^\\u0000'],
            ['^react', '^@?\\w'],
            ['^(components|config|constants|contexts|hooks|pages|store|stories|locales)(/.*|$)'],
            ['^\\.'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',

      // ===========================================
      // FILE SIZE LIMITS
      // ===========================================
      'max-lines': ['warn', { max: 800, skipBlankLines: true, skipComments: true }],

      // ===========================================
      // FUNCTION LENGTH LIMITS
      // ===========================================
      'max-lines-per-function': [
        'warn',
        { max: 100, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      'max-statements': ['warn', 30, { ignoreTopLevelFunctions: true }],
      'max-nested-callbacks': ['warn', 4],
      'max-params': ['warn', 5],
      complexity: ['warn', 20],

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
        'warn',
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
      'no-warning-comments': ['warn', { terms: ['fixme', 'hack', 'xxx'], location: 'start' }],

      // ===========================================
      // CLEAN CODE - CODE QUALITY
      // ===========================================
      'no-magic-numbers': [
        'error',
        {
          ignore: [0, 1, -1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          enforceConst: true,
          detectObjects: false,
        },
      ],
      'prefer-const': 'warn',
      'no-var': 'error',
      'prefer-template': 'warn',
      'no-nested-ternary': 'warn',
      'no-param-reassign': ['warn', { props: false }],
      curly: ['error', 'all'],
      'brace-style': ['error', '1tbs', { allowSingleLine: false }],

      // ===========================================
      // REACT SPECIFIC CLEAN CODE
      // ===========================================
      'react/sort-comp': 'off',
      'react/no-array-index-key': 'warn',
      'react/jsx-boolean-value': ['warn', 'never'],
      'react/jsx-max-depth': ['warn', { max: 8 }],
      'react/no-danger': 'error',

      // ===========================================
      // REACT HOOKS
      // ===========================================
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ===========================================
      // REACT HOOK IMPORT ENFORCEMENT
      // ===========================================
      'no-restricted-globals': [
        'error',
        { name: 'useState', message: 'Import useState explicitly from "react".' },
        { name: 'useEffect', message: 'Import useEffect explicitly from "react".' },
        { name: 'useRef', message: 'Import useRef explicitly from "react".' },
        { name: 'useCallback', message: 'Import useCallback explicitly from "react".' },
        { name: 'useMemo', message: 'Import useMemo explicitly from "react".' },
        { name: 'useContext', message: 'Import useContext explicitly from "react".' },
        { name: 'useReducer', message: 'Import useReducer explicitly from "react".' },
        { name: 'useLayoutEffect', message: 'Import useLayoutEffect explicitly from "react".' },
        {
          name: 'useImperativeHandle',
          message: 'Import useImperativeHandle explicitly from "react".',
        },
        { name: 'useDebugValue', message: 'Import useDebugValue explicitly from "react".' },
        { name: 'useId', message: 'Import useId explicitly from "react".' },
        { name: 'useTransition', message: 'Import useTransition explicitly from "react".' },
        { name: 'useDeferredValue', message: 'Import useDeferredValue explicitly from "react".' },
        {
          name: 'useSyncExternalStore',
          message: 'Import useSyncExternalStore explicitly from "react".',
        },
      ],

      // ===========================================
      // MAGIC STRINGS ENFORCEMENT
      // ===========================================
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'BinaryExpression[operator=/^(===|!==|==|!=)$/]:not(:has(UnaryExpression[operator="typeof"])) > Literal[value=/[a-zA-Z]/]',
          message: 'Avoid magic strings in comparisons. Define them as constants instead.',
        },
        {
          selector:
            'CallExpression[callee.name=/^(includes|indexOf|startsWith|endsWith)$/] > Literal[value=/[a-zA-Z]/]',
          message: 'Avoid magic strings in string methods. Define them as constants instead.',
        },
        {
          selector: 'SwitchCase > Literal[value=/[a-zA-Z]/]',
          message: 'Avoid magic strings in switch cases. Define them as constants instead.',
        },
        {
          selector:
            "JSXAttribute[name.name='style'] Property[key.name=/^(color|backgroundColor|borderColor)$/] > Literal[value=/^(#([0-9a-fA-F]{3,8})|red|green|blue|yellow|orange|purple|white|black|gray|grey|transparent)$/i]",
          message:
            'Avoid inline color magic strings in style props. Use a named constant or theme token instead.',
        },
        {
          selector:
            'AssignmentExpression[left.property.name=/^(color|backgroundColor|borderColor)$/] > Literal[value=/^(#([0-9a-fA-F]{3,8})|red|green|blue|yellow|orange|purple|white|black|gray|grey|transparent)$/i]',
          message:
            'Avoid inline color magic strings in style assignments. Use a named constant or theme token instead.',
        },
        {
          selector: "CallExpression[callee.name='captureEvent'] > Literal",
          message:
            'Avoid magic strings in captureEvent(). Use a constant from ANALYTICS_EVENTS (constants/analytics-events.ts) instead.',
        },
        {
          selector: "JSXAttribute[name.name='href'][value.value='#']",
          message:
            "Avoid href=\"#\" fake links. Use a real URL path or React Router's <Link to=\"...\"> component instead.",
        },
        {
          selector:
            'JSXExpressionContainer:not(JSXAttribute > JSXExpressionContainer) > ConditionalExpression > Literal[value=/^[a-zA-Z][a-zA-Z ]*[a-zA-Z]$/]',
          message: 'String literals in JSX ternary expressions must use t() for i18n.',
        },
        {
          selector:
            'JSXExpressionContainer:not(JSXAttribute > JSXExpressionContainer) > LogicalExpression > Literal[value=/^[a-zA-Z][a-zA-Z ]*[a-zA-Z]$/]',
          message: 'String literals in JSX logical expressions must use t() for i18n.',
        },
      ],

      // ===========================================
      // I18N ENFORCEMENT
      // ===========================================
      'i18next/no-literal-string': [
        'error',
        {
          markupOnly: true,
          onlyAttribute: [],
          ignore: [
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
      // TYPE SAFETY
      // ===========================================
      '@typescript-eslint/no-explicit-any': 'error',

      // ===========================================
      // VITE ENVIRONMENT VARIABLES
      // ===========================================
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Use import.meta.env instead of process.env. This is a Vite project - use VITE_* prefixed variables.',
        },
      ],

      // ===========================================
      // IMPORT ENFORCEMENT
      // ===========================================
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['../*', '../../*', '../../../*', '../../../../*'],
              message:
                'Use absolute imports from src/ instead of relative imports (e.g., use "components/..." instead of "../components/...")',
            },
          ],
        },
      ],
    },
  },

  // ===========================================
  // FILE OVERRIDES
  // ===========================================

  // Relax rules for test files
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      'i18next/no-literal-string': 'off',
      'no-magic-numbers': 'off',
      'id-denylist': 'off',
      'max-nested-callbacks': 'off',
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Relax rules for configuration files (Vite/Jest run in Node.js)
  {
    files: ['*.config.js', '*.config.ts', 'setupTests.ts'],
    rules: {
      'max-lines': 'off',
      'id-length': 'off',
      'i18next/no-literal-string': 'off',
      'no-restricted-properties': 'off',
    },
  },

  // Relax function length for page components (lots of JSX)
  {
    files: ['**/pages/*.tsx', '**/pages/*.ts'],
    rules: {
      'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },

  // Disable i18n for legal content files
  {
    files: ['**/terms/**/*.tsx', '**/privacy/**/*.tsx', '**/legal/**/*.tsx'],
    rules: {
      'i18next/no-literal-string': 'off',
    },
  },

  // Booking pages - full i18n required
  {
    files: ['**/booking/**/*.tsx', '**/booking/**/*.ts'],
    rules: {
      'i18next/no-literal-string': 'error',
    },
  },

  // Debug files — developer-only panels, never shown to end users
  {
    files: [
      '**/debug/**/*.tsx',
      '**/debug/**/*.ts',
      '**/components/inbox/DebugPanel.tsx',
      '**/components/email-detail-inline/ReplyComposerDebugPanel.tsx',
      '**/components/email-detail-inline/EmailDetailDebugPanel.tsx',
      '**/components/email-detail/EmailDetailDebugInfo.tsx',
    ],
    rules: {
      'i18next/no-literal-string': 'off',
      'no-restricted-syntax': 'off',
      'max-lines-per-function': 'off',
      'react/no-array-index-key': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'id-denylist': 'off',
    },
  },

  // GitHub integration components — external data, not product UI strings
  {
    files: ['**/components/github/GitHubProject.tsx'],
    rules: {
      'i18next/no-literal-string': 'off',
    },
  },

  // ErrorBoundary — may not have translation context when app crashes
  {
    files: ['**/ErrorBoundary.tsx'],
    rules: {
      'i18next/no-literal-string': 'off',
    },
  },

  // TypeScript type definition files — string literal types are valid TS syntax
  {
    files: ['**/*.types.ts', '**/*.types.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // Storybook story files — developer tools, never shipped to users
  {
    files: ['**/*.stories.tsx', '**/*.stories.ts', '**/*.story.tsx', '**/*.story.ts'],
    rules: {
      'i18next/no-literal-string': 'off',
      'no-magic-numbers': 'off',
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      'no-restricted-syntax': 'off',
      'prefer-template': 'off',
      'id-denylist': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'react/no-array-index-key': 'off',
    },
  },

  // SanitizedHTML.tsx — auditable exception for dangerouslySetInnerHTML (wraps DOMPurify)
  {
    files: ['**/components/common/SanitizedHTML.tsx'],
    rules: {
      'react/no-danger': 'off',
    },
  },

  // Workflow & MCP settings components — dense config UI with many inline style
  // values; relax magic-number / array-key rules only (i18n is fully enforced).
  {
    files: [
      '**/components/settings/workflows/**/*.tsx',
      '**/components/settings/workflows/**/*.ts',
      '**/components/settings/mcp/**/*.tsx',
      '**/components/settings/mcp/**/*.ts',
    ],
    rules: {
      'no-magic-numbers': 'off',
      'react/no-array-index-key': 'off',
    },
  },

  // Storybook helper files — developer-only fixtures, same relaxed rules as stories
  {
    files: ['**/stories/storyHelpers/**/*.tsx', '**/stories/storyHelpers/**/*.ts'],
    rules: {
      'i18next/no-literal-string': 'off',
      'no-magic-numbers': 'off',
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      'no-restricted-syntax': 'off',
      'prefer-template': 'off',
      'id-denylist': 'off',
      'no-nested-ternary': 'off',
    },
  },
);
