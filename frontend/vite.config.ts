import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `vite build --mode sites` targets the Sites Function gateway; the local
// Next.js dev server and plain vite dev keep the /api/py proxy path.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    "process.env": {},
    "import.meta.env.VITE_SITES_FUNCTION": JSON.stringify(mode === "sites" ? "true" : "false"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "next/link": path.resolve(__dirname, "sites/next-shim.tsx"),
      "next/navigation": path.resolve(__dirname, "sites/next-shim.tsx"),
      "next/image": path.resolve(__dirname, "sites/next-image-shim.tsx"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api/py": {
        target: process.env.BACKEND_URL || "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/py/, "/api/v1"),
      },
    },
  },
}));
