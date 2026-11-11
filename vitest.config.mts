import { defineConfig } from "vitest/config";
import path from "path";

// Tests call the route handlers directly (no dev server) against the REAL
// Supabase project, using the keys in .env.local (loaded in tests/helpers/setup.ts).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      // `server-only` throws outside Next's server bundler; tests are server code.
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/helpers/setup.ts"],
    // Some tests temporarily change shared rows (an item's availability, the
    // delivery fee). Run files one at a time so they never collide.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
