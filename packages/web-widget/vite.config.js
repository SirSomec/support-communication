import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true
      }
    }
  },
  build: {
    lib: {
      entry: "src/index.js",
      name: "SupportWidget",
      fileName: () => "widget.js",
      formats: ["iife"]
    },
    outDir: "dist",
    emptyOutDir: true
  }
});
