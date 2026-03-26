import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
    exclude: ["node_modules", "_generated"],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "./_generated/server": path.resolve(__dirname, "__tests__/mocks/convex_server.ts"),
    },
  },
});
