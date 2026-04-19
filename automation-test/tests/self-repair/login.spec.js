import { test, expect } from '@playwright/test';
import { selfHealingLoop, runWithHealing } from '../../utils/selfHealingLoop.js';
import { generateReport, generateSummaryReport } from '../../utils/reportGenerator.js';
import { loginProfiles } from '../../profiles/login.profiles.js';
import { enrichProfiles } from '../../profiles/elementProfile.js';

/**
 * Gen 4: Self-Repair Login Tests.
 *
 * These tests use the full AI-driven self-healing + self-repair loop:
 * 1. Run test step
 * 2. If locator fails -> detect failure
 * 3. Collect full context (screenshot, DOM, code, profile)
 * 4. Build structured prompt
 * 5. Send to LLM (the actual AI, via Cursor as tool)
 * 6. AI suggests new locator or code patch
 * 7. Apply fix to source code
 * 8. Rerun test
 * 9. Repeat up to 3 times
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const profiles = enrichProfiles(loginProfiles);
const allResults = [];

test.describe('Gen 4: Self-Repair Login Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test.afterAll(() => {
    if (allResults.length > 0) {
      generateSummaryReport(allResults);
    }
  });

  test('should display login form (self-repair)', async ({ page }) => {
    const result = await runWithHealing(page, 'login-form-display', [
      {
        description: 'Verify login form is visible',
        profile: profiles.loginForm,
        fn: async () => {
          const form = page.locator(profiles.loginForm.selector);
          await form.waitFor({ state: 'visible', timeout: 5000 });
          await expect(form).toBeVisible();
        },
      },
      {
        description: 'Verify username input is visible',
        profile: profiles.usernameInput,
        fn: async () => {
          const input = page.locator(profiles.usernameInput.selector);
          await input.waitFor({ state: 'visible', timeout: 5000 });
          await expect(input).toBeVisible();
        },
      },
      {
        description: 'Verify password input is visible',
        profile: profiles.passwordInput,
        fn: async () => {
          const input = page.locator(profiles.passwordInput.selector);
          await input.waitFor({ state: 'visible', timeout: 5000 });
          await expect(input).toBeVisible();
        },
      },
      {
        description: 'Verify login button is visible',
        profile: profiles.loginButton,
        fn: async () => {
          const btn = page.locator(profiles.loginButton.selector);
          await btn.waitFor({ state: 'visible', timeout: 5000 });
          await expect(btn).toBeVisible();
        },
      },
    ]);

    allResults.push(result);
    generateReport(result);
    expect(result.success).toBeTruthy();
  });

  test('should show error on empty submit (self-repair)', async ({ page }) => {
    const result = await runWithHealing(page, 'login-empty-submit', [
      {
        description: 'Click login button without filling fields',
        profile: profiles.loginButton,
        fn: async () => {
          const btn = page.locator(profiles.loginButton.selector);
          await btn.waitFor({ state: 'visible', timeout: 5000 });
          await btn.click();
        },
      },
      {
        description: 'Verify error message appears',
        profile: profiles.errorMessage,
        fn: async () => {
          const error = page.locator(profiles.errorMessage.selector);
          await error.waitFor({ state: 'visible', timeout: 5000 });
          await expect(error).toBeVisible();
          await expect(error).toContainText('fill in all fields');
        },
      },
    ]);

    allResults.push(result);
    generateReport(result);
    expect(result.success).toBeTruthy();
  });

  test('should login successfully (self-repair)', async ({ page }) => {
    const result = await runWithHealing(page, 'login-success', [
      {
        description: 'Fill username field',
        profile: profiles.usernameInput,
        fn: async () => {
          const input = page.locator(profiles.usernameInput.selector);
          await input.waitFor({ state: 'visible', timeout: 5000 });
          await input.fill('admin');
        },
      },
      {
        description: 'Fill password field',
        profile: profiles.passwordInput,
        fn: async () => {
          const input = page.locator(profiles.passwordInput.selector);
          await input.waitFor({ state: 'visible', timeout: 5000 });
          await input.fill('admin123');
        },
      },
      {
        description: 'Click login button',
        profile: profiles.loginButton,
        fn: async () => {
          const btn = page.locator(profiles.loginButton.selector);
          await btn.waitFor({ state: 'visible', timeout: 5000 });
          await btn.click();
        },
      },
      {
        description: 'Verify navigation to dashboard',
        fn: async () => {
          await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
        },
      },
    ]);

    allResults.push(result);
    generateReport(result);
    expect(result.success).toBeTruthy();
  });

  test('should show error on invalid credentials (self-repair)', async ({ page }) => {
    const result = await runWithHealing(page, 'login-invalid-credentials', [
      {
        description: 'Fill username with wrong value',
        profile: profiles.usernameInput,
        fn: async () => {
          const input = page.locator(profiles.usernameInput.selector);
          await input.waitFor({ state: 'visible', timeout: 5000 });
          await input.fill('wrong');
        },
      },
      {
        description: 'Fill password with wrong value',
        profile: profiles.passwordInput,
        fn: async () => {
          const input = page.locator(profiles.passwordInput.selector);
          await input.waitFor({ state: 'visible', timeout: 5000 });
          await input.fill('wrong');
        },
      },
      {
        description: 'Click login button',
        profile: profiles.loginButton,
        fn: async () => {
          const btn = page.locator(profiles.loginButton.selector);
          await btn.waitFor({ state: 'visible', timeout: 5000 });
          await btn.click();
        },
      },
      {
        description: 'Verify invalid credentials error',
        profile: profiles.errorMessage,
        fn: async () => {
          const error = page.locator(profiles.errorMessage.selector);
          await error.waitFor({ state: 'visible', timeout: 5000 });
          await expect(error).toContainText('Invalid credentials');
        },
      },
    ]);

    allResults.push(result);
    generateReport(result);
    expect(result.success).toBeTruthy();
  });
});
