import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { serviceAdminSpaFallback } from "./vite.service-admin-fallback.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
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
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4100",
        changeOrigin: true
      }
    }
  }
});
