import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '..', 'profiles');
const LOCATOR_DIR = path.join(__dirname, '..', 'locators');

/**
 * Locator Generator.
 *
 * Reads element profiles (source of truth) and scans the live DOM
 * to auto-generate locator files. Each profile entry is matched
 * against real DOM elements using semantic signals (tag, type,
 * label, placeholder, attributes).
 *
 * Usage:
 *   node run-healing.js generate   (requires app server running)
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

/**
 * Load all profile modules from profiles/ directory.
 *
 * @returns {Promise<object[]>} Array of { file, exportName, key, profile }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function loadAllProfiles() {
  const files = fs.readdirSync(PROFILE_DIR).filter((f) => f.endsWith('.profiles.js'));
  const result = [];

  for (const file of files) {
    const filePath = path.join(PROFILE_DIR, file);
    const mod = await import(`file://${filePath.replace(/\\/g, '/')}?t=${Date.now()}`);

    for (const exportName of Object.keys(mod)) {
      const profileMap = mod[exportName];
      if (typeof profileMap !== 'object') continue;

      for (const [key, profile] of Object.entries(profileMap)) {
        result.push({ file, exportName, key, profile });
      }
    }
  }
  return result;
}

/**
 * Collect interactive DOM elements from a Playwright page.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<object[]>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function collectPageElements(page) {
  return page.evaluate(() => {
    const TAGS = 'input, select, textarea, button, a, h1, h2, h3, h4, form, table, nav, div[id], div[data-testid], span[id]';

    function getLabel(el) {
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return label.textContent.trim();
      }
      const parent = el.closest('.form-group');
      if (parent) {
        const label = parent.querySelector('label');
        if (label) return label.textContent.trim();
      }
      return el.getAttribute('aria-label') || '';
    }

    const collected = [];
    document.querySelectorAll(TAGS).forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (getComputedStyle(el).display === 'none') return;
      if (getComputedStyle(el).visibility === 'hidden') return;

      collected.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        name: el.name || null,
        type: el.type || null,
        text: (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
          ? '' : (el.textContent || '').trim().substring(0, 150),
        label: getLabel(el),
        placeholder: el.placeholder || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        dataTestId: el.getAttribute('data-testid') || null,
        dataAction: el.getAttribute('data-action') || null,
        href: el.getAttribute('href') || null,
        className: el.className || null,
      });
    });

    return collected;
  });
}

/**
 * Score a DOM element against a profile to determine match quality.
 *
 * @param {object} el - DOM element
 * @param {object} profile - Profile entry
 * @returns {{ score: number, selector: string|null }}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function scoreMatch(el, profile) {
  let score = 0;

  const SKIP_IDS = ['root', 'app'];
  if (el.id && SKIP_IDS.includes(el.id.toLowerCase())) return { score: -1, selector: null };

  if (profile.tag && el.tag === profile.tag) score += 10;
  else if (profile.tag && !['div', 'span'].includes(profile.tag)) return { score: -1, selector: null };

  if (profile.type && el.type === profile.type) score += 20;
  if (profile.attributes?.['data-action'] && el.dataAction === profile.attributes['data-action']) score += 40;
  if (profile.attributes?.['data-testid'] && el.dataTestId === profile.attributes['data-testid']) score += 40;

  if (profile.label && el.label) {
    if (norm(el.label) === norm(profile.label)) score += 35;
    else if (norm(el.label).includes(norm(profile.label)) || norm(profile.label).includes(norm(el.label))) score += 20;
  } else if (profile.label && el.ariaLabel) {
    if (norm(el.ariaLabel) === norm(profile.label)) score += 35;
    else if (norm(el.ariaLabel).includes(norm(profile.label))) score += 20;
  }

  if (profile.placeholder && el.placeholder) {
    if (norm(el.placeholder) === norm(profile.placeholder)) score += 25;
    else if (norm(el.placeholder).includes(norm(profile.placeholder)) || norm(profile.placeholder).includes(norm(el.placeholder))) score += 15;
  }

  if (profile.text && el.text) {
    const pText = norm(profile.text);
    const eText = norm(el.text);
    if (eText === pText) score += 25;
    else if (eText.includes(pText) && pText.length > 2) score += 15;
  }

  if (profile.attributes?.name && el.name) {
    if (norm(el.name) === norm(profile.attributes.name)) score += 30;
    else if (norm(el.name).includes(norm(profile.attributes.name)) || norm(profile.attributes.name).includes(norm(el.name))) score += 15;
  }

  if (profile.attributes?.href && el.tag === 'a' && el.href) {
    if (norm(el.href) === norm(profile.attributes.href)) score += 30;
  }

  if (profile.attributes?.class && el.className) {
    const pClasses = profile.attributes.class.split(/\s+/);
    const eClasses = (typeof el.className === 'string' ? el.className : '').split(/\s+/);
    const matched = pClasses.filter((c) => eClasses.includes(c));
    if (matched.length > 0) score += 15 * matched.length;
  }

  if (profile.role === 'button' && el.type === 'submit') score += 10;

  let selector = null;
  if (el.id) selector = `#${el.id}`;
  else if (el.dataTestId) selector = `[data-testid="${el.dataTestId}"]`;
  else if (el.name) selector = `${el.tag}[name="${el.name}"]`;

  return { score, selector };
}

function norm(str) {
  return (str || '').toLowerCase().trim();
}

/**
 * Find the best DOM element match for a profile entry.
 *
 * @param {object} profile - Profile entry
 * @param {object[]} elements - DOM elements
 * @returns {{ selector: string, score: number } | null}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
/**
 * Find the best DOM element match for a profile entry.
 * Skips selectors already claimed by a higher-scoring profile match.
 *
 * @param {object} profile - Profile entry
 * @param {object[]} elements - DOM elements
 * @param {Set<string>} [usedSelectors] - Selectors already assigned
 * @returns {{ selector: string, score: number } | null}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function findBestElement(profile, elements, usedSelectors = new Set()) {
  const MIN_SCORE = 25;
  const candidates = [];

  for (const el of elements) {
    const { score, selector } = scoreMatch(el, profile);
    if (score >= MIN_SCORE && selector) {
      candidates.push({ selector, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    if (!usedSelectors.has(c.selector)) return c;
  }

  return null;
}

/**
 * Login helper for accessing authenticated pages.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function loginIfNeeded(page) {
  try {
    const userInput = page.locator('input[type="text"], input[type="email"]').first();
    await userInput.waitFor({ state: 'visible', timeout: 3000 });
    await userInput.fill('admin');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/.*dashboard/, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate locator files by scanning the live DOM against profiles.
 *
 * Profiles are the source of truth. For each profile entry this function
 * navigates to the relevant page, collects DOM elements, and picks the
 * best matching selector. Results are written to locators/*.locators.js
 * and profile selector fields are updated to stay in sync.
 *
 * @param {object} [options]
 * @param {number} [options.port] - Dev server port (default 3001)
 * @returns {Promise<object>} { generated, skipped, locatorMap }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function generateLocators(options = {}) {
  const { port = 3001 } = options;
  const baseURL = `http://localhost:${port}`;

  console.log('\n  🔍 Loading profiles (source of truth)...');
  const allProfiles = await loadAllProfiles();
  console.log(`  📋 Found ${allProfiles.length} profile entries\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const pageElements = {};

  async function getPageElements(pageName) {
    if (pageElements[pageName]) return pageElements[pageName];

    await page.goto(`${baseURL}/login`);
    await page.waitForTimeout(500);

    if (pageName === 'login') {
      pageElements[pageName] = await collectPageElements(page);
      return pageElements[pageName];
    }

    await loginIfNeeded(page);

    if (pageName === 'profile') {
      const navLink = page.locator('a[href="/profile"]').first();
      try {
        await navLink.click();
        await page.waitForURL(/.*profile/, { timeout: 5000 });
      } catch { /* ignore */ }
    }

    pageElements[pageName] = await collectPageElements(page);
    return pageElements[pageName];
  }

  const locatorMap = {};
  const usedSelectors = new Set();
  let generated = 0;
  let skipped = 0;

  for (const { file, exportName, key, profile } of allProfiles) {
    const pageName = profile.page || 'login';
    const elements = await getPageElements(pageName);
    const match = findBestElement(profile, elements, usedSelectors);

    if (!locatorMap[exportName]) locatorMap[exportName] = {};

    if (match) {
      locatorMap[exportName][key] = match.selector;
      usedSelectors.add(match.selector);
      generated++;
      console.log(`  ✅ ${exportName}.${key} => ${match.selector} (score: ${match.score})`);
    } else {
      locatorMap[exportName][key] = profile.selector;
      skipped++;
      console.log(`  ⚠️  ${exportName}.${key} => ${profile.selector} (fallback to profile)`);
    }
  }

  await browser.close();

  writeLocatorFiles(locatorMap);
  updateProfileSelectors(allProfiles, locatorMap);

  console.log(`\n  ── GENERATE SUMMARY ──────────────────────────────`);
  console.log(`  Generated:  ${generated}`);
  console.log(`  Fallback:   ${skipped}`);
  console.log(`  ──────────────────────────────────────────────────\n`);

  return { generated, skipped, locatorMap };
}

