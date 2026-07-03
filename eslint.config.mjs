import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Static/vendored assets are never linted (e.g. the minified Draco decoder
    // glue shipped under public/lib/draco for runtime glTF Draco decoding).
    "public/lib/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
]);

export default eslintConfig;
