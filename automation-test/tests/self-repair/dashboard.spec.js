import { test, expect } from '@playwright/test';
import { runWithHealing } from '../../utils/selfHealingLoop.js';
import { generateReport, generateSummaryReport } from '../../utils/reportGenerator.js';
import { dashboardProfiles, profileProfiles } from '../../profiles/dashboard.profiles.js';
import { enrichProfiles } from '../../profiles/elementProfile.js';

/**
 * Gen 4: Self-Repair Dashboard Tests.
 *
 * Tests dashboard and profile page functionality with
 * AI-driven self-healing repair loop.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const dashProfiles = enrichProfiles(dashboardProfiles);
const profProfiles = enrichProfiles(profileProfiles);
const allResults = [];

async function loginFirst(page) {
  await page.goto('/login');
  const userInput = page.locator('#username, #email').first();
  await userInput.waitFor({ state: 'visible', timeout: 5000 });
  await userInput.fill('admin');
  await page.locator('input[type="password"]').fill('admin123');
  const loginBtn = page.locator('#login-btn, #signin-btn, button[type="submit"]').first();
  await loginBtn.click();
  await page.waitForURL(/.*dashboard/, { timeout: 10000 });
}

test.describe('Gen 4: Self-Repair Dashboard Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginFirst(page);
  });

  test.afterAll(() => {
    if (allResults.length > 0) {
      generateSummaryReport(allResults);
    }
  });

  test('should display dashboard elements (self-repair)', async ({ page }) => {
    const result = await runWithHealing(page, 'dashboard-display', [
      {
        description: 'Verify page title',
        profile: dashProfiles.pageTitle,
        fn: async () => {
          const title = page.locator(dashProfiles.pageTitle.selector);
          await title.waitFor({ state: 'visible', timeout: 5000 });
          await expect(title).toBeVisible();
        },
      },
      {
        description: 'Verify user table',
        profile: dashProfiles.userTable,
        fn: async () => {
          const table = page.locator(dashProfiles.userTable.selector);
          await table.waitFor({ state: 'visible', timeout: 5000 });
          await expect(table).toBeVisible();
        },
      },
    ]);

    allResults.push(result);
    generateReport(result);
    expect(result.success).toBeTruthy();
  });

  test('should navigate to profile page (self-repair)', async ({ page }) => {
    const result = await runWithHealing(page, 'navigate-to-profile', [
      {
        description: 'Click profile navigation link',
        profile: dashProfiles.navProfile,
        fn: async () => {
          const nav = page.locator(dashProfiles.navProfile.selector);
          await nav.waitFor({ state: 'visible', timeout: 5000 });
          await nav.click();
        },
      },
      {
        description: 'Verify profile page loaded',
        fn: async () => {
          await expect(page).toHaveURL(/.*profile/, { timeout: 10000 });
        },
      },
      {
        description: 'Verify profile form visible',
        profile: profProfiles.profileForm,
        fn: async () => {
          const form = page.locator(profProfiles.profileForm.selector);
          await form.waitFor({ state: 'visible', timeout: 5000 });
          await expect(form).toBeVisible();
        },
      },
    ]);

    allResults.push(result);
    generateReport(result);
    expect(result.success).toBeTruthy();
  });
});
