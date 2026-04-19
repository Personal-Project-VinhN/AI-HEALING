import { healingLogger } from './healingLogger.js';
import { locatorStore } from './locatorStore.js';

/**
 * Self-Healing Element Finder for Playwright.
 *
 * When a primary locator fails (element not found), this utility
 * automatically tries multiple fallback strategies:
 *
 *   1. CACHED          - Check if we already healed this locator before
 *   2. DESCRIPTION     - Use description keywords (e.g., "username/email input")
 *   3. SYNONYMS        - Map common UI synonyms (login->signin, save->submit)
 *   4. TEXT            - Find by visible text content
 *   5. LABEL           - Find by associated label text
 *   6. PLACEHOLDER     - Find by placeholder attribute
 *   7. ARIA            - Find by aria-label attribute
 *   8. NAME            - Find by name attribute (partial match)
 *   9. DATA-ACTION     - Find by data-action attribute
 *  10. DATA-TESTID     - Find by data-testid attribute
 *  11. CSS-SIMILAR     - Find by similar CSS selectors (tag + partial id)
 *  12. FORM_POSITION   - Find by input type + position within a form
 *
 * Each attempt is logged. Successful healings are cached for reuse.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const SYNONYM_MAP = {
  login: ['signin', 'sign-in', 'sign_in', 'log-in'],
  signin: ['login', 'log-in', 'sign-in'],
  logout: ['signout', 'sign-out', 'sign_out', 'log-out'],
  signout: ['logout', 'log-out'],
  username: ['email', 'user', 'login-name', 'user-id'],
  email: ['username', 'user', 'mail', 'contact-email'],
  password: ['pass', 'pass-field', 'pwd', 'secret'],
  save: ['submit', 'confirm', 'apply', 'ok'],
  submit: ['save', 'confirm', 'apply', 'ok'],
  cancel: ['discard', 'reset', 'close', 'abort'],
  discard: ['cancel', 'reset', 'close'],
  dashboard: ['home', 'main', 'overview', 'index'],
  home: ['dashboard', 'main', 'overview'],
  profile: ['account', 'user-profile', 'my-account', 'settings'],
  account: ['profile', 'user-profile', 'my-account'],
  'first-name': ['fname', 'given-name', 'first_name', 'firstname'],
  'last-name': ['lname', 'family-name', 'last_name', 'lastname', 'surname'],
  'user-email': ['contact-email', 'email-address', 'mail'],
  'user-role': ['position', 'role', 'job-title'],
  'user-table': ['members-table', 'data-table', 'people-table'],
  'nav-profile': ['nav-account', 'nav-settings'],
  'nav-dashboard': ['nav-home', 'nav-main'],
  btn: ['button', 'action'],
};

/**
 * Extract hints from the original locator string and description.
 */
