# ESLint Rule for i18n Enforcement

To enforce i18n usage in React components and prevent raw strings, you can install and configure the `eslint-plugin-i18next` plugin.

## Installation

```bash
cd client
npm install --save-dev eslint-plugin-i18next --legacy-peer-deps
```

## Configuration

Add to `.eslintrc.js`:

```javascript
module.exports = {
  extends: ["react-app", "react-app/jest"],
  plugins: ["i18next"],
  rules: {
    "i18next/no-literal-string": [
      "error",
      {
        markupOnly: true,
        onlyAttribute: [],
        validateTemplate: true,
        ignore: [
          "className",
          "data-testid",
          "data-*",
          "aria-*",
          "id",
          "key",
          "href",
          "src",
          "alt",
          "title",
          "placeholder",
          "type",
          "name",
          "value",
          "role",
          "tabIndex",
          "style",
          "onClick",
          "onChange",
          "onSubmit",
          "console.log",
          "console.error",
          "localStorage",
          "window.location",
          "process.env",
        ],
      },
    ],
  },
};
```

## Manual Check

Until the plugin is installed, you can manually check for raw strings by searching for:

- JSX text content that's not wrapped in `{t('...')}`
- String literals in JSX attributes (except those in the ignore list)

## Current Status

The React components (`Login.tsx` and `SetupPassword.tsx`) have been updated to use i18n translations. All user-facing strings should now use the `t()` function from `useTranslation()`.
