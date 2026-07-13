import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { serviceAdminSpaFallback } from "./vite.service-admin-fallback.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  return {
    plugins: [react(), serviceAdminSpaFallback()],
    appType: "mpa",
    build: {
      rollupOptions: {
        input: {
          main: resolve(rootDir, "index.html"),
          "service-admin": resolve(rootDir, "service-admin/index.html")
        }
      }
    },
    server: {
      port: Number(env.PORT) || 5173,
      proxy: {
        "/api": {
          // Docker pilot publishes api-gateway on 4101; a natively run gateway stays on 4100.
          target: env.DEV_API_PROXY_TARGET || "http://127.0.0.1:4100",
          changeOrigin: true
        }
      }
    }
  };
});