/**
 * Write locator map to locators/*.locators.js files.
 *
 * Groups exports by their inferred file name (loginLocators -> login,
 * dashboardLocators -> dashboard, profileLocators -> dashboard).
 *
 * @param {object} locatorMap - { exportName: { key: selector } }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function writeLocatorFiles(locatorMap) {
  if (!fs.existsSync(LOCATOR_DIR)) {
    fs.mkdirSync(LOCATOR_DIR, { recursive: true });
  }

  const fileGroups = {};

  for (const [exportName, entries] of Object.entries(locatorMap)) {
    let fileName;
    if (exportName.toLowerCase().includes('login')) fileName = 'login.locators.js';
    else if (exportName.toLowerCase().includes('profile') && !exportName.toLowerCase().includes('dashboard')) fileName = 'dashboard.locators.js';
    else fileName = 'dashboard.locators.js';

    if (!fileGroups[fileName]) fileGroups[fileName] = [];
    fileGroups[fileName].push({ exportName, entries });
  }

  for (const [fileName, groups] of Object.entries(fileGroups)) {
    const lines = [
      '/**',
      ` * Auto-generated locators from DOM scan.`,
      ` * Generated: ${new Date().toISOString()}`,
      ' *',
      ' * @author Gin<gin_vn@haldata.net>',
      ' * @lastupdate Gin<gin_vn@haldata.net>',
      ' */',
    ];

    for (const { exportName, entries } of groups) {
      lines.push(`export const ${exportName} = {`);
      for (const [key, selector] of Object.entries(entries)) {
        lines.push(`  ${key}: '${selector}',`);
      }
      lines.push('};');
      lines.push('');
    }

    const filePath = path.join(LOCATOR_DIR, fileName);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    console.log(`  📝 Written: locators/${fileName}`);
  }
}

