import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
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
  ],
});
