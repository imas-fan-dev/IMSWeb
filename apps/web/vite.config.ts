import { fileURLToPath } from "node:url"

import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

import {
  API_PROXY_PATH_PREFIXES,
  PUBLIC_SITE_PROXY_PATH_PREFIXES,
} from "./app/lib/bundle-path-policy"
import {
  localExchangeMapAssets,
  TAURI_MAP_ORIGINS,
} from "./vite-exchange-map-assets"
import { GENERATED_BUILD_WATCH_OPTIONS } from "./vite-watch"

const honoOrigin = process.env.IMS_API_ORIGIN ?? "http://127.0.0.1:3000"
const publicSiteProxyOrigin =
  process.env.IMS_PUBLIC_SITE_ORIGIN ?? "https://idol-master.top"
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url))
// `tauri android dev` and `tauri ios dev` export this when the app runs on a
// real device, which reaches this server over the LAN instead of loopback.
const isAppTarget = process.env.VITE_IMS_APP_TARGET === "app"
const localMediaBucket = process.env.IMS_RUSTFS_BUCKET ?? "imsweb-media-local"
const localMediaProxyOrigin =
  process.env.IMS_LOCAL_MEDIA_PROXY_ORIGIN ??
  (isAppTarget ? "http://127.0.0.1:9000" : undefined)
const localMediaPathPrefix =
  process.env.VITE_IMS_LOCAL_MEDIA_PATH_PREFIX ??
  (isAppTarget ? `/${localMediaBucket}` : undefined)
const tauriDevHost = isAppTarget ? process.env.TAURI_DEV_HOST : undefined

// Keep heavy lazy dependencies separate so page edits do not invalidate their
// cached library code.
const VENDOR_CHUNK_GROUPS = [
  {
    name: "vendor-maplibre",
    test: /[\\/]node_modules[\\/]maplibre-gl[\\/]/,
  },
  {
    name: "vendor-pmtiles",
    test: /[\\/]node_modules[\\/]pmtiles[\\/]/,
  },
  {
    name: "vendor-echarts",
    test: /[\\/]node_modules[\\/](echarts|zrender)[\\/]/,
  },
  {
    name: "vendor-tiptap",
    test: /[\\/]node_modules[\\/](@tiptap[\\/]|prosemirror-)/,
  },
]

export default defineConfig({
  build: {
    // The largest output is the lazily loaded maplibre vendor chunk.
    chunkSizeWarningLimit: 1050,
    rolldownOptions: {
      checks: {
        // React Router must process lucide's full dynamic icon registry so
        // persisted icon names remain renderable. That known module graph makes
        // plugin timing ratios noisy even when wall-clock build time is healthy.
        pluginTimings: false,
      },
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.names.some((name) => name.endsWith(".mjs"))
            ? "assets/[name]-[hash].js"
            : "assets/[name]-[hash][extname]",
        codeSplitting: {
          groups: VENDOR_CHUNK_GROUPS,
        },
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
      "@imsweb/contracts/fudaba/guest-submissions",
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
    cors: { origin: [...TAURI_MAP_ORIGINS] },
    fs: {
      allow: [workspaceRoot],
    },
    // Web and Tauri builds must not feed generated changes back into Vite.
    watch: GENERATED_BUILD_WATCH_OPTIONS,
    ...(isAppTarget
      ? {
          host: true,
          strictPort: true,
          ...(tauriDevHost
            ? {
                hmr: { protocol: "ws", host: tauriDevHost, port: 1421 },
              }
            : {}),
        }
      : {}),
    proxy: {
      ...(isAppTarget && localMediaProxyOrigin && localMediaPathPrefix
        ? {
            [localMediaPathPrefix]: {
              target: localMediaProxyOrigin,
              changeOrigin: true,
            },
          }
        : {}),
      ...Object.fromEntries(
        PUBLIC_SITE_PROXY_PATH_PREFIXES.map((path) => [
          path,
          { target: publicSiteProxyOrigin, changeOrigin: true },
        ])
      ),
      ...Object.fromEntries(
        API_PROXY_PATH_PREFIXES.map((path) => [
          path,
          { target: honoOrigin, changeOrigin: false },
        ])
      ),
    },
  },
})
