import {
  fuzzySimilarity,
  attributeSimilarity,
  nearbyTextSimilarity,
} from './similarity.js';
import { locatorStore } from './locatorStore.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '..', 'healed-locators');

/**
 * AI-Driven Self-Healing Engine for Playwright.
 *
 * Unlike rule-based healing (which tries strategies one-by-one),
 * this engine uses a profile-based approach:
 *
 *   1. COLLECT all visible candidate elements from the DOM
 *   2. EXTRACT features from each candidate (tag, text, label, attrs...)
 *   3. COMPARE each candidate against the original element profile
 *   4. SCORE using weighted multi-dimensional similarity
 *   5. RANK candidates by total score
 *   6. DECIDE based on confidence threshold:
 *      - HIGH  (>= 0.70): auto-heal
 *      - MEDIUM (>= 0.45): heal with warning
 *      - LOW   (< 0.45): fail
 *   7. PERSIST healed locator to JSON for reuse
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const CONFIDENCE = { HIGH: 0.65, MEDIUM: 0.35 };

const WEIGHTS = {
  tag:         0.08,
  role:        0.06,
  type:        0.05,
  text:        0.10,
  label:       0.16,
  placeholder: 0.10,
  attributes:  0.16,
  action:      0.05,
  parent:      0.08,
  nearbyText:  0.08,
  dataTestId:  0.08,
};

const ACTION_COMPATIBLE_TAGS = {
  fill:   ['input', 'textarea'],
  click:  ['button', 'a', 'div', 'span', 'input'],
  select: ['select'],
  verify: null,
};

let healingLogs = [];

/**
 * Extract features from all visible interactive elements on the page.
 * Runs inside the browser context via page.evaluate().
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function collectCandidates(page) {
  return page.evaluate(() => {
    const TAGS = 'input, select, textarea, button, a, h1, h2, h3, h4, div, span, table, nav, label';

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

    function getVisibleText(el) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
        return '';
      }
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
      return texts.slice(0, 10);
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
        if (['style', 'class'].includes(attr.name)) continue;
        attrs[attr.name] = attr.value;
      }
      return attrs;
    }

    const elements = document.querySelectorAll(TAGS);
    const candidates = [];

    elements.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (getComputedStyle(el).display === 'none') return;
      if (getComputedStyle(el).visibility === 'hidden') return;

      const tagName = el.tagName.toLowerCase();
      const id = el.id || null;
      const dataTestId = el.getAttribute('data-testid') || null;

      candidates.push({
        index,
        tag: tagName,
        id,
        type: el.type || null,
        role: getImplicitRole(el),
        text: getVisibleText(el),
        label: getLabel(el),
        placeholder: el.placeholder || '',
        attributes: getAttributes(el),
        parentContext: getParentContext(el),
        nearbyText: getNearbyText(el),
        dataTestId,
        cssSelector: id ? `#${id}` : (dataTestId ? `[data-testid="${dataTestId}"]` : `${tagName}:nth-of-type(${index})`),
      });
    });

    return candidates;
  });
}

/**
 * Check if a profile dimension has meaningful data worth scoring.
 * Empty strings, null, and empty arrays are considered "no data".
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function hasMeaningfulData(value) {
  if (value == null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Compute weighted similarity score between an element profile and a candidate.
 *
 * Uses dynamic weight redistribution: dimensions where the profile
 * has no meaningful data are excluded, and their weight is redistributed
 * proportionally to active dimensions. This prevents empty-field matches
 * from inflating scores.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function scoreCandidate(profile, candidate) {
  const scores = {};

  scores.tag = (profile.tag === candidate.tag) ? 1 : 0;

  scores.role = (!profile.role && !candidate.role)
    ? 0.5
    : (profile.role === candidate.role ? 1 : 0);

  if (!profile.type) {
    scores.type = 0.5;
  } else {
    scores.type = (profile.type === candidate.type) ? 1 : 0;
  }

  scores.text = hasMeaningfulData(profile.text)
    ? fuzzySimilarity(profile.text, candidate.text || '')
    : null;

  scores.label = hasMeaningfulData(profile.label)
    ? fuzzySimilarity(profile.label, candidate.label || '')
    : null;

  scores.placeholder = hasMeaningfulData(profile.placeholder)
    ? fuzzySimilarity(profile.placeholder, candidate.placeholder || '')
    : null;

  scores.attributes = attributeSimilarity(profile.attributes, candidate.attributes);

  if (profile.actionType && ACTION_COMPATIBLE_TAGS[profile.actionType]) {
    scores.action = ACTION_COMPATIBLE_TAGS[profile.actionType].includes(candidate.tag) ? 1 : 0;
  } else {
    scores.action = (profile.tag === candidate.tag) ? 1 : 0.5;
  }

  scores.parent = fuzzySimilarity(profile.parentContext || '', candidate.parentContext || '');

  scores.nearbyText = hasMeaningfulData(profile.nearbyText)
    ? nearbyTextSimilarity(profile.nearbyText, candidate.nearbyText)
    : null;

  const profileTestId = profile.attributes?.['data-testid'];
  scores.dataTestId = profileTestId
    ? (profileTestId === candidate.dataTestId ? 1 : 0)
    : null;

  const activeDims = {};
  let totalBaseWeight = 0;
  for (const [dim, weight] of Object.entries(WEIGHTS)) {
    if (scores[dim] !== null && scores[dim] !== undefined) {
      activeDims[dim] = weight;
      totalBaseWeight += weight;
    }
  }

  const scale = totalBaseWeight > 0 ? 1 / totalBaseWeight : 0;
  let totalScore = 0;
  for (const [dim, weight] of Object.entries(activeDims)) {
    totalScore += scores[dim] * weight * scale;
  }

  const display = {};
  for (const dim of Object.keys(WEIGHTS)) {
    display[dim] = scores[dim] !== null && scores[dim] !== undefined ? scores[dim] : -1;
  }

  return { total: Math.round(totalScore * 1000) / 1000, breakdown: display };
}

/**
 * Determine confidence level from score.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function getConfidence(score) {
  if (score >= CONFIDENCE.HIGH) return 'HIGH';
  if (score >= CONFIDENCE.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

/**
 * Format score breakdown for logging.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function formatBreakdown(breakdown) {
  return Object.entries(breakdown)
    .map(([dim, val]) => `${dim}=${val < 0 ? 'N/A' : (val * 100).toFixed(0) + '%'}`)
    .join(' | ');
}

/**
 * Try cached locator first before full analysis.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function tryCache(page, profile) {
  const cached = locatorStore.get(profile.selector);
  if (!cached) return null;

  try {
    const el = page.locator(cached.healedLocator);
    await el.waitFor({ state: 'visible', timeout: 2000 });
    console.log(`  🗄️  [AI-Healing] Cache HIT: "${profile.logicalName}" -> "${cached.healedLocator}"`);
    return el;
  } catch {
    return null;
  }
}

/**
 * AI-Driven healing: find an element by comparing its profile against
 * all visible DOM candidates using weighted similarity scoring.
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {object} profile - Element profile with all features
 * @returns {Promise<import('@playwright/test').Locator>} Best matching element
 * @throws {Error} If no candidate meets the confidence threshold
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function aiFindElement(page, profile) {
  const primary = page.locator(profile.selector);
  try {
    await primary.waitFor({ state: 'visible', timeout: 2000 });
    return primary;
  } catch { /* primary failed, start healing */ }

  console.log(`\n  ⚠️  [AI-Healing] Primary locator FAILED: "${profile.selector}" (${profile.logicalName})`);
  console.log(`  🧠 [AI-Healing] Starting AI-driven candidate analysis...`);

  const cached = await tryCache(page, profile);
  if (cached) {
    logHealing(profile, { confidence: 'CACHED', score: 1, selector: locatorStore.get(profile.selector).healedLocator });
    return cached;
  }

  const candidates = await collectCandidates(page);
  console.log(`  📊 [AI-Healing] Collected ${candidates.length} DOM candidates`);

  const scored = candidates
    .map((c) => ({ candidate: c, ...scoreCandidate(profile, c) }))
    .sort((a, b) => b.total - a.total);

  const top5 = scored.slice(0, 5);
  console.log(`  🏆 [AI-Healing] Top 5 candidates for "${profile.logicalName}":`);
  for (const { candidate: c, total, breakdown } of top5) {
    const conf = getConfidence(total);
    const id = c.id ? `#${c.id}` : (c.dataTestId ? `[data-testid="${c.dataTestId}"]` : `<${c.tag}>`);
    console.log(`      ${conf === 'HIGH' ? '🟢' : conf === 'MEDIUM' ? '🟡' : '🔴'} ${(total * 100).toFixed(1)}% ${id} [${formatBreakdown(breakdown)}]`);
  }

  const best = scored[0];
  if (!best) {
    logHealing(profile, { confidence: 'NONE', score: 0, selector: null });
    throw new Error(`[AI-Healing] No candidates found for "${profile.logicalName}"`);
  }

  const confidence = getConfidence(best.total);

  if (confidence === 'LOW') {
    console.log(`  🔴 [AI-Healing] REJECTED: best score ${(best.total * 100).toFixed(1)}% < threshold ${CONFIDENCE.MEDIUM * 100}%`);
    logHealing(profile, { confidence, score: best.total, selector: best.candidate.cssSelector, breakdown: best.breakdown });
    throw new Error(
      `[AI-Healing] No confident match for "${profile.logicalName}" (${profile.selector}).\n` +
      `  Best candidate: ${best.candidate.cssSelector} (score: ${(best.total * 100).toFixed(1)}%)\n` +
      `  Threshold: ${CONFIDENCE.MEDIUM * 100}% (MEDIUM) / ${CONFIDENCE.HIGH * 100}% (HIGH)`
    );
  }

  if (confidence === 'MEDIUM') {
    console.log(`  🟡 [AI-Healing] WARNING: medium confidence (${(best.total * 100).toFixed(1)}%), proceeding with caution`);
  } else {
    console.log(`  🟢 [AI-Healing] HIGH confidence match (${(best.total * 100).toFixed(1)}%)`);
  }

  const selector = best.candidate.cssSelector;
  console.log(`  ✅ [AI-Healing] HEALED: "${profile.logicalName}" -> "${selector}" [${confidence}]`);

  locatorStore.set(profile.selector, `AI_${confidence}`, selector);
  logHealing(profile, { confidence, score: best.total, selector, breakdown: best.breakdown });

  const element = page.locator(selector);
  await element.waitFor({ state: 'visible', timeout: 3000 });
  return element;
}

