import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Build configuration
  build: {
    // Don't clear the output directory to preserve artifacts from different platform builds
    emptyOutDir: false,
    // Increase chunk size warning limit for desktop app (1.5MB)
    chunkSizeWarningLimit: 1500,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri` and other problematic files
      ignored: [
        "**/src-tauri/**",
        "**/target/**",
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**"
      ],
    },
  },
}));
