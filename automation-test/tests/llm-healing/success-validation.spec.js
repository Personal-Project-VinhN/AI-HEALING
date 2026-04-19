import { test, expect } from '@playwright/test';
import { llmFindElement, llmFill, llmClick, llmSelect, printLlmHealingSummary, saveLlmHealingResults } from '../../utils/llmHealing.js';
import { loginProfiles } from '../../profiles/login.profiles.js';
import { dashboardProfiles, profileProfiles } from '../../profiles/dashboard.profiles.js';

/**
 * LLM-powered end-to-end validation: login -> dashboard -> form -> success.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('LLM-Healing E2E Success Validation', () => {
  test.afterAll(() => {
    printLlmHealingSummary();
    saveLlmHealingResults('llm-e2e-healing.json');
  });

  test('full flow: login -> dashboard -> form -> success (LLM healing)', async ({ page }) => {
    await page.goto('/login');
    await llmFill(page, loginProfiles.usernameInput, 'admin');
    await llmFill(page, loginProfiles.passwordInput, 'admin123');
    await llmClick(page, loginProfiles.loginButton);
    await expect(page).toHaveURL(/.*dashboard/);

    const title = await llmFindElement(page, dashboardProfiles.pageTitle);
    await expect(title).toBeVisible();

    const table = await llmFindElement(page, dashboardProfiles.userTable);
    await expect(table).toBeVisible();

    await llmClick(page, dashboardProfiles.navProfile);
    await expect(page).toHaveURL(/.*profile/);

    await llmFill(page, profileProfiles.firstName, 'Alice');
    await llmFill(page, profileProfiles.lastName, 'Smith');
    await llmFill(page, profileProfiles.userEmail, 'alice@demo.com');
    await llmSelect(page, profileProfiles.userRole, 'editor');
    await llmClick(page, profileProfiles.saveButton);

    const success = await llmFindElement(page, profileProfiles.successMessage);
    await expect(success).toBeVisible();
    await expect(success).toContainText('successfully');
  });
});
