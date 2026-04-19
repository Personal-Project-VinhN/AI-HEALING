import { test, expect } from '@playwright/test';
import { findElementWithHealing, healAndFill, healAndClick } from '../../utils/selfHealing.js';
import { healingLogger } from '../../utils/healingLogger.js';
import { loginLocators } from '../../locators/login.locators.js';

/**
 * Self-healing login tests.
 * Uses V1 locators, but auto-heals when running against V2 UI.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('Self-Healing Login Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test.afterAll(() => {
    healingLogger.printSummary();
    healingLogger.saveResults('login-healing.json');
  });

  test('should display login form (with healing)', async ({ page }) => {
    const form = await findElementWithHealing(page, loginLocators.loginForm, {
      description: 'login form container',
    });
    await expect(form).toBeVisible();

    const username = await findElementWithHealing(page, loginLocators.usernameInput, {
      description: 'username/email input',
    });
    await expect(username).toBeVisible();

    const password = await findElementWithHealing(page, loginLocators.passwordInput, {
      description: 'password input',
    });
    await expect(password).toBeVisible();

    const loginBtn = await findElementWithHealing(page, loginLocators.loginButton, {
      description: 'login/signin button',
    });
    await expect(loginBtn).toBeVisible();
  });

  test('should show error on empty submit (with healing)', async ({ page }) => {
    await healAndClick(page, loginLocators.loginButton, {
      description: 'login/signin button',
    });

    const error = await findElementWithHealing(page, loginLocators.errorMessage, {
      description: 'error message',
    });
    await expect(error).toBeVisible();
    await expect(error).toContainText('fill in all fields');
  });

  test('should show error on invalid credentials (with healing)', async ({ page }) => {
    await healAndFill(page, loginLocators.usernameInput, 'wrong', {
      description: 'username/email input',
    });
    await healAndFill(page, loginLocators.passwordInput, 'wrong', {
      description: 'password input',
    });
    await healAndClick(page, loginLocators.loginButton, {
      description: 'login/signin button',
    });

    const error = await findElementWithHealing(page, loginLocators.errorMessage, {
      description: 'error message',
    });
    await expect(error).toContainText('Invalid credentials');
  });

  test('should login successfully (with healing)', async ({ page }) => {
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
});
