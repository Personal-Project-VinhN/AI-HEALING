import { test, expect } from '@playwright/test';
import { loginLocators } from '../../locators/login.locators.js';
import { dashboardLocators } from '../../locators/dashboard.locators.js';

/**
 * Traditional dashboard tests using hardcoded V1 locators.
 * PASS on UI V1, FAIL on UI V2.
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

  test('should display dashboard title', async ({ page }) => {
    await expect(page.locator(dashboardLocators.pageTitle)).toBeVisible();
    await expect(page.locator(dashboardLocators.pageTitle)).toContainText('Dashboard');
  });

  test('should display stats cards', async ({ page }) => {
    await expect(page.locator(dashboardLocators.totalUsers)).toBeVisible();
    await expect(page.locator(dashboardLocators.activeSessions)).toBeVisible();
    await expect(page.locator(dashboardLocators.reports)).toBeVisible();
  });

  test('should display user data table', async ({ page }) => {
    await expect(page.locator(dashboardLocators.userTable)).toBeVisible();
    const rows = page.locator(`${dashboardLocators.userTable} tbody tr`);
    await expect(rows).toHaveCount(5);
  });

  test('should navigate to profile page', async ({ page }) => {
    await page.locator(dashboardLocators.navProfile).click();
    await expect(page).toHaveURL(/.*profile/);
  });
});
