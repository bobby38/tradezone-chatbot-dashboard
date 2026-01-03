import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

// Load .env.local for test environment
dotenv.config({ path: ".env.local" });

export default defineConfig({
  use: {
    baseURL: process.env.API_BASE_URL || "http://127.0.0.1:3000",
  },
  testDir: "tests",
  // Run tests sequentially to avoid rate limiting
  workers: 1,
  // Retry failed tests once (in case of transient rate limit issues)
  retries: 1,
  // Increase timeout for AI API calls
  timeout: 90000, // 90 seconds per test
  expect: {
    timeout: 60000, // 60 seconds for assertions
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Disable mobile-chrome to reduce test count and avoid rate limiting
    // {
    //   name: "mobile-chrome",
    //   use: { ...devices["iPhone 13"] },
    // },
  ],
});