/**
 * Log a healing attempt for later reporting.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function logHealing(profile, result) {
  healingLogs.push({
    timestamp: new Date().toISOString(),
    logicalName: profile.logicalName,
    page: profile.page,
    originalSelector: profile.selector,
    healedSelector: result.selector,
    confidence: result.confidence,
    score: result.score,
    breakdown: result.breakdown || null,
  });
}

/**
 * Save all healing logs to JSON file.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function saveAiHealingResults(filename = 'ai-healing-results.json') {
  if (healingLogs.length === 0) return;

  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  const filePath = path.join(LOG_DIR, filename);
  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    : [];

  const merged = [...existing, ...healingLogs];
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`\n  📁 [AI-Healing] Results saved to ${filePath}`);
  console.log(`  📁 [AI-Healing] Total records: ${merged.length}`);
}

/**
 * Print summary of AI healing attempts.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function printAiHealingSummary() {
  if (healingLogs.length === 0) return;

  const total = healingLogs.length;
  const high = healingLogs.filter((l) => l.confidence === 'HIGH').length;
  const medium = healingLogs.filter((l) => l.confidence === 'MEDIUM').length;
  const cached = healingLogs.filter((l) => l.confidence === 'CACHED').length;
  const low = healingLogs.filter((l) => l.confidence === 'LOW' || l.confidence === 'NONE').length;
  const avgScore = healingLogs.reduce((sum, l) => sum + (l.score || 0), 0) / total;

  console.log('\n  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║       AI-DRIVEN HEALING SUMMARY REPORT            ║');
  console.log('  ╠═══════════════════════════════════════════════════╣');
  console.log(`  ║  Total healing attempts: ${String(total).padStart(4)}                    ║`);
  console.log(`  ║  🟢 HIGH confidence:     ${String(high).padStart(4)}                    ║`);
  console.log(`  ║  🟡 MEDIUM confidence:   ${String(medium).padStart(4)}                    ║`);
  console.log(`  ║  🗄️  CACHED:              ${String(cached).padStart(4)}                    ║`);
  console.log(`  ║  🔴 LOW / FAILED:        ${String(low).padStart(4)}                    ║`);
  console.log(`  ║  📊 Average score:      ${(avgScore * 100).toFixed(1)}%                  ║`);
  console.log('  ╚═══════════════════════════════════════════════════╝');

  healingLogs = [];
}

/**
 * Convenience: AI heal + fill.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function aiFill(page, profile, value) {
  const el = await aiFindElement(page, profile);
  await el.fill(value);
  return el;
}

/**
 * Convenience: AI heal + click.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function aiClick(page, profile) {
  const el = await aiFindElement(page, profile);
  await el.click();
  return el;
}

/**
 * Convenience: AI heal + select option.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function aiSelect(page, profile, value) {
  const el = await aiFindElement(page, profile);
  await el.selectOption(value);
  return el;
}
