import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

/**
 * Flat config, first outing.
 *
 * Every rule is downgraded to `warn` on purpose: the point is to make the
 * existing gaps visible without turning a green repo red, so `pnpm lint` still
 * exits 0 today. Promote a rule to `error` once its violation count is zero —
 * that is the ratchet, the same shape as `pnpm arch` on the server.
 *
 * Scope: `src/**` only. `src/vendor/**` is vendored and out of scope (root
 * AGENTS.md), so it is not linted and must not be "fixed" from here.
 *
 * Type-aware rules are deliberately NOT enabled: `pnpm typecheck` already runs
 * the compiler over the same files, and a second type-aware pass would roughly
 * double the wall clock for rules tsc largely covers.
 */

/** `error`/2 → `warn`, preserving any rule options. */
const downgrade = (level) => {
  if (Array.isArray(level)) return ['warn', ...level.slice(1)];
  return level === 'error' || level === 2 ? 'warn' : level;
};

const asWarnings = (config) => ({
  ...config,
  rules: Object.fromEntries(
    Object.entries(config.rules ?? {}).map(([id, level]) => [id, downgrade(level)]),
  ),
});

export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'src/vendor/**', 'next-env.d.ts'],
  },

  asWarnings(js.configs.recommended),
  ...tseslint.configs.recommended.map(asWarnings),
  asWarnings(jsxA11y.flatConfigs.recommended),
  // v7 keeps the eslintrc-shaped configs at the top level; the flat ones live
  // under `.flat`. Picking the wrong one fails with "plugins as an array".
  asWarnings(reactHooks.configs.flat['recommended-latest']),

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
