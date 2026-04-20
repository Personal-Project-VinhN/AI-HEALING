import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.join(__dirname, '..', 'healing-context', 'snapshots');

/**
 * Collect DOM snapshot from the current Playwright page.
 * Extracts all interactive elements with their attributes,
 * focusing on the elements most likely to be locator targets.
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {object} [options] - Collection options
 * @param {string} [options.failedLocator] - The locator that failed
 * @param {boolean} [options.saveScreenshot] - Whether to save a screenshot
 * @param {string} [options.testName] - Name of the failing test
 * @returns {Promise<object>} DOM snapshot with elements and metadata
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function collectDomSnapshot(page, options = {}) {
  const { failedLocator = '', saveScreenshot = true, testName = 'unknown' } = options;

  const currentUrl = page.url();

  const elements = await page.evaluate(() => {
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

    function getAttributes(el) {
      const attrs = {};
      for (const attr of el.attributes) {
        if (['style', 'class'].includes(attr.name)) continue;
        attrs[attr.name] = attr.value;
      }
      return attrs;
    }

    const collected = [];
    const allElements = document.querySelectorAll(TAGS);

    allElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (getComputedStyle(el).display === 'none') return;
      if (getComputedStyle(el).visibility === 'hidden') return;

      const tag = el.tagName.toLowerCase();
      const id = el.id || null;
      const dataTestId = el.getAttribute('data-testid') || null;
      const dataAction = el.getAttribute('data-action') || null;

      collected.push({
        tag,
        id,
        name: el.name || null,
        type: el.type || null,
        text: (tag === 'input' || tag === 'textarea' || tag === 'select')
          ? '' : (el.textContent || '').trim().substring(0, 150),
        label: getLabel(el),
        placeholder: el.placeholder || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        dataTestId,
        dataAction,
        attributes: getAttributes(el),
        selector: id ? `#${id}` : (dataTestId ? `[data-testid="${dataTestId}"]` : null),
      });
    });

    return collected;
  });

  const fullHtml = await page.evaluate(() => {
    const body = document.querySelector('body');
    if (!body) return '';
    return body.innerHTML.substring(0, 50000);
  });

  let screenshotPath = null;
  if (saveScreenshot) {
    if (!fs.existsSync(SNAPSHOT_DIR)) {
      fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    }
    const safeName = testName.replace(/[^a-zA-Z0-9-_]/g, '_');
    screenshotPath = path.join(SNAPSHOT_DIR, `${safeName}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  return {
    url: currentUrl,
    timestamp: new Date().toISOString(),
    failedLocator,
    elementsCount: elements.length,
    elements,
    bodyHtml: fullHtml,
    screenshotPath,
  };
}