function extractHints(locator, description = '') {
  const hints = { id: null, keywords: [], tag: null };

  if (locator.startsWith('#')) {
    hints.id = locator.slice(1);
    hints.keywords = [hints.id, ...hints.id.split(/[-_]/).filter(Boolean)];
  } else if (locator.startsWith('.')) {
    hints.keywords = locator.slice(1).split(/[-_.]/).filter(Boolean);
  } else if (locator.includes('[')) {
    const match = locator.match(/\[([^\]]+)\]/);
    if (match) {
      const parts = match[1].split('=');
      if (parts.length === 2) {
        hints.keywords = parts[1].replace(/['"]/g, '').split(/[-_]/).filter(Boolean);
      }
    }
  }

  if (description) {
    const descWords = description
      .toLowerCase()
      .split(/[\s/,]+/)
      .filter((w) => w.length > 2 && !['the', 'and', 'for', 'with'].includes(w));
    hints.keywords = [...new Set([...hints.keywords, ...descWords])];
  }

  return hints;
}

/**
 * Get synonyms for all keywords, including individual words
 * extracted from compound synonyms (e.g., "family-name" -> "family").
 */
function getSynonyms(keywords) {
  const synonyms = new Set();
  for (const keyword of keywords) {
    const lk = keyword.toLowerCase();
    if (SYNONYM_MAP[lk]) {
      SYNONYM_MAP[lk].forEach((s) => {
        synonyms.add(s);
        s.split(/[-_]/).filter((w) => w.length > 2).forEach((w) => synonyms.add(w));
      });
    }
    for (const [key, values] of Object.entries(SYNONYM_MAP)) {
      if (values.includes(lk)) {
        synonyms.add(key);
        values.forEach((v) => {
          synonyms.add(v);
          v.split(/[-_]/).filter((w) => w.length > 2).forEach((w) => synonyms.add(w));
        });
      }
    }
  }
  keywords.forEach((k) => synonyms.delete(k.toLowerCase()));
  return [...synonyms];
}

/**
 * Try to find an element using the primary locator.
 */
async function tryPrimary(page, locator, timeout = 3000) {
  try {
    const element = page.locator(locator);
    await element.waitFor({ state: 'visible', timeout });
    return element;
  } catch {
    return null;
  }
}

/**
 * Strategy: find from cache (previously healed locator).
 */
async function tryFromCache(page, originalLocator) {
  const cached = locatorStore.get(originalLocator);
  if (!cached) return null;

  try {
    const element = page.locator(cached.healedLocator);
    await element.waitFor({ state: 'visible', timeout: 2000 });
    console.log(`  [Self-Healing] Cache HIT: "${originalLocator}" -> "${cached.healedLocator}"`);
    return { element, strategy: 'CACHED', healedLocator: cached.healedLocator };
  } catch {
    return null;
  }
}

/**
 * Strategy: find by visible text (button, link, heading).
 */
async function tryByText(page, keywords) {
  for (const keyword of keywords) {
    try {
      const element = page.getByRole('button', { name: new RegExp(keyword, 'i') });
      if (await element.count() > 0 && await element.first().isVisible()) {
        const text = await element.first().textContent();
        return { element: element.first(), strategy: 'TEXT_BUTTON', healedLocator: `role=button[name="${text.trim()}"]` };
      }
    } catch { /* skip */ }

    try {
      const element = page.getByRole('link', { name: new RegExp(keyword, 'i') });
      if (await element.count() > 0 && await element.first().isVisible()) {
        const text = await element.first().textContent();
        return { element: element.first(), strategy: 'TEXT_LINK', healedLocator: `role=link[name="${text.trim()}"]` };
      }
    } catch { /* skip */ }
  }
  return null;
}

/**
 * Strategy: find by label text (for form inputs).
 * Sorts keywords longest-first for specificity.
 * Only accepts unique matches (count === 1) to avoid ambiguity.
 */
async function tryByLabel(page, keywords) {
  const sorted = [...keywords].sort((a, b) => b.length - a.length);

  for (const keyword of sorted) {
    try {
      const element = page.getByLabel(new RegExp(keyword, 'i'));
      const count = await element.count();
      if (count === 1 && await element.first().isVisible()) {
        return { element: element.first(), strategy: 'LABEL', healedLocator: `label~=${keyword}` };
      }
    } catch { /* skip */ }
  }

  return null;
}

/**
 * Strategy: find by placeholder attribute.
 */
async function tryByPlaceholder(page, keywords) {
  for (const keyword of keywords) {
    try {
      const element = page.getByPlaceholder(new RegExp(keyword, 'i'));
      if (await element.count() > 0 && await element.first().isVisible()) {
        return { element: element.first(), strategy: 'PLACEHOLDER', healedLocator: `placeholder~=${keyword}` };
      }
    } catch { /* skip */ }
  }
  return null;
}

/**
 * Strategy: find by aria-label attribute.
 */
async function tryByAria(page, keywords) {
  for (const keyword of keywords) {
    try {
      const element = page.locator(`[aria-label*="${keyword}" i]`);
      if (await element.count() > 0 && await element.first().isVisible()) {
        const ariaLabel = await element.first().getAttribute('aria-label');
        return { element: element.first(), strategy: 'ARIA', healedLocator: `[aria-label="${ariaLabel}"]` };
      }
    } catch { /* skip */ }
  }
  return null;
}

/**
 * Strategy: find by name attribute (partial match).
 */
async function tryByName(page, keywords) {
  for (const keyword of keywords) {
    try {
      const element = page.locator(`[name*="${keyword}" i]`);
      if (await element.count() > 0 && await element.first().isVisible()) {
        const name = await element.first().getAttribute('name');
        return { element: element.first(), strategy: 'NAME', healedLocator: `[name="${name}"]` };
      }
    } catch { /* skip */ }
  }
  return null;
}

/**
 * Strategy: find by data-action attribute.
 */
async function tryByDataAction(page, keywords) {
  for (const keyword of keywords) {
    try {
      const element = page.locator(`[data-action*="${keyword}" i]`);
      if (await element.count() > 0 && await element.first().isVisible()) {
        const action = await element.first().getAttribute('data-action');
        return { element: element.first(), strategy: 'DATA_ACTION', healedLocator: `[data-action="${action}"]` };
      }
    } catch { /* skip */ }
  }
  return null;
}

/**
 * Strategy: find by data-testid attribute.
 */
async function tryByTestId(page, keywords) {
  for (const keyword of keywords) {
    try {
      const element = page.locator(`[data-testid*="${keyword}" i]`);
      if (await element.count() > 0 && await element.first().isVisible()) {
        const testId = await element.first().getAttribute('data-testid');
        return { element: element.first(), strategy: 'DATA_TESTID', healedLocator: `[data-testid="${testId}"]` };
      }
    } catch { /* skip */ }
  }
  return null;
}

/**
 * Strategy: find similar element by tag type + partial id match.
 */
async function tryBySimilarId(page, keywords) {
  const tags = ['input', 'select', 'textarea', 'button', 'a'];

  for (const tag of tags) {
    for (const keyword of keywords) {
      try {
        const element = page.locator(`${tag}[id*="${keyword}" i]`);
        if (await element.count() > 0 && await element.first().isVisible()) {
          const id = await element.first().getAttribute('id');
          return { element: element.first(), strategy: 'CSS_SIMILAR', healedLocator: `${tag}#${id}` };
        }
      } catch { /* skip */ }
    }
  }
  return null;
}

/**
 * Strategy: find by form position (e.g., first text input = username/email).
 */
async function tryByFormPosition(page, hints) {
  const keywords = hints.keywords.map((k) => k.toLowerCase());

  const isUsernameField = keywords.some((k) =>
    ['username', 'email', 'user', 'login', 'mail'].includes(k)
  );
  const isPasswordField = keywords.some((k) =>
    ['password', 'pass', 'pwd', 'secret'].includes(k)
  );
  const isFirstNameField = keywords.some((k) =>
    ['first', 'fname', 'given'].includes(k)
  );
  const isLastNameField = keywords.some((k) =>
    ['last', 'lname', 'family', 'surname'].includes(k)
  );

  try {
    if (isPasswordField) {
      const element = page.locator('input[type="password"]').first();
      if (await element.count() > 0 && await element.isVisible()) {
        const id = await element.getAttribute('id');
        return { element, strategy: 'FORM_POSITION', healedLocator: id ? `#${id}` : 'input[type="password"]' };
      }
    }

    if (isUsernameField) {
      const form = page.locator('form');
      if (await form.count() > 0) {
        const textInput = form.first().locator('input[type="text"], input[type="email"], input:not([type])').first();
        if (await textInput.count() > 0 && await textInput.isVisible()) {
          const id = await textInput.getAttribute('id');
          return { element: textInput, strategy: 'FORM_POSITION', healedLocator: id ? `#${id}` : 'form input[type="text"]:first' };
        }
      }
    }

    if (isFirstNameField) {
      const inputs = page.locator('form input[type="text"], form input:not([type])');
      const count = await inputs.count();
      if (count >= 1) {
        const el = inputs.nth(0);
        if (await el.isVisible()) {
          const id = await el.getAttribute('id');
          return { element: el, strategy: 'FORM_POSITION', healedLocator: id ? `#${id}` : 'form input:nth(0)' };
        }
      }
    }

    if (isLastNameField) {
      const inputs = page.locator('form input[type="text"], form input:not([type])');
      const count = await inputs.count();
      if (count >= 2) {
        const el = inputs.nth(1);
        if (await el.isVisible()) {
          const id = await el.getAttribute('id');
          return { element: el, strategy: 'FORM_POSITION', healedLocator: id ? `#${id}` : 'form input:nth(1)' };
        }
      }
    }
  } catch { /* skip */ }

  return null;
}

/**
 * Main self-healing function.
 * Tries the primary locator first. If it fails, runs through
 * all fallback strategies in order until one succeeds.
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} primaryLocator - Original CSS/ID selector
 * @param {object} [options] - Additional options
 * @param {string} [options.description] - Human description of the element
 * @param {number} [options.timeout] - Timeout for primary locator (ms)
 * @returns {Promise<import('@playwright/test').Locator>} Resolved element locator
 * @throws {Error} If no strategy can find the element
 */
export async function findElementWithHealing(page, primaryLocator, options = {}) {
  const { description = '', timeout = 2000 } = options;

  // Step 1: Try primary locator
  const primary = await tryPrimary(page, primaryLocator, timeout);
  if (primary) {
    return primary;
  }

  console.log(`\n  ⚠️  [Self-Healing] Primary locator FAILED: "${primaryLocator}" ${description ? `(${description})` : ''}`);
  console.log(`  🔍 [Self-Healing] Starting healing process...`);

  const hints = extractHints(primaryLocator, description);
  const synonymKeywords = getSynonyms(hints.keywords);
  const allKeywords = [...hints.keywords, ...synonymKeywords];

  console.log(`  📋 [Self-Healing] Keywords: [${hints.keywords.join(', ')}]`);
  console.log(`  🔗 [Self-Healing] Synonyms: [${synonymKeywords.join(', ')}]`);

  // Step 2: Define healing strategies in priority order
  const strategies = [
    { name: 'CACHED', fn: () => tryFromCache(page, primaryLocator) },
    { name: 'LABEL_DESC', fn: () => tryByLabel(page, hints.keywords) },
    { name: 'LABEL_SYN', fn: () => tryByLabel(page, synonymKeywords) },
    { name: 'PLACEHOLDER', fn: () => tryByPlaceholder(page, allKeywords) },
    { name: 'ARIA', fn: () => tryByAria(page, allKeywords) },
    { name: 'NAME', fn: () => tryByName(page, allKeywords) },
    { name: 'TEXT', fn: () => tryByText(page, allKeywords) },
    { name: 'DATA_ACTION', fn: () => tryByDataAction(page, allKeywords) },
    { name: 'DATA_TESTID', fn: () => tryByTestId(page, allKeywords) },
    { name: 'CSS_SIMILAR', fn: () => tryBySimilarId(page, allKeywords) },
    { name: 'FORM_POSITION', fn: () => tryByFormPosition(page, hints) },
  ];

  // Step 3: Try each strategy
  for (const strategy of strategies) {
    try {
      const result = await strategy.fn();
      if (result) {
        healingLogger.log({
          originalLocator: primaryLocator,
          strategy: result.strategy,
          healedLocator: result.healedLocator,
          success: true,
          description,
        });

        locatorStore.set(primaryLocator, result.strategy, result.healedLocator);
        return result.element;
      }
    } catch {
      // Strategy threw, move to next
    }
  }

  // All strategies failed
  healingLogger.log({
    originalLocator: primaryLocator,
    strategy: 'ALL_FAILED',
    healedLocator: null,
    success: false,
    description,
  });

  throw new Error(
    `[Self-Healing] Could not find element with any strategy.\n` +
    `  Original locator: "${primaryLocator}"\n` +
    `  Keywords: [${hints.keywords.join(', ')}]\n` +
    `  Synonyms: [${synonymKeywords.join(', ')}]\n` +
    `  Tried ${strategies.length} strategies.`
  );
}

/**
 * Convenience wrapper: fill an input using self-healing.
 */
export async function healAndFill(page, locator, value, options = {}) {
  const element = await findElementWithHealing(page, locator, options);
  await element.fill(value);
  return element;
}

/**
 * Convenience wrapper: click an element using self-healing.
 */
export async function healAndClick(page, locator, options = {}) {
  const element = await findElementWithHealing(page, locator, options);
  await element.click();
  return element;
}

/**
 * Convenience wrapper: select option using self-healing.
 */
export async function healAndSelect(page, locator, value, options = {}) {
  const element = await findElementWithHealing(page, locator, options);
  await element.selectOption(value);
  return element;
}
