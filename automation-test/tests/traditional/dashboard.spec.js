import { test, expect } from '@playwright/test';
import { loginLocators } from '../../locators/login.locators.js';
import { dashboardLocators } from '../../locators/dashboard.locators.js';

/**
 * Dashboard tests using locators from locator files.
 * These will fail when UI changes, then heal automatically.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('Traditional Dashboard Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator(loginLocators.usernameInput).fill('admin');
    await page.locator(loginLocators.passwordInput).fill('admin123');
    await page.locator(loginLocators.loginButton).click();
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('should display dashboard title and stats', async ({ page }) => {
    await expect(page.locator(dashboardLocators.pageTitle)).toBeVisible();
    await expect(page.locator(dashboardLocators.totalUsers)).toBeVisible();
    await expect(page.locator(dashboardLocators.activeSessions)).toBeVisible();
  });
});
