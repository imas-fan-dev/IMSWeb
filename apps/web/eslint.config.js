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
      "build-app/**",
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
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    ignores: [
      "app/components/navigation/navigation-link.tsx",
      "app/lib/navigation/use-navigation.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-router",
              importNames: ["Link", "NavLink", "useNavigate"],
              message:
                "Use the shared NavigationLink, NavigationNavLink, or useNavigation abstraction.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.object.name='window'][callee.object.property.name='location'][callee.property.name=/^(assign|replace)$/]",
          message: "Use useNavigation() for document navigation.",
        },
        {
          selector:
            "CallExpression[callee.object.name='window'][callee.property.name='open']",
          message: "Use the shared navigation system opener.",
        },
      ],
    },
  },
  {
    files: ["app/**/*.tsx"],
    ignores: [
      "app/components/navigation/navigation-link.tsx",
      "app/layouts/app-layout.tsx",
      "app/layouts/public-layout.tsx",
      "app/pages/wiki/classic/components/wiki/classic-group-filter.tsx",
      "app/pages/wiki/modern/components/story-navigation-panel.tsx",
      "app/pages/wiki/modern/components/wiki-group-filter.tsx",
      "app/pages/wiki/modern/story-page.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='a'] > JSXAttribute[name.name='href']",
          message:
            "Use NavigationLink for navigation; raw anchors are reserved for audited hash, skip, and download links.",
        },
      ],
    },
  }
)
