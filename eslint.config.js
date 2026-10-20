import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * ESLint flat configuration.
 *
 * Type-aware linting is deliberately NOT enabled: `npm run typecheck` already
 * runs the full TypeScript compiler, so repeating it here would only make lint
 * slower. This config catches the class of mistakes the compiler cannot — a
 * stray `console.log` in shipped code, an unused import, a `var`, a `==`.
 *
 * The Cloud Functions package has its own tsconfig and Node runtime, so it is
 * linted separately (see functions/package.json) rather than folded in here.
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "functions/**",
      "tools/**",
      "**/*.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The codebase uses `import type` consistently; enforce it so a value
      // import of a type-only symbol is caught rather than silently erased.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Prefer `unknown` over `any`; explicit `any` in a money-handling codebase
      // is a smell worth flagging even when it is not a bug.
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    // Tests legitimately log and set up fixtures, and the emulator suites run in Node.
    files: ["src/test/**/*.{ts,tsx}", "tests/**/*.ts", "**/*.test.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
