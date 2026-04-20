import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';
import { collectDomSnapshot } from './domCollector.js';
import { buildHealingContext, saveHealingContext } from './contextBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTEXT_DIR = path.join(__dirname, '..', 'healing-context');

/**
 * Cursor Self-Healing Orchestrator.
 *
 * Reads the failure summary from the Healing Reporter,
 * launches a browser to collect DOM snapshots for each
 * failing locator, builds full healing context files,
 * and prints instructions for Cursor Agent to fix them.
 *
 * Flow:
 * 1. Read _failure-summary.json (written by HealingReporter)
 * 2. For each locator failure:
 *    a. Navigate to the failing page
 *    b. Collect DOM snapshot
 *    c. Build context with profile + locator source info
 *    d. Save context JSON
 * 3. Print summary + instructions for Cursor Agent
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

/**
 * Infer which page URL to navigate to based on test file name and test name.
 *
 * @param {object} failure - Failure object from the reporter
 * @returns {string} The URL path to navigate to
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function inferPageUrl(failure) {
  const testFile = (failure.testFile || '').toLowerCase();
  const testName = (failure.testName || '').toLowerCase();

  if (testFile.includes('login') || testName.includes('login')) return '/login';
  if (testFile.includes('dashboard') || testName.includes('dashboard')) return '/dashboard';
  if (testFile.includes('form') || testFile.includes('profile') || testName.includes('profile')) return '/profile';
  if (testFile.includes('success') || testName.includes('e2e')) return '/login';

  return '/login';
}

/**
 * Login helper for pages that require authentication.
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @returns {Promise<boolean>} Whether login succeeded
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function loginIfNeeded(page) {
  try {
    const userInput = page.locator('#username, #email, input[type="text"]').first();
    await userInput.waitFor({ state: 'visible', timeout: 3000 });
    await userInput.fill('admin');
    await page.locator('input[type="password"]').fill('admin123');
    const loginBtn = page.locator('#login-btn, #signin-btn, button[type="submit"]').first();
    await loginBtn.click();
    await page.waitForURL(/.*dashboard/, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Load all locator selectors from locator files, and load matching profiles
 * to detect stable selectors that don't need healing.
 *
 * @returns {Promise<object[]>} Array of { selector, locatorFile, exportName, key, page, profileSelector }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function loadAllLocators() {
  const locatorDir = path.join(__dirname, '..', 'locators');
  const profileDir = path.join(__dirname, '..', 'profiles');
  const files = fs.readdirSync(locatorDir).filter((f) => f.endsWith('.locators.js'));

  const profileMap = {};
  if (fs.existsSync(profileDir)) {
    const profileFiles = fs.readdirSync(profileDir).filter((f) => f.endsWith('.profiles.js'));
    for (const pf of profileFiles) {
      const pfPath = path.join(profileDir, pf);
      const mod = await import(`file://${pfPath.replace(/\\/g, '/')}?t=${Date.now()}`);
      for (const exportName of Object.keys(mod)) {
        const profileObj = mod[exportName];
        if (typeof profileObj !== 'object') continue;
        for (const [key, profile] of Object.entries(profileObj)) {
          profileMap[key] = profile;
        }
      }
    }
  }

  const result = [];
  for (const file of files) {
    const filePath = path.join(locatorDir, file);
    const mod = await import(`file://${filePath.replace(/\\/g, '/')}?t=${Date.now()}`);
    for (const exportName of Object.keys(mod)) {
      const locatorMap = mod[exportName];
      if (typeof locatorMap !== 'object') continue;

      const pageName = file.includes('login') ? 'login'
        : file.includes('dashboard') ? 'dashboard' : 'unknown';

      for (const [key, selector] of Object.entries(locatorMap)) {
        const profile = profileMap[key];
        result.push({
          selector,
          locatorFile: file,
          exportName,
          key,
          page: pageName,
          profileSelector: profile?.selector || null,
        });
      }
    }
  }
  return result;
}

/**
 * Run the full context collection flow.
 * Navigates to each page and checks ALL locators from locator files,
 * not just the ones reported as failed (since cascade failures
 * hide the full picture).
 *
 * @param {object} [options]
 * @param {number} [options.port] - Dev server port (default 3001)
 * @returns {Promise<object>} Results summary
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function collectAllContexts(options = {}) {
  const { port = 3001 } = options;
  const baseURL = `http://localhost:${port}`;

  const allLocators = await loadAllLocators();
  console.log(`\n  🔍 Loaded ${allLocators.length} locators from source files. Checking each on live DOM...\n`);

  const browser = await chromium.launch({ headless: true });
  const pageContext = await browser.newContext();
  const page = await pageContext.newPage();

  const brokenLocators = [];

  /**
   * Check if a locator exists on page.
   * For data-testid selectors that match profile (stable), skip check entirely.
   * For conditionally rendered elements, also check HTML source.
   */
  async function checkLocator(loc) {
    const found = await page.locator(loc.selector).count();
    if (found > 0) return true;

    if (loc.selector.includes('data-testid')) {
      if (loc.profileSelector && loc.selector === loc.profileSelector) return true;

      const html = await page.content();
      const testIdMatch = loc.selector.match(/data-testid="([^"]+)"/);
      if (testIdMatch && html.includes(`data-testid="${testIdMatch[1]}"`)) return true;
    }

    return false;
  }

  await page.goto(`${baseURL}/login`);
  await page.waitForTimeout(500);

  const loginLocators = allLocators.filter((l) => l.page === 'login');
  for (const loc of loginLocators) {
    if (await checkLocator(loc)) {
      console.log(`  ✅ OK:     ${loc.selector}`);
    } else {
      brokenLocators.push(loc);
      console.log(`  ❌ BROKEN: ${loc.selector} (${loc.exportName}.${loc.key})`);
    }
  }

  const loggedIn = await loginIfNeeded(page);
  if (loggedIn) {
    const dashLocators = allLocators.filter((l) =>
      l.page === 'dashboard' && l.exportName === 'dashboardLocators'
    );
    for (const loc of dashLocators) {
      if (await checkLocator(loc)) {
        console.log(`  ✅ OK:     ${loc.selector}`);
      } else {
        brokenLocators.push(loc);
        console.log(`  ❌ BROKEN: ${loc.selector} (${loc.exportName}.${loc.key})`);
      }
    }

    const profileLink = page.locator('#nav-profile, #nav-account, a[href="/profile"]').first();
    try {
      await profileLink.click();
      await page.waitForURL(/.*profile/, { timeout: 5000 });
    } catch { /* ignore */ }

    const profileLocators = allLocators.filter((l) =>
      l.exportName === 'profileLocators'
    );
    for (const loc of profileLocators) {
      if (await checkLocator(loc)) {
        console.log(`  ✅ OK:     ${loc.selector}`);
      } else {
        brokenLocators.push(loc);
        console.log(`  ❌ BROKEN: ${loc.selector} (${loc.exportName}.${loc.key})`);
      }
    }
  }

  if (brokenLocators.length === 0) {
    console.log('\n  ✅ All locators are valid. Nothing to heal.');
    await browser.close();
    return { success: true, healed: 0 };
  }

  console.log(`\n  🔧 Found ${brokenLocators.length} broken locator(s). Collecting DOM context...\n`);

  const contextFiles = [];
  const pages = { login: '/login', dashboard: '/dashboard', profile: '/profile' };

  for (const pageName of Object.keys(pages)) {
    const pageLocators = brokenLocators.filter((l) => {
      if (l.exportName === 'profileLocators') return pageName === 'profile';
      return l.page === pageName;
    });
    if (pageLocators.length === 0) continue;

    await page.goto(`${baseURL}/login`);
    if (pageName !== 'login') {
      await loginIfNeeded(page);
      if (pageName === 'profile') {
        const navProfile = page.locator('#nav-profile, #nav-account, a[href="/profile"]').first();
        try {
          await navProfile.click();
          await page.waitForURL(/.*profile/, { timeout: 5000 });
        } catch { /* ignore */ }
      }
    }

    const domSnapshot = await collectDomSnapshot(page, {
      failedLocator: pageLocators.map((l) => l.selector).join(', '),
      saveScreenshot: true,
      testName: `${pageName}-page`,
    });

    for (const loc of pageLocators) {
      const context = await buildHealingContext({
        testName: `${loc.exportName}.${loc.key}`,
        testFile: `locators/${loc.locatorFile}`,
        errorMessage: `Locator "${loc.selector}" not found on current UI (page: ${pageName})`,
        domSnapshot: { ...domSnapshot, failedLocator: loc.selector },
      });

      const contextPath = saveHealingContext(context, `${loc.exportName}-${loc.key}`);
      contextFiles.push({ testName: `${loc.exportName}.${loc.key}`, contextPath, context });
      console.log(`  💾 Context saved: ${path.basename(contextPath)}`);
    }
  }

  await browser.close();

  console.log(`\n  📋 ${contextFiles.length} context file(s) ready for Cursor Agent healing.`);

  return { success: true, healed: contextFiles.length, contextFiles };
}

