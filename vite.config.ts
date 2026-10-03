import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

const versionFilePath = path.resolve(__dirname, "../VERSION");
let versionFromFile = "0.0.0";

try {
  const raw = fs.readFileSync(versionFilePath, "utf8").trim();
  if (raw) {
    versionFromFile = raw;
  }
} catch (error) {
  console.warn("Unable to read VERSION file:", error);
}

const appVersion = process.env.VITE_APP_VERSION?.trim() || versionFromFile;
const buildLabel = process.env.VITE_APP_BUILD_LABEL?.trim() || "local development build";

export default defineConfig(({ command }) => {
  const nodeEnv = process.env.NODE_ENV || (command === "build" ? "production" : "development");
  // Points at `wrangler dev` (the Cloudflare Worker backend). Proxied
  // same-origin so the Worker's `excalidash_session` cookie (SameSite=Lax,
  // deliberately not None — see the Worker backend) actually rides along;
  // a cross-origin VITE_API_URL pointing straight at the Worker's port
  // fails every credentialed request with net::ERR_FAILED.
  const devBackendTarget = process.env.VITE_DEV_BACKEND_URL?.trim() || "http://localhost:8900";
  const processEnvDefines = {
    'process.env.IS_PREACT': JSON.stringify("false"),
    'process.env.NODE_ENV': JSON.stringify(nodeEnv),
  };

  return {
    plugins: [react()],
    define: {
      ...processEnvDefines,
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_APP_BUILD_LABEL': JSON.stringify(buildLabel),
    },
    optimizeDeps: {
      esbuildOptions: {
        define: processEnvDefines,
        target: "es2022",
      },
    },
    build: {
      chunkSizeWarningLimit: 2000,
    },
    server: {
      proxy: {
        // Every top-level path the Worker itself handles (see the
        // `segments[0] === "..."` / `url.pathname === "/auth/..."` checks
        // in the Worker backend). `/rooms/:id/ws` upgrades to a
        // WebSocket, hence `ws: true`.
        "/auth": { target: devBackendTarget, changeOrigin: true },
        "/collections": { target: devBackendTarget, changeOrigin: true },
        "/drawings": { target: devBackendTarget, changeOrigin: true },
        "/files": { target: devBackendTarget, changeOrigin: true },
        "/rooms": { target: devBackendTarget, changeOrigin: true, ws: true },
        "/users": { target: devBackendTarget, changeOrigin: true },
        "/mcp": { target: devBackendTarget, changeOrigin: true },
      },
    },
  };
});
