module.exports = {
  extends: ['react-app', 'react-app/jest'],
  plugins: ['i18next', 'simple-import-sort'],
  rules: {
    // ===========================================
    // IMPORT ORDERING
    // ===========================================
    // Auto-sortable alphabetical import groups (run: npm run lint:fix)
    'simple-import-sort/imports': [
      'error',
      {
        groups: [
          // Side-effect imports
          ['^\\u0000'],
          // External packages: react first, then @-scoped, then others
          ['^react', '^@?\\w'],
          // Internal path-alias imports (src/ root folders used as aliases)
          [
            '^(components|config|constants|contexts|hooks|pages|store|stories|locales)(/.*|$)',
          ],
          // Relative imports
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
          0, 1, -1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100,
        ],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        enforceConst: true,
        detectObjects: false,
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

    // Require curly braces for all control statements
    curly: ['error', 'all'],

    // Enforce consistent brace style — opening brace on same line, body on new line
    'brace-style': ['error', '1tbs', { allowSingleLine: false }],

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
    // REACT HOOK IMPORT ENFORCEMENT
    // ===========================================
    // Disallow using React hooks as globals without an explicit import from 'react'.
    // If you have `import { useState } from 'react'` the local binding takes precedence
    // and this rule will NOT fire — only unimported usage is flagged.
    'no-restricted-globals': [
      'error',
      { name: 'useState',              message: 'Import useState explicitly from "react".' },
      { name: 'useEffect',             message: 'Import useEffect explicitly from "react".' },
      { name: 'useRef',                message: 'Import useRef explicitly from "react".' },
      { name: 'useCallback',           message: 'Import useCallback explicitly from "react".' },
      { name: 'useMemo',               message: 'Import useMemo explicitly from "react".' },
      { name: 'useContext',            message: 'Import useContext explicitly from "react".' },
      { name: 'useReducer',            message: 'Import useReducer explicitly from "react".' },
      { name: 'useLayoutEffect',       message: 'Import useLayoutEffect explicitly from "react".' },
      { name: 'useImperativeHandle',   message: 'Import useImperativeHandle explicitly from "react".' },
      { name: 'useDebugValue',         message: 'Import useDebugValue explicitly from "react".' },
      { name: 'useId',                 message: 'Import useId explicitly from "react".' },
      { name: 'useTransition',         message: 'Import useTransition explicitly from "react".' },
      { name: 'useDeferredValue',      message: 'Import useDeferredValue explicitly from "react".' },
      { name: 'useSyncExternalStore',  message: 'Import useSyncExternalStore explicitly from "react".' },
    ],

    // ===========================================
    // MAGIC STRINGS ENFORCEMENT
    // ===========================================
    // Warn about magic strings (string literals that should be constants)
    // This uses no-restricted-syntax to flag string literals in certain contexts
    'no-restricted-syntax': [
      'warn',
      {
        // Exclude typeof comparisons (e.g. typeof x === 'string') — these are valid
        // TypeScript type-narrowing patterns, not magic strings.
        selector: 'BinaryExpression[operator=/^(===|!==|==|!=)$/]:not(:has(UnaryExpression[operator="typeof"])) > Literal[value=/[a-zA-Z]/]',
        message: 'Avoid magic strings in comparisons. Define them as constants instead.',
      },
      {
        selector: 'CallExpression[callee.name=/^(includes|indexOf|startsWith|endsWith)$/] > Literal[value=/[a-zA-Z]/]',
        message: 'Avoid magic strings in string methods. Define them as constants instead.',
      },
      {
        selector: 'SwitchCase > Literal[value=/[a-zA-Z]/]',
        message: 'Avoid magic strings in switch cases. Define them as constants instead.',
      },
      {
        selector: "JSXAttribute[name.name='style'] Property[key.name=/^(color|backgroundColor|borderColor)$/] > Literal[value=/^(#([0-9a-fA-F]{3,8})|red|green|blue|yellow|orange|purple|white|black|gray|grey|transparent)$/i]",
        message: 'Avoid inline color magic strings in style props. Use a named constant or theme token instead.',
      },
      {
        selector: "AssignmentExpression[left.property.name=/^(color|backgroundColor|borderColor)$/] > Literal[value=/^(#([0-9a-fA-F]{3,8})|red|green|blue|yellow|orange|purple|white|black|gray|grey|transparent)$/i]",
        message: 'Avoid inline color magic strings in style assignments. Use a named constant or theme token instead.',
      },
      {
        selector: "CallExpression[callee.name='captureEvent'] > Literal",
        message: "Avoid magic strings in captureEvent(). Use a constant from ANALYTICS_EVENTS (constants/analytics-events.ts) instead.",
      },
      // Catch inline string literals inside JSX expression containers (ternary / logical expressions)
      {
        selector: "JSXExpressionContainer > ConditionalExpression Literal[value=/^[a-zA-Z ]{2,}$/]",
        message: "String literals in JSX ternary expressions must use t() for i18n.",
      },
      {
        selector: "JSXExpressionContainer > LogicalExpression Literal[value=/^[a-zA-Z ]{2,}$/]",
        message: "String literals in JSX logical expressions must use t() for i18n.",
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
        'id-denylist': 'off', // Test files use standard Axios response shape with 'data' property
        'max-nested-callbacks': 'off', // Test files use nested describe/it blocks
        'testing-library/no-wait-for-multiple-assertions': 'off', // Tests may need multiple assertions in a single waitFor for clarity
        'no-script-url': 'off', // Test files may test URL sanitization with javascript: URLs
        'no-restricted-syntax': 'off', // Test files may use literal strings in comparisons (e.g. typeof checks)
        '@typescript-eslint/no-explicit-any': 'off', // Test files often use any for mocking
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
        'max-lines-per-function': ['warn', { max: 350, skipBlankLines: true, skipComments: true }],
      },
    },
    {
      // Large hooks pending decomposition (tracked in issue #778)
      // These hooks encapsulate complex stateful logic that requires significant refactoring
      // to break apart without introducing regressions. Tracked for decomposition.
      files: [
        '**/hooks/useEmailDetailOperations.ts',
        '**/hooks/useEmailDetailState.ts',
        '**/hooks/useEmailDetailInitialization.ts',
        '**/hooks/useEmailDetailFetching.ts',
        '**/hooks/useInboxState.ts',
        '**/hooks/useInboxCategoryAccordion.ts',
        '**/hooks/useInboxInitialization.ts',
        '**/hooks/useInboxModeChanges.ts',
        '**/hooks/useEmailProcessingPolling.ts',
        '**/hooks/settings/useAnalysisProgress.ts',
        '**/hooks/settings/useContextManagement.ts',
        '**/hooks/settings/useRecategorizeProgress.ts',
        '**/hooks/settings/useSummarizationRules.ts',
        '**/hooks/useEmailActions.ts',
        '**/hooks/useInboxKeyboardNavigation.ts',
        '**/hooks/useInboxUrlSync.ts',
        '**/hooks/useReplyDraftGeneration.ts',
      ],
      rules: {
        'max-lines-per-function': 'off',
        'max-lines': 'off',
        'max-statements': 'off',
        'complexity': 'off',
        'react-hooks/exhaustive-deps': 'off', // Intentional dependency exclusions to prevent infinite re-render cycles
      },
    },
    {
      // Large components pending decomposition (tracked in issue #778)
      // These components have complex render logic. Decomposition is planned.
      // Some files also use standard Axios request body shape where 'data' property is required by the API.
      files: [
        '**/components/email-detail/EmailDetailActions.tsx',
        '**/components/email-detail/EmailDetailHeader.tsx',
        '**/components/email-detail/EmailThreadView.tsx',
        '**/components/email-detail/CustomRuleModal.tsx',
        '**/components/email-detail/SummarySection.tsx',
        '**/components/compose/RecipientFields.tsx',
        '**/components/compose/TimePicker.tsx',
        '**/components/search/SearchResults.tsx',
        '**/components/inbox/CategorySection.tsx',
        '**/components/settings/AnalysisProgressModal.tsx',
        '**/components/settings/GuideOurAISection.tsx',
        '**/components/settings/SchedulingPreferencesSection.tsx',
        '**/components/settings/AccountDeletionSection.tsx',
        '**/components/settings/DataExportSection.tsx',
        '**/components/settings/guide-ai/SummarizationRuleAddForm.tsx',
        '**/components/settings/guide-ai/SummarizationRuleDisplay.tsx',
        '**/components/settings/guide-ai/SummarizationRuleEditForm.tsx',
        '**/components/settings/guide-ai/SummarizationRulesSection.tsx',
        '**/components/settings/integrations/GitHubConnectionStatusSection.tsx',
        '**/components/settings/integrations/GitHubIntegrationSection.tsx',
        '**/components/settings/integrations/GitHubRepoMappingsSection.tsx',
        '**/components/priority/CategoryOverrideModal.tsx',
        '**/components/rich-text/RichTextEditor.tsx',
        '**/components/inbox/debug/DebugCategorySummarySection.tsx',
        '**/components/inbox/debug/DebugSyncHistorySection.tsx',
        '**/components/crm/DealFormModal.tsx',
        '**/components/crm/KanbanColumn.tsx',
        '**/components/github/GitHubProjectBadges.tsx',
        '**/components/landing/CTAButton.tsx',
      ],
      rules: {
        'max-lines-per-function': 'off',
        'max-statements': 'off',
        'complexity': 'off',
        'id-denylist': 'off', // Some components use Axios request body shape where 'data' is required by the API
      },
    },
    {
      // Utility files with complex parsing logic pending decomposition (tracked in issue #778)
      files: [
        '**/utils/emailBodyUtils.ts',
      ],
      rules: {
        'max-lines-per-function': 'off',
        'max-statements': 'off',
        'complexity': 'off',
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
      // Debug files — these are developer-only panels, never shown to end users.
      // Literal strings, long functions, and array-index keys are acceptable here.
      files: [
        '**/debug/**/*.tsx',
        '**/debug/**/*.ts',
        '**/components/inbox/DebugPanel.tsx',
        '**/components/email-detail-inline/ReplyComposerDebugPanel.tsx',
      ],
      rules: {
        'i18next/no-literal-string': 'off',
        'max-lines-per-function': 'off',
        'react/no-array-index-key': 'off',
      },
    },
    {
      // GitHub integration components display data sourced directly from the GitHub API
      // (project names, status labels, repo names). This content is external user data,
      // not product UI strings, so i18n translation is not applicable.
      files: ['**/components/github/GitHubProject.tsx'],
      rules: {
        'i18next/no-literal-string': 'off',
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
    {
      // TypeScript type definition files — string literal types are valid TypeScript syntax,
      // not magic strings. Also 'typeof x === "string"' is a necessary type-narrowing pattern.
      files: ['**/*.types.ts', '**/*.types.tsx'],
      rules: {
        // String literals like 'pending' | 'active' are TypeScript union types, not magic strings
        'no-restricted-syntax': 'off',
      },
    },
    {
      // Relax rules for Storybook story files - these are developer tools, not user-facing
      files: ['**/*.stories.tsx', '**/*.stories.ts', '**/*.story.tsx', '**/*.story.ts'],
      rules: {
        'i18next/no-literal-string': 'off',
        'no-magic-numbers': 'off',
        'max-lines-per-function': 'off',
        'max-lines': 'off',
        'no-restricted-syntax': 'off',
        'prefer-template': 'off',
        'id-denylist': 'off',
        'no-restricted-imports': 'off',
      },
    },
  ],
};
