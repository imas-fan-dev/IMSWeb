import js from "@eslint/js"
import { defineConfig } from "eslint/config"
import betterTailwindcss from "eslint-plugin-better-tailwindcss"
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

export default defineConfig(
  {
    // src-tauri holds the Rust shell. Its target/ and gen/ trees are Cargo and
    // Tauri build output, including generated JavaScript that is not our source.
    // data/ is the untracked local scratch area declared in the root .gitignore;
    // whatever lands there is operator data or one-off scripts, not shipped code.
    ignores: [
      "build/**",
      ".react-router/**",
      "data/**",
      "node_modules/**",
      "src-tauri/target/**",
      "src-tauri/gen/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "better-tailwindcss": betterTailwindcss,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      "better-tailwindcss": {
        entryPoint: "app/app.css",
        rootFontSize: 16,
      },
    },
    rules: {
      "better-tailwindcss/enforce-canonical-classes": "error",
    },
  }
)
