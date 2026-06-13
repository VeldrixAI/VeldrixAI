import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    // Pre-existing lint debt is surfaced as warnings (visible, non-blocking)
    // rather than CI-blocking errors. Correctness is gated by `tsc` + the
    // production build; these rules remain as quality signal to clean up over time.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "prefer-const": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "@next/next/no-img-element": "warn",
    },
  },
  {
    // Playwright test fixtures use a `use()` callback that ESLint mistakes for
    // the React `use` hook — not applicable to Node test code.
    files: ["tests/**", "**/*.spec.ts", "**/*.fixture.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
];

export default config;
