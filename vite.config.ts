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
    // Increase chunk size warning limit for desktop app (2MB - acceptable for desktop)
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Split heavy deps into separate chunks for better caching + smaller initial JS.
        // Vite 8 uses Rolldown, which only supports the FUNCTION form of manualChunks
        // (the object form throws "manualChunks is not a function").
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)) {
            return "react-vendor";
          }
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@tauri-apps")) return "tauri";
          if (/i18next|react-i18next/.test(id)) return "i18n";
          if (id.includes("jszip")) return "jszip";
          if (/lucide-react|react-icons/.test(id)) return "icons";
          return undefined;
        },
      },
    },
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
