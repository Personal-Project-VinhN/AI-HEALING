import { test, expect } from '@playwright/test';
import { llmFindElement, llmFill, llmClick, llmSelect, printLlmHealingSummary, saveLlmHealingResults } from '../../utils/llmHealing.js';
import { loginProfiles } from '../../profiles/login.profiles.js';
import { dashboardProfiles, profileProfiles } from '../../profiles/dashboard.profiles.js';

/**
 * LLM-powered self-healing form submission tests.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('LLM-Healing Form Submit Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await llmFill(page, loginProfiles.usernameInput, 'admin');
    await llmFill(page, loginProfiles.passwordInput, 'admin123');
    await llmClick(page, loginProfiles.loginButton);
    await expect(page).toHaveURL(/.*dashboard/);
    await llmClick(page, dashboardProfiles.navProfile);
    await expect(page).toHaveURL(/.*profile/);
  });

  test.afterAll(() => {
    printLlmHealingSummary();
    saveLlmHealingResults('llm-form-healing.json');
  });

  test('should display profile form (LLM healing)', async ({ page }) => {
    const form = await llmFindElement(page, profileProfiles.profileForm);
    await expect(form).toBeVisible();
  });

  test('should fill and submit form (LLM healing)', async ({ page }) => {
    await llmFill(page, profileProfiles.firstName, 'John');
    await llmFill(page, profileProfiles.lastName, 'Doe');
    await llmFill(page, profileProfiles.userEmail, 'john@test.com');
    await llmSelect(page, profileProfiles.userRole, 'admin');
    await llmClick(page, profileProfiles.saveButton);

    const success = await llmFindElement(page, profileProfiles.successMessage);
    await expect(success).toBeVisible();
    await expect(success).toContainText('successfully');
  });

  test('should cancel form (LLM healing)', async ({ page }) => {
    await llmFill(page, profileProfiles.firstName, 'Test');
    await llmClick(page, profileProfiles.cancelButton);

    const firstNameEl = await llmFindElement(page, profileProfiles.firstName);
    await expect(firstNameEl).toHaveValue('');
  });
});
