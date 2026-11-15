import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static site: data is served from /data (public/data). A future backend (ML) can be proxied under /api.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { proxy: { "/api": "http://localhost:7860" } },
});
