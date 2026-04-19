import { test, expect } from '@playwright/test';
import { findElementWithHealing, healAndFill, healAndClick } from '../../utils/selfHealing.js';
import { healingLogger } from '../../utils/healingLogger.js';
import { loginLocators } from '../../locators/login.locators.js';
import { dashboardLocators } from '../../locators/dashboard.locators.js';

/**
 * Self-healing dashboard verification tests.
 * Uses V1 locators, but auto-heals when running against V2 UI.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('Self-Healing Dashboard Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await healAndFill(page, loginLocators.usernameInput, 'admin', {
      description: 'username/email input',
    });
    await healAndFill(page, loginLocators.passwordInput, 'admin123', {
      description: 'password input',
    });
    await healAndClick(page, loginLocators.loginButton, {
      description: 'login/signin button',
    });
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test.afterAll(() => {
    healingLogger.printSummary();
    healingLogger.saveResults('dashboard-healing.json');
  });

  test('should display dashboard page title (with healing)', async ({ page }) => {
    const title = await findElementWithHealing(page, dashboardLocators.pageTitle, {
      description: 'dashboard/home title',
    });
    await expect(title).toBeVisible();
  });

  test('should display stats cards (with healing)', async ({ page }) => {
    const users = await findElementWithHealing(page, dashboardLocators.totalUsers, {
      description: 'total users stat card',
    });
    await expect(users).toBeVisible();

    const sessions = await findElementWithHealing(page, dashboardLocators.activeSessions, {
      description: 'active sessions stat card',
    });
    await expect(sessions).toBeVisible();

    const reports = await findElementWithHealing(page, dashboardLocators.reports, {
      description: 'reports/analytics stat card',
    });
    await expect(reports).toBeVisible();
  });

  test('should display data table (with healing)', async ({ page }) => {
    const table = await findElementWithHealing(page, dashboardLocators.userTable, {
      description: 'user/members data table',
    });
    await expect(table).toBeVisible();

    const rows = page.locator('[data-testid="data-table"] tbody tr');
    await expect(rows).toHaveCount(5);
  });

  test('should navigate to profile (with healing)', async ({ page }) => {
    await healAndClick(page, dashboardLocators.navProfile, {
      description: 'nav profile/account link',
    });
    await expect(page).toHaveURL(/.*profile/);
  });
});
