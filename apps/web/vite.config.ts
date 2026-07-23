import { fileURLToPath } from "node:url"

import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const honoOrigin = process.env.IMS_API_ORIGIN ?? "http://127.0.0.1:3000"
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url))

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom"],
  },
  plugins: [tailwindcss(), reactRouter()],
  optimizeDeps: {
    include: [
      "@base-ui/react > use-sync-external-store/shim",
      "@base-ui/react > use-sync-external-store/shim/with-selector",
    ],
    exclude: [
      "@base-ui/react/button",
      "@base-ui/react/dialog",
      "@base-ui/react/separator",
    ],
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
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
        "/story",
        "/uploads",
        "/wiki",
      ].map((path) => [path, { target: honoOrigin, changeOrigin: true }])
    ),
  },
})
