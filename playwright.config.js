const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testMatch: '**/*.regression.spec.js',
  timeout: 180000,
  retries: 0,
  workers: 2,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: ['--disable-blink-features=AutomationControlled'],
    },
  },
});
