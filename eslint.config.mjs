import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

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
    // glue shipped under public/lib/draco for runtime glTF Draco decoding, and
    // the self-hosted MediaPipe WASM glue JS fetched into public/mediapipe).
    "public/lib/**",
    "public/mediapipe/**",
    // Archived engine-trial git worktrees are full repo copies; never lint them
    // (they otherwise dominate the report with tens of thousands of stale hits).
    ".worktrees/**",
  ]),
  {
    // Full jsx-a11y recommended set (Next only enables a small subset). The
    // "jsx-a11y" plugin is already registered by eslint-config-next, so we apply
    // only the rule map here — re-adding the plugin would conflict in flat config.
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // The app's only <video>/<audio> elements are LIVE webcam previews (a
      // MediaStream from getUserMedia); there is no captionable content, so a
      // <track> is not applicable. All other jsx-a11y recommended rules stay on.
      "jsx-a11y/media-has-caption": "off",
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
]);

export default eslintConfig;
