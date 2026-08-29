import { fileURLToPath } from "node:url"

import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

import { localExchangeMapAssets } from "./vite-exchange-map-assets"

const honoOrigin = process.env.IMS_API_ORIGIN ?? "http://127.0.0.1:3000"
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url))
// `tauri android dev` and `tauri ios dev` export this when the app runs on a
// real device, which reaches this server over the LAN instead of loopback.
const tauriDevHost = process.env.TAURI_DEV_HOST

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.names.some((name) => name.endsWith(".mjs"))
            ? "assets/[name]-[hash].js"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom"],
  },
  plugins: [
    localExchangeMapAssets(workspaceRoot),
    tailwindcss(),
    reactRouter(),
  ],
  optimizeDeps: {
    entries: ["app/**/*.{ts,tsx}"],
    include: [
      "@imsweb/contracts/**",
      "@base-ui/react > use-sync-external-store/shim",
      "@base-ui/react > use-sync-external-store/shim/with-selector",
      "@tanstack/react-virtual",
    ],
    exclude: [
      "@base-ui/react/button",
      "@base-ui/react/dialog",
      "@base-ui/react/separator",
      "@base-ui/react/toggle",
      "@base-ui/react/toggle-group",
    ],
  },
  // The linked contracts workspace publishes CommonJS; Node must load it in SSR.
  ssr: {
    external: ["@imsweb/contracts"],
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
    ...(tauriDevHost
      ? {
          host: tauriDevHost,
          strictPort: true,
          hmr: { protocol: "ws", host: tauriDevHost, port: 1421 },
        }
      : {}),
    proxy: Object.fromEntries(
      [
        "/api",
        "/assets",
        "/css",
        "/Data",
        "/eventchronicle",
        "/icon",
        "/image",
        "/runninggame",
        "/site-content",
        "/sites",
        "/uploads",
      ].map((path) => [path, { target: honoOrigin, changeOrigin: false }])
    ),
  },
})
