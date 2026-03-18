import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: {
    timeout: 30_000
  },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  }
});
