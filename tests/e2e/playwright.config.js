const { defineConfig, devices } = require("@playwright/test");
const path = require("path");

const BASE = "http://127.0.0.1:1996";

module.exports = defineConfig({
  testDir: ".",
  testMatch: "*.spec.js",
  timeout: 15000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: BASE, headless: true, trace: "retain-on-failure" },
  webServer: {
    command: "bash serve.sh",
    cwd: __dirname,
    url: BASE + "/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
