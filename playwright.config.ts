import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
  testDir: "tests",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["iPhone 13"] },
    },
  ],
});