/**
 * Print formatted instructions for the user to invoke Cursor Agent.
 *
 * @param {object[]} contextFiles - Array of { testName, contextPath, context }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function printCursorInstructions(contextFiles) {
  console.log('\n');
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║          CURSOR AGENT - HEALING INSTRUCTIONS                 ║');
  console.log('  ╠══════════════════════════════════════════════════════════════╣');
  console.log('  ║                                                              ║');
  console.log('  ║  Context files have been generated. Now ask Cursor Agent     ║');
  console.log('  ║  to analyze them and fix the locators.                       ║');
  console.log('  ║                                                              ║');
  console.log('  ║  STEP 1: Copy the prompt below into Cursor Agent chat       ║');
  console.log('  ║  STEP 2: Let Cursor Agent fix the locator files             ║');
  console.log('  ║  STEP 3: Run "npm run test" to verify fixes                  ║');
  console.log('  ║                                                              ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');

  console.log('\n  ─── PROMPT FOR CURSOR AGENT ───────────────────────────────\n');
  console.log('  Paste this into Cursor Agent chat:\n');

  const contextFileList = contextFiles.map((cf) => `  @${cf.contextPath}`).join('\n');
  const locatorFiles = [
    '  @automation-test/locators/login.locators.js',
    '  @automation-test/locators/dashboard.locators.js',
  ].join('\n');

  console.log('  ┌──────────────────────────────────────────────────────────┐');
  console.log('  │                                                          │');
  console.log('  │  Read the healing context files below. Each file         │');
  console.log('  │  contains a failed locator and the current DOM.          │');
  console.log('  │  Compare the failed locator with domElements to find     │');
  console.log('  │  the correct new selector. Then update the locator       │');
  console.log('  │  files and profile files accordingly.                    │');
  console.log('  │                                                          │');
  console.log('  │  Context files:                                          │');
  for (const cf of contextFiles) {
    const shortPath = path.relative(path.join(__dirname, '..', '..'), cf.contextPath);
    console.log(`  │    ${shortPath.padEnd(52)}│`);
  }
  console.log('  │                                                          │');
  console.log('  │  Locator files to update:                                │');
  console.log('  │    automation-test/locators/login.locators.js            │');
  console.log('  │    automation-test/locators/dashboard.locators.js        │');
  console.log('  │                                                          │');
  console.log('  │  Profile files to update:                                │');
  console.log('  │    automation-test/profiles/login.profiles.js            │');
  console.log('  │    automation-test/profiles/dashboard.profiles.js        │');
  console.log('  │                                                          │');
  console.log('  └──────────────────────────────────────────────────────────┘');

  console.log('\n  ─── FAILURE DETAILS ───────────────────────────────────────\n');
  for (const cf of contextFiles) {
    const c = cf.context;
    console.log(`  Test: "${cf.testName}"`);
    console.log(`    Failed locator:  ${c.failedLocator}`);
    console.log(`    Page URL:        ${c.currentUrl}`);
    if (c.locatorSource) {
      console.log(`    Source file:     ${c.locatorSource.file}`);
      console.log(`    Source key:      ${c.locatorSource.exportName}.${c.locatorSource.key}`);
    }
    if (c.profile) {
      console.log(`    Profile:         ${c.profile._exportName}.${c.profile._profileKey} (${c.profile._profileFile})`);
    }
    const candidates = c.domElements.relevant.slice(0, 3);
    if (candidates.length > 0) {
      console.log(`    DOM candidates:`);
      for (const el of candidates) {
        const sel = el.selector || `<${el.tag}>`;
        console.log(`      - ${sel} (label: "${el.label || ''}", placeholder: "${el.placeholder || ''}")`);
      }
    }
    console.log('');
  }
}
