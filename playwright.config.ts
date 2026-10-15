import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:55399",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter @futelab/folio build && pnpm --filter @futelab/folio-demo dev --host 127.0.0.1 --port 55399",
    url: "http://127.0.0.1:55399",
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"] },
      testMatch: /(?:editor-reliability|demo-persistence)\.spec\.ts/,
    },
  ],
});
