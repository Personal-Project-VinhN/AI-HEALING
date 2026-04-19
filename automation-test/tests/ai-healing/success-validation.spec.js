import { test, expect } from '@playwright/test';
import { aiFindElement, aiFill, aiClick, aiSelect, printAiHealingSummary, saveAiHealingResults } from '../../utils/aiHealing.js';
import { loginProfiles } from '../../profiles/login.profiles.js';
import { dashboardProfiles, profileProfiles } from '../../profiles/dashboard.profiles.js';

/**
 * AI-driven self-healing end-to-end success validation.
 * Full flow: login -> dashboard -> form submit -> success.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('AI-Healing Success Validation Tests', () => {
  test.afterAll(() => {
    printAiHealingSummary();
    saveAiHealingResults('ai-e2e-healing.json');
  });

  test('full E2E flow with AI healing: login -> dashboard -> create user -> success', async ({ page }) => {
    await page.goto('/login');
    await aiFill(page, loginProfiles.usernameInput, 'admin');
    await aiFill(page, loginProfiles.passwordInput, 'admin123');
    await aiClick(page, loginProfiles.loginButton);
    await expect(page).toHaveURL(/.*dashboard/);

    const title = await aiFindElement(page, dashboardProfiles.pageTitle);
    await expect(title).toBeVisible();

    const table = await aiFindElement(page, dashboardProfiles.userTable);
    await expect(table).toBeVisible();

    await aiClick(page, dashboardProfiles.navProfile);
    await expect(page).toHaveURL(/.*profile/);

    await aiFill(page, profileProfiles.firstName, 'Jane');
    await aiFill(page, profileProfiles.lastName, 'Smith');
    await aiFill(page, profileProfiles.userEmail, 'jane@example.com');
    await aiSelect(page, profileProfiles.userRole, 'admin');
    await aiClick(page, profileProfiles.saveButton);

    const success = await aiFindElement(page, profileProfiles.successMessage);
    await expect(success).toBeVisible();
    await expect(success).toContainText('successfully');
  });

  test('should logout successfully (AI healing)', async ({ page }) => {
    await page.goto('/login');
    await aiFill(page, loginProfiles.usernameInput, 'admin');
    await aiFill(page, loginProfiles.passwordInput, 'admin123');
    await aiClick(page, loginProfiles.loginButton);
    await expect(page).toHaveURL(/.*dashboard/);

    await aiClick(page, dashboardProfiles.logoutButton);
    await expect(page).toHaveURL(/.*login/);
  });
});
