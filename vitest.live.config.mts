import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** `npm run test:live` only. Calls the real API; never part of `npm test`. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests-live/**/*.live.ts"],
    environment: "node",
  },
});
