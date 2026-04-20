import { test, expect } from '@playwright/test';
import { loginLocators } from '../../locators/login.locators.js';
import { profileLocators, dashboardLocators } from '../../locators/dashboard.locators.js';

/**
 * Form submission tests using locators from locator files.
 * These will fail when UI changes, then heal automatically.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('Traditional Form Submit Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator(loginLocators.usernameInput).fill('admin');
    await page.locator(loginLocators.passwordInput).fill('admin123');
    await page.locator(loginLocators.loginButton).click();
    await expect(page).toHaveURL(/.*dashboard/);
    await page.locator(dashboardLocators.navProfile).click();
    await expect(page).toHaveURL(/.*profile/);
  });

  test('should display create user form', async ({ page }) => {
    await expect(page.locator(profileLocators.profileForm)).toBeVisible();
    await expect(page.locator(profileLocators.firstName)).toBeVisible();
    await expect(page.locator(profileLocators.lastName)).toBeVisible();
    await expect(page.locator(profileLocators.userEmail)).toBeVisible();
    await expect(page.locator(profileLocators.saveButton)).toBeVisible();
    await expect(page.locator(profileLocators.cancelButton)).toBeVisible();
  });

  test('should submit form successfully', async ({ page }) => {
    await page.locator(profileLocators.firstName).fill('John');
    await page.locator(profileLocators.lastName).fill('Doe');
    await page.locator(profileLocators.userEmail).fill('john@example.com');
    await page.locator(profileLocators.userRole).selectOption('editor');
    await page.locator(profileLocators.saveButton).click();
    await expect(page.locator(profileLocators.successMessage)).toBeVisible();
  });

  test('should clear form on cancel', async ({ page }) => {
    await page.locator(profileLocators.firstName).fill('John');
    await page.locator(profileLocators.lastName).fill('Doe');
    await page.locator(profileLocators.cancelButton).click();
    await expect(page.locator(profileLocators.firstName)).toHaveValue('');
    await expect(page.locator(profileLocators.lastName)).toHaveValue('');
  });
});
