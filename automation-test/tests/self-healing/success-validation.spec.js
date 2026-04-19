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
 * Self-healing end-to-end success validation tests.
 * Full flow: login -> dashboard -> form submit -> success.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('Self-Healing Success Validation Tests', () => {
  test.afterAll(() => {
    healingLogger.printSummary();
    healingLogger.saveResults('e2e-healing.json');
  });

  test('full E2E flow with healing: login -> dashboard -> create user -> success', async ({ page }) => {
    // Step 1: Login
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

    // Step 2: Verify dashboard
    const title = await findElementWithHealing(page, dashboardLocators.pageTitle, {
      description: 'dashboard/home title',
    });
    await expect(title).toBeVisible();

    const table = await findElementWithHealing(page, dashboardLocators.userTable, {
      description: 'user/members data table',
    });
    await expect(table).toBeVisible();

    // Step 3: Navigate to profile and submit form
    await healAndClick(page, dashboardLocators.navProfile, {
      description: 'nav profile/account link',
    });
    await expect(page).toHaveURL(/.*profile/);

    await healAndFill(page, profileLocators.firstName, 'Jane', {
      description: 'first name input',
    });
    await healAndFill(page, profileLocators.lastName, 'Smith', {
      description: 'last name input',
    });
    await healAndFill(page, profileLocators.userEmail, 'jane@example.com', {
      description: 'email input',
    });
    await healAndSelect(page, profileLocators.userRole, 'admin', {
      description: 'role/position select',
    });
    await healAndClick(page, profileLocators.saveButton, {
      description: 'save/submit button',
    });

    // Step 4: Validate success
    const success = await findElementWithHealing(page, profileLocators.successMessage, {
      description: 'success message',
    });
    await expect(success).toBeVisible();
    await expect(success).toContainText('successfully');
  });

  test('should logout successfully (with healing)', async ({ page }) => {
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

    await healAndClick(page, dashboardLocators.logoutButton, {
      description: 'logout/signout button',
    });
    await expect(page).toHaveURL(/.*login/);
  });
});