/**
 * Update selector fields in profile files to match generated locators.
 *
 * @param {object[]} allProfiles - Array of { file, exportName, key, profile }
 * @param {object} locatorMap - { exportName: { key: selector } }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function updateProfileSelectors(allProfiles, locatorMap) {
  const fileUpdates = {};

  for (const { file, exportName, key, profile } of allProfiles) {
    const locExportName = exportName.replace('Profiles', 'Locators');
    const newSelector = locatorMap[locExportName]?.[key] || locatorMap[exportName]?.[key];
    if (!newSelector || newSelector === profile.selector) continue;

    const filePath = path.join(PROFILE_DIR, file);
    if (!fileUpdates[filePath]) {
      fileUpdates[filePath] = fs.readFileSync(filePath, 'utf-8');
    }

    const escaped = profile.selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(['"])${escaped}\\1`, 'g');
    const quote = fileUpdates[filePath].includes(`'${profile.selector}'`) ? "'" : '"';
    fileUpdates[filePath] = fileUpdates[filePath].replace(regex, `${quote}${newSelector}${quote}`);

    const oldId = profile.selector.startsWith('#') ? profile.selector.slice(1) : null;
    const newId = newSelector.startsWith('#') ? newSelector.slice(1) : null;
    if (oldId && newId && oldId !== newId) {
      fileUpdates[filePath] = fileUpdates[filePath].replace(
        new RegExp(`(id:\\s*['"])${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(['"])`, 'g'),
        `$1${newId}$2`
      );
    }
  }

  for (const [filePath, content] of Object.entries(fileUpdates)) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`  📝 Updated: ${path.relative(path.join(__dirname, '..'), filePath)}`);
  }
}

/**
 * Check if locator files exist and are non-empty.
 *
 * @returns {boolean}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function hasLocatorFiles() {
  if (!fs.existsSync(LOCATOR_DIR)) return false;
  const files = fs.readdirSync(LOCATOR_DIR).filter((f) => f.endsWith('.locators.js'));
  return files.length > 0;
}
