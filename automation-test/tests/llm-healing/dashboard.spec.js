import { test, expect } from '@playwright/test';
import { llmFindElement, llmClick, printLlmHealingSummary, saveLlmHealingResults } from '../../utils/llmHealing.js';
import { loginProfiles } from '../../profiles/login.profiles.js';
import { dashboardProfiles } from '../../profiles/dashboard.profiles.js';
import { llmFill } from '../../utils/llmHealing.js';

/**
 * LLM-powered self-healing dashboard tests.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('LLM-Healing Dashboard Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await llmFill(page, loginProfiles.usernameInput, 'admin');
    await llmFill(page, loginProfiles.passwordInput, 'admin123');
    await llmClick(page, loginProfiles.loginButton);
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test.afterAll(() => {
    printLlmHealingSummary();
    saveLlmHealingResults('llm-dashboard-healing.json');
  });

  test('should display dashboard title (LLM healing)', async ({ page }) => {
    const title = await llmFindElement(page, dashboardProfiles.pageTitle);
    await expect(title).toBeVisible();
  });

  test('should display stat cards (LLM healing)', async ({ page }) => {
    const users = await llmFindElement(page, dashboardProfiles.totalUsers);
    await expect(users).toBeVisible();

    const sessions = await llmFindElement(page, dashboardProfiles.activeSessions);
    await expect(sessions).toBeVisible();

    const reports = await llmFindElement(page, dashboardProfiles.reports);
    await expect(reports).toBeVisible();
  });

  test('should display data table (LLM healing)', async ({ page }) => {
    const table = await llmFindElement(page, dashboardProfiles.userTable);
    await expect(table).toBeVisible();
  });

  test('should navigate to profile (LLM healing)', async ({ page }) => {
    await llmClick(page, dashboardProfiles.navProfile);
    await expect(page).toHaveURL(/.*profile/);
  });

  test('should logout (LLM healing)', async ({ page }) => {
    await llmClick(page, dashboardProfiles.logoutButton);
    await expect(page).toHaveURL(/.*login/);
  });
});
