import { test, expect } from '@playwright/test';
import { aiFindElement, aiFill, aiClick, printAiHealingSummary, saveAiHealingResults } from '../../utils/aiHealing.js';
import { loginProfiles } from '../../profiles/login.profiles.js';
import { dashboardProfiles } from '../../profiles/dashboard.profiles.js';

/**
 * AI-driven self-healing dashboard tests.
 * Uses element profiles with weighted similarity scoring.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('AI-Healing Dashboard Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await aiFill(page, loginProfiles.usernameInput, 'admin');
    await aiFill(page, loginProfiles.passwordInput, 'admin123');
    await aiClick(page, loginProfiles.loginButton);
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test.afterAll(() => {
    printAiHealingSummary();
    saveAiHealingResults('ai-dashboard-healing.json');
  });

  test('should display dashboard title (AI healing)', async ({ page }) => {
    const title = await aiFindElement(page, dashboardProfiles.pageTitle);
    await expect(title).toBeVisible();
  });

  test('should display stats cards (AI healing)', async ({ page }) => {
    const users = await aiFindElement(page, dashboardProfiles.totalUsers);
    await expect(users).toBeVisible();

    const sessions = await aiFindElement(page, dashboardProfiles.activeSessions);
    await expect(sessions).toBeVisible();

    const reports = await aiFindElement(page, dashboardProfiles.reports);
    await expect(reports).toBeVisible();
  });

  test('should display data table (AI healing)', async ({ page }) => {
    const table = await aiFindElement(page, dashboardProfiles.userTable);
    await expect(table).toBeVisible();

    const rows = page.locator('[data-testid="data-table"] tbody tr');
    await expect(rows).toHaveCount(5);
  });

  test('should navigate to profile (AI healing)', async ({ page }) => {
    await aiClick(page, dashboardProfiles.navProfile);
    await expect(page).toHaveURL(/.*profile/);
  });
});
