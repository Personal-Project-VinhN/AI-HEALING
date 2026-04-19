import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiVersion = process.env.UI_VERSION || '1';
const mainAppDir = path.resolve(__dirname, '..', 'main-app');

const isRepairMode = (process.argv || []).some((a) => a.includes('self-repair'));
const testTimeout = isRepairMode ? 120000 : 30000;

export default defineConfig({
  testDir: './tests',
  timeout: testTimeout,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: `npm run dev:v${uiVersion}`,
    port: 3001,
    cwd: mainAppDir,
    reuseExistingServer: true,
    timeout: 60000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

