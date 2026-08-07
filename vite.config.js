import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { serviceAdminSpaFallback } from "./vite.service-admin-fallback.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode, isSsrBuild }) => {
  const env = loadEnv(mode, rootDir, "");
  const publicSiteBuildConfig = {
    PUBLIC_SITE_ORIGIN: env.PUBLIC_SITE_ORIGIN || "https://supportcom.ru",
    PUBLIC_SITE_INDEXABLE: env.PUBLIC_SITE_INDEXABLE || (mode === "production" ? "true" : "false"),
    PUBLIC_SITE_METRIKA_ID: env.PUBLIC_SITE_METRIKA_ID || ""
  };
  return {
    plugins: [react(), serviceAdminSpaFallback()],
    define: {
      __PUBLIC_SITE_BUILD_CONFIG__: JSON.stringify(publicSiteBuildConfig)
    },
    appType: "mpa",
    build: {
      ...(isSsrBuild
        ? {
            outDir: resolve(rootDir, ".prerender"),
            emptyOutDir: true,
            rollupOptions: {
              output: { entryFileNames: "public-server-entry.js" }
            }
          }
        : {
            rollupOptions: {
              input: {
                main: resolve(rootDir, "index.html"),
                "service-admin": resolve(rootDir, "service-admin/index.html")
              }
            }
          })
    },
    server: {
      port: Number(env.PORT) || 5173,
      proxy: {
        "/api": {
          // Docker pilot publishes api-gateway on 4101; a natively run gateway stays on 4100.
          target: process.env.DEV_API_PROXY_TARGET || env.DEV_API_PROXY_TARGET || "http://127.0.0.1:4100",
          changeOrigin: true
        }
      }
    }
  };
});
