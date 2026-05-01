import tseslint from 'typescript-eslint';
import awscdk from 'eslint-plugin-awscdk';

export default tseslint.config(
  {
    ignores: ['cdk.out/**', 'node_modules/**', '**/*.d.ts', '**/*.js'],
  },
  awscdk.configs.recommended,
  {
    files: ['lib/**/*.ts', 'bin/**/*.ts'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Stack IDs are CloudFormation logical IDs; renaming them orphans
      // deployed resources. Keep the existing names.
      'awscdk/no-construct-stack-suffix': 'off',

      // Props interfaces and stack public properties intentionally pass
      // construct instances between stacks (e.g. RDS Proxy, SecurityGroup).
      // Switching to I-interfaces is a non-trivial refactor, not in scope here.
      'awscdk/no-construct-in-interface': 'off',
      'awscdk/no-construct-in-public-property-of-construct': 'off',

      // Misfires on factory functions like getCertificateProviderFunction
      // that return a Construct rather than being called from inside one.
      // The auto-fix replaces the `scope` parameter with `this`, which is
      // undefined in a standalone function and breaks at runtime.
      'awscdk/require-passing-this': 'off',
      'awscdk/no-variable-construct-id': 'off',

      // Newer grants.X() API; existing grantX() calls work fine. Demote to
      // warning so it surfaces but does not fail CI.
      'awscdk/prefer-grants-property': 'warn',
    },
  },
);
