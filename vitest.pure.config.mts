import { defineConfig } from "vitest/config";
import path from "path";

// Network-free tests only: files named *.pure.test.ts. Standalone config on purpose:
// no globalSetup (it talks to Supabase) and no .env.local loading, so these tests
// prove they need neither network nor secrets. Keep aliases in sync with vitest.config.mts.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/**/*.pure.test.ts"],
    environment: "node",
  },
});
