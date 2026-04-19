import { test, expect } from '@playwright/test';
import { llmFindElement, llmFill, llmClick, printLlmHealingSummary, saveLlmHealingResults } from '../../utils/llmHealing.js';
import { loginProfiles } from '../../profiles/login.profiles.js';

/**
 * LLM-powered self-healing login tests.
 * Uses semantic embedding similarity and LLM-as-judge
 * for intelligent element matching.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
test.describe('LLM-Healing Login Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test.afterAll(() => {
    printLlmHealingSummary();
    saveLlmHealingResults('llm-login-healing.json');
  });

  test('should display login form (LLM healing)', async ({ page }) => {
    const form = await llmFindElement(page, loginProfiles.loginForm);
    await expect(form).toBeVisible();

    const username = await llmFindElement(page, loginProfiles.usernameInput);
    await expect(username).toBeVisible();

    const password = await llmFindElement(page, loginProfiles.passwordInput);
    await expect(password).toBeVisible();

    const loginBtn = await llmFindElement(page, loginProfiles.loginButton);
    await expect(loginBtn).toBeVisible();
  });

  test('should show error on empty submit (LLM healing)', async ({ page }) => {
    await llmClick(page, loginProfiles.loginButton);

    const error = await llmFindElement(page, loginProfiles.errorMessage);
    await expect(error).toBeVisible();
    await expect(error).toContainText('fill in all fields');
  });

  test('should show error on invalid credentials (LLM healing)', async ({ page }) => {
    await llmFill(page, loginProfiles.usernameInput, 'wrong');
    await llmFill(page, loginProfiles.passwordInput, 'wrong');
    await llmClick(page, loginProfiles.loginButton);

    const error = await llmFindElement(page, loginProfiles.errorMessage);
    await expect(error).toContainText('Invalid credentials');
  });

  test('should login successfully (LLM healing)', async ({ page }) => {
    await llmFill(page, loginProfiles.usernameInput, 'admin');
    await llmFill(page, loginProfiles.passwordInput, 'admin123');
    await llmClick(page, loginProfiles.loginButton);

    await expect(page).toHaveURL(/.*dashboard/);
  });
});
