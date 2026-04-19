import { test, expect } from '@playwright/test';
import { runWithHealing } from '../../utils/selfHealingLoop.js';
import { generateReport, generateSummaryReport } from '../../utils/reportGenerator.js';
import { profileProfiles } from '../../profiles/dashboard.profiles.js';
import { enrichProfiles } from '../../profiles/elementProfile.js';

/**
 * Gen 4: Self-Repair Form Submit Tests.
 *
 * Tests profile form submission with AI-driven self-healing repair loop.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const profiles = enrichProfiles(profileProfiles);
const allResults = [];

async function loginAndGoToProfile(page) {
  await page.goto('/login');
  const userInput = page.locator('#username, #email').first();
  await userInput.waitFor({ state: 'visible', timeout: 5000 });
  await userInput.fill('admin');
  await page.locator('input[type="password"]').fill('admin123');
  const loginBtn = page.locator('#login-btn, #signin-btn, button[type="submit"]').first();
  await loginBtn.click();
  await page.waitForURL(/.*dashboard/, { timeout: 10000 });
  const profileLink = page.locator('#nav-profile, #nav-account, a[href="/profile"]').first();
  await profileLink.click();
  await page.waitForURL(/.*profile/, { timeout: 10000 });
}

test.describe('Gen 4: Self-Repair Form Submit Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndGoToProfile(page);
  });

  test.afterAll(() => {
    if (allResults.length > 0) {
      generateSummaryReport(allResults);
    }
  });

  test('should fill and submit profile form (self-repair)', async ({ page }) => {
    const result = await runWithHealing(page, 'form-submit', [
      {
        description: 'Fill first name',
        profile: profiles.firstName,
        fn: async () => {
          const input = page.locator(profiles.firstName.selector);
          await input.waitFor({ state: 'visible', timeout: 5000 });
          await input.fill('John');
        },
      },
      {
        description: 'Fill last name',
        profile: profiles.lastName,
        fn: async () => {
          const input = page.locator(profiles.lastName.selector);
          await input.waitFor({ state: 'visible', timeout: 5000 });
          await input.fill('Doe');
        },
      },
      {
        description: 'Fill email',
        profile: profiles.userEmail,
        fn: async () => {
          const input = page.locator(profiles.userEmail.selector);
          await input.waitFor({ state: 'visible', timeout: 5000 });
          await input.fill('john@example.com');
        },
      },
      {
        description: 'Select role',
        profile: profiles.userRole,
        fn: async () => {
          const select = page.locator(profiles.userRole.selector);
          await select.waitFor({ state: 'visible', timeout: 5000 });
          await select.selectOption('admin');
        },
      },
      {
        description: 'Click save button',
        profile: profiles.saveButton,
        fn: async () => {
          const btn = page.locator(profiles.saveButton.selector);
          await btn.waitFor({ state: 'visible', timeout: 5000 });
          await btn.click();
        },
      },
      {
        description: 'Verify success message',
        profile: profiles.successMessage,
        fn: async () => {
          const msg = page.locator(profiles.successMessage.selector);
          await msg.waitFor({ state: 'visible', timeout: 5000 });
          await expect(msg).toContainText('successfully');
        },
      },
    ]);

    allResults.push(result);
    generateReport(result);
    expect(result.success).toBeTruthy();
  });

  test('should cancel form (self-repair)', async ({ page }) => {
    const result = await runWithHealing(page, 'form-cancel', [
      {
        description: 'Fill first name',
        profile: profiles.firstName,
        fn: async () => {
          const input = page.locator(profiles.firstName.selector);
          await input.waitFor({ state: 'visible', timeout: 5000 });
          await input.fill('Jane');
        },
      },
      {
        description: 'Click cancel button',
        profile: profiles.cancelButton,
        fn: async () => {
          const btn = page.locator(profiles.cancelButton.selector);
          await btn.waitFor({ state: 'visible', timeout: 5000 });
          await btn.click();
        },
      },
      {
        description: 'Verify redirected to dashboard',
        fn: async () => {
          await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
        },
      },
    ]);

    allResults.push(result);
    generateReport(result);
    expect(result.success).toBeTruthy();
  });
});
