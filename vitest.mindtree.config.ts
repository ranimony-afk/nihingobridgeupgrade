import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Isolated MindTree contract tests; intentionally does not load database setup. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/kanji-mindtree-product.test.ts", "tests/kanji-mindtree-m*.test.ts"],
    setupFiles: [],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/mocks/server-only.ts", import.meta.url)),
    },
  },
});
