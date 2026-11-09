import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5190,
    proxy: { "/api": "http://127.0.0.1:8790" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
