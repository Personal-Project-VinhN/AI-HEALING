import { test, expect } from '@playwright/test';
import { loginLocators } from '../../locators/login.locators.js';

/**
 * Login tests using locators from locator files.
 * These will fail when UI changes, then heal automatically.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('Traditional Login Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form', async ({ page }) => {
    await expect(page.locator(loginLocators.loginForm)).toBeVisible();
    await expect(page.locator(loginLocators.usernameInput)).toBeVisible();
    await expect(page.locator(loginLocators.passwordInput)).toBeVisible();
    await expect(page.locator(loginLocators.loginButton)).toBeVisible();
  });

  test('should show error on empty submit', async ({ page }) => {
    await page.locator(loginLocators.loginButton).click();
    await expect(page.locator(loginLocators.errorMessage)).toBeVisible();
    await expect(page.locator(loginLocators.errorMessage)).toContainText('fill in all fields');
  });

  test('should show error on invalid credentials', async ({ page }) => {
    await page.locator(loginLocators.usernameInput).fill('wrong');
    await page.locator(loginLocators.passwordInput).fill('wrong');
    await page.locator(loginLocators.loginButton).click();
    await expect(page.locator(loginLocators.errorMessage)).toContainText('Invalid credentials');
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await page.locator(loginLocators.usernameInput).fill('admin');
    await page.locator(loginLocators.passwordInput).fill('admin123');
    await page.locator(loginLocators.loginButton).click();
    await expect(page).toHaveURL(/.*dashboard/);
  });
});
