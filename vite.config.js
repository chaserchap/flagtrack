import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // During local dev, proxy /api to a local PostgREST instance
  server: {
    proxy: {
      "/api": {
        target:      "http://localhost:3000",
        rewrite:     (path) => path.replace(/^\/api/, ""),
        changeOrigin: true,
      },
    },
  },
});
