import { test, expect } from '@playwright/test';
import { aiFindElement, aiFill, aiClick, aiSelect, printAiHealingSummary, saveAiHealingResults } from '../../utils/aiHealing.js';
import { loginProfiles } from '../../profiles/login.profiles.js';
import { dashboardProfiles, profileProfiles } from '../../profiles/dashboard.profiles.js';

/**
 * AI-driven self-healing form submission tests.
 * Uses element profiles with weighted similarity scoring.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('AI-Healing Form Submit Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await aiFill(page, loginProfiles.usernameInput, 'admin');
    await aiFill(page, loginProfiles.passwordInput, 'admin123');
    await aiClick(page, loginProfiles.loginButton);
    await expect(page).toHaveURL(/.*dashboard/);
    await aiClick(page, dashboardProfiles.navProfile);
    await expect(page).toHaveURL(/.*profile/);
  });

  test.afterAll(() => {
    printAiHealingSummary();
    saveAiHealingResults('ai-form-healing.json');
  });

  test('should display create user form (AI healing)', async ({ page }) => {
    const form = await aiFindElement(page, profileProfiles.profileForm);
    await expect(form).toBeVisible();

    const firstName = await aiFindElement(page, profileProfiles.firstName);
    await expect(firstName).toBeVisible();

    const saveBtn = await aiFindElement(page, profileProfiles.saveButton);
    await expect(saveBtn).toBeVisible();

    const cancelBtn = await aiFindElement(page, profileProfiles.cancelButton);
    await expect(cancelBtn).toBeVisible();
  });

  test('should submit form successfully (AI healing)', async ({ page }) => {
    await aiFill(page, profileProfiles.firstName, 'John');
    await aiFill(page, profileProfiles.lastName, 'Doe');
    await aiFill(page, profileProfiles.userEmail, 'john@example.com');
    await aiSelect(page, profileProfiles.userRole, 'editor');
    await aiClick(page, profileProfiles.saveButton);

    const success = await aiFindElement(page, profileProfiles.successMessage);
    await expect(success).toBeVisible();
  });

  test('should clear form on cancel (AI healing)', async ({ page }) => {
    await aiFill(page, profileProfiles.firstName, 'John');
    await aiFill(page, profileProfiles.lastName, 'Doe');
    await aiClick(page, profileProfiles.cancelButton);

    const firstName = await aiFindElement(page, profileProfiles.firstName);
    await expect(firstName).toHaveValue('');
  });
});
