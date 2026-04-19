import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'profiles');
const BASE_URL = 'http://localhost:3001';

/**
 * Auto-generate element profiles by crawling the running application.
 *
 * Navigates through all pages, extracts interactive elements,
 * and generates profile objects with full fingerprints.
 * Output is written to profiles/generated.profiles.js.
 *
 * Prerequisites: main-app must be running (npm run dev:v1)
 *
 * Usage: node generators/profileGenerator.js
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const PAGE_CONFIGS = [
  {
    name: 'login',
    url: '/login',
    preActions: [],
  },
  {
    name: 'dashboard',
    url: '/dashboard',
    preActions: [
      { type: 'login', username: 'admin', password: 'admin123' },
    ],
  },
  {
    name: 'profile',
    url: '/profile',
    preActions: [
      { type: 'login', username: 'admin', password: 'admin123' },
    ],
  },
];

/**
 * Extract all interactive elements and their features from a page.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function extractElements(page) {
  return page.evaluate(() => {
    const TAGS = 'input, select, textarea, button, a, h1, h2, h3, h4, table, form';

    const IMPLICIT_ROLES = {
      a: 'link', button: 'button', select: 'combobox', textarea: 'textbox',
      table: 'table', nav: 'navigation', h1: 'heading', h2: 'heading',
      h3: 'heading', h4: 'heading', form: 'form',
    };
    const INPUT_TYPE_ROLES = {
      text: 'textbox', email: 'textbox', search: 'searchbox',
      tel: 'textbox', url: 'textbox', number: 'spinbutton',
      checkbox: 'checkbox', radio: 'radio', submit: 'button',
    };

    function getImplicitRole(el) {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') return INPUT_TYPE_ROLES[el.type] || 'textbox';
      return IMPLICIT_ROLES[tag] || null;
    }

    function getActionType(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return 'fill';
      if (tag === 'select') return 'select';
      if (tag === 'button' || tag === 'a') return 'click';
      return 'verify';
    }

    function getVisibleText(el) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return '';
      return (el.textContent || '').trim().substring(0, 200);
    }

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

    function getNearbyText(el) {
      const texts = [];
      const parent = el.closest('form, nav, .login-card, .profile-card, .dashboard-container, .stats-grid, .data-table-container');
      if (parent) {
        const labels = parent.querySelectorAll('label, h1, h2, h3, h4, .stat-label, th, button, a, option');
        labels.forEach((l) => {
          const t = (l.textContent || '').trim();
          if (t && t.length < 60) texts.push(t);
        });
      }
      return [...new Set(texts)].slice(0, 10);
    }

    function getParentContext(el) {
      const p = el.parentElement;
      if (!p) return '';
      const cls = p.className ? `.${p.className.split(' ')[0]}` : '';
      return `${p.tagName.toLowerCase()}${cls}`;
    }

    function getAttributes(el) {
      const attrs = {};
      for (const attr of el.attributes) {
        if (['style', 'class', 'value'].includes(attr.name)) continue;
        attrs[attr.name] = attr.value;
      }
      return attrs;
    }

    function buildSelector(el) {
      if (el.id) return `#${el.id}`;
      const testId = el.getAttribute('data-testid');
      if (testId) return `[data-testid="${testId}"]`;
      const tag = el.tagName.toLowerCase();
      const name = el.getAttribute('name');
      if (name) return `${tag}[name="${name}"]`;
      return tag;
    }

    function buildLogicalName(el) {
      if (el.id) return el.id.replace(/[-_]/g, '');
      const testId = el.getAttribute('data-testid');
      if (testId) return testId.replace(/[-_]/g, '');
      const label = getLabel(el);
      if (label) return label.toLowerCase().replace(/\s+/g, '');
      return el.tagName.toLowerCase();
    }

    const elements = document.querySelectorAll(TAGS);
    const results = [];

    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (getComputedStyle(el).display === 'none') return;

      results.push({
        logicalName: buildLogicalName(el),
        actionType: getActionType(el),
        selector: buildSelector(el),
        tag: el.tagName.toLowerCase(),
        role: getImplicitRole(el),
        type: el.type || null,
        text: getVisibleText(el),
        label: getLabel(el),
        placeholder: el.placeholder || '',
        attributes: getAttributes(el),
        parentContext: getParentContext(el),
        nearbyText: getNearbyText(el),
      });
    });

    return results;
  });
}

/**
 * Perform pre-login action before accessing protected pages.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function performLogin(page, username, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#login-btn');
  await page.waitForURL(/.*dashboard/);
}

/**
 * Generate a profiles JS file from extracted elements.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function generateProfileFile(pageName, elements) {
  const varName = `${pageName}Profiles`;
  const entries = elements.map((el) => {
    const key = el.logicalName;
    return `  ${key}: ${JSON.stringify({ ...el, page: pageName }, null, 4).replace(/\n/g, '\n  ')}`;
  });

  return `/**
 * Auto-generated element profiles for ${pageName} page.
 * Generated by profileGenerator.js at ${new Date().toISOString()}
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export const ${varName} = {
${entries.join(',\n\n')}
};
`;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  🤖 AUTO-GENERATE ELEMENT PROFILES FROM DOM        ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(`  🌐 Base URL: ${BASE_URL}`);
  console.log(`  📂 Output: ${OUTPUT_DIR}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    for (const config of PAGE_CONFIGS) {
      console.log(`  📄 Crawling page: ${config.name} (${config.url})`);
      const page = await context.newPage();

      for (const action of config.preActions) {
        if (action.type === 'login') {
          await performLogin(page, action.username, action.password);
        }
      }

      await page.goto(`${BASE_URL}${config.url}`);
      await page.waitForLoadState('networkidle');

      const elements = await extractElements(page);
      console.log(`    Found ${elements.length} interactive elements`);

      const content = generateProfileFile(config.name, elements);
      const outputPath = path.join(OUTPUT_DIR, `generated.${config.name}.profiles.js`);

      if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(outputPath, content, 'utf-8');
      console.log(`    ✅ Saved to ${path.basename(outputPath)}`);

      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  ✅ Profile generation complete!                    ║');
  console.log('║  💡 Review generated files and merge into           ║');
  console.log('║     your existing profiles as needed.               ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
}

main().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
