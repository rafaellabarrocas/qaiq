import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  retries: 5,
  workers: 1,
});
