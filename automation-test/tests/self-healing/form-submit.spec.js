import { test, expect } from '@playwright/test';
import {
  findElementWithHealing,
  healAndFill,
  healAndClick,
  healAndSelect,
} from '../../utils/selfHealing.js';
import { healingLogger } from '../../utils/healingLogger.js';
import { loginLocators } from '../../locators/login.locators.js';
import { dashboardLocators, profileLocators } from '../../locators/dashboard.locators.js';

/**
 * Self-healing form submission tests.
 * Uses V1 locators, but auto-heals when running against V2 UI.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('Self-Healing Form Submit Tests', () => {
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
    await healAndClick(page, dashboardLocators.navProfile, {
      description: 'nav profile/account link',
    });
    await expect(page).toHaveURL(/.*profile/);
  });

  test.afterAll(() => {
    healingLogger.printSummary();
    healingLogger.saveResults('form-healing.json');
  });

  test('should display create user form (with healing)', async ({ page }) => {
    const form = await findElementWithHealing(page, profileLocators.profileForm, {
      description: 'profile/user form',
    });
    await expect(form).toBeVisible();

    const firstName = await findElementWithHealing(page, profileLocators.firstName, {
      description: 'first name input',
    });
    await expect(firstName).toBeVisible();

    const saveBtn = await findElementWithHealing(page, profileLocators.saveButton, {
      description: 'save/submit button',
    });
    await expect(saveBtn).toBeVisible();

    const cancelBtn = await findElementWithHealing(page, profileLocators.cancelButton, {
      description: 'cancel/discard button',
    });
    await expect(cancelBtn).toBeVisible();
  });

  test('should submit form successfully (with healing)', async ({ page }) => {
    await healAndFill(page, profileLocators.firstName, 'John', {
      description: 'first name input',
    });
    await healAndFill(page, profileLocators.lastName, 'Doe', {
      description: 'last name input',
    });
    await healAndFill(page, profileLocators.userEmail, 'john@example.com', {
      description: 'email input',
    });
    await healAndSelect(page, profileLocators.userRole, 'editor', {
      description: 'role/position select',
    });
    await healAndClick(page, profileLocators.saveButton, {
      description: 'save/submit button',
    });

    const success = await findElementWithHealing(page, profileLocators.successMessage, {
      description: 'success message',
    });
    await expect(success).toBeVisible();
  });

  test('should clear form on cancel (with healing)', async ({ page }) => {
    await healAndFill(page, profileLocators.firstName, 'John', {
      description: 'first name input',
    });
    await healAndFill(page, profileLocators.lastName, 'Doe', {
      description: 'last name input',
    });
    await healAndClick(page, profileLocators.cancelButton, {
      description: 'cancel/discard button',
    });

    const firstName = await findElementWithHealing(page, profileLocators.firstName, {
      description: 'first name input',
    });
    await expect(firstName).toHaveValue('');
  });
});
