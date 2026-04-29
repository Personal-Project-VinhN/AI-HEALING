import { test, expect } from '@playwright/test';
import { loginLocators } from '../../locators/login.locators.js';
import { dashboardLocators, profileLocators } from '../../locators/dashboard.locators.js';

/**
 * Success validation tests - end-to-end flow.
 * Validates: login -> dashboard -> form -> success.
 * These will fail when UI changes, then heal automatically.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('Traditional Success Validation Tests', () => {
  test('full E2E flow: login -> dashboard -> create user -> success', async ({ page }) => {
    await page.goto('/login');
    await page.locator(loginLocators.usernameInput).fill('admin');
    await page.locator(loginLocators.passwordInput).fill('admin123');
    await page.locator(loginLocators.loginButton).click();
    await expect(page).toHaveURL(/.*dashboard/);

    await expect(page.locator(dashboardLocators.pageTitle)).toBeVisible();
    await expect(page.locator(dashboardLocators.userTable)).toBeVisible();

    await page.locator(dashboardLocators.navProfile).click();
    await expect(page).toHaveURL(/.*profile/);

    await page.locator(profileLocators.firstName).fill('Jane');
    await page.locator(profileLocators.lastName).fill('Smith');
    await page.locator(profileLocators.userEmail).fill('jane@example.com');
    await page.locator(profileLocators.userRole).selectOption('admin');
    await page.locator(profileLocators.saveButton).click();

    await expect(page.locator(profileLocators.successMessage)).toBeVisible();
    await expect(page.locator(profileLocators.successMessage)).toContainText('successfully');
  });

  test('should logout successfully', async ({ page }) => {
    await page.goto('/login');
    await page.locator(loginLocators.usernameInput).fill('admin');
    await page.locator(loginLocators.passwordInput).fill('admin123');
    await page.locator(loginLocators.loginButton).click();
    await expect(page).toHaveURL(/.*dashboard/);

    await page.locator(dashboardLocators.logoutButton).click();
    await expect(page).toHaveURL(/.*login/);
  });
});
