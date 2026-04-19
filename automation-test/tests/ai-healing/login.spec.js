import { test, expect } from '@playwright/test';
import { aiFindElement, aiFill, aiClick, printAiHealingSummary, saveAiHealingResults } from '../../utils/aiHealing.js';
import { loginProfiles } from '../../profiles/login.profiles.js';

/**
 * AI-driven self-healing login tests.
 * Uses element profiles with weighted similarity scoring
 * instead of rule-based fallback strategies.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('AI-Healing Login Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test.afterAll(() => {
    printAiHealingSummary();
    saveAiHealingResults('ai-login-healing.json');
  });

  test('should display login form (AI healing)', async ({ page }) => {
    const form = await aiFindElement(page, loginProfiles.loginForm);
    await expect(form).toBeVisible();

    const username = await aiFindElement(page, loginProfiles.usernameInput);
    await expect(username).toBeVisible();

    const password = await aiFindElement(page, loginProfiles.passwordInput);
    await expect(password).toBeVisible();

    const loginBtn = await aiFindElement(page, loginProfiles.loginButton);
    await expect(loginBtn).toBeVisible();
  });

  test('should show error on empty submit (AI healing)', async ({ page }) => {
    await aiClick(page, loginProfiles.loginButton);

    const error = await aiFindElement(page, loginProfiles.errorMessage);
    await expect(error).toBeVisible();
    await expect(error).toContainText('fill in all fields');
  });

  test('should show error on invalid credentials (AI healing)', async ({ page }) => {
    await aiFill(page, loginProfiles.usernameInput, 'wrong');
    await aiFill(page, loginProfiles.passwordInput, 'wrong');
    await aiClick(page, loginProfiles.loginButton);

    const error = await aiFindElement(page, loginProfiles.errorMessage);
    await expect(error).toContainText('Invalid credentials');
  });

  test('should login successfully (AI healing)', async ({ page }) => {
    await aiFill(page, loginProfiles.usernameInput, 'admin');
    await aiFill(page, loginProfiles.passwordInput, 'admin123');
    await aiClick(page, loginProfiles.loginButton);

    await expect(page).toHaveURL(/.*dashboard/);
  });
});
