import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  retries: 0,
  reporter: "list",
  use: {
    headless: true,
  },
})
