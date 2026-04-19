import { semanticSimilarity, semanticNearbySimilarity, getEmbeddingCacheSize } from './embeddingService.js';
import { attributeSimilarity } from './similarity.js';
import { locatorStore } from './locatorStore.js';
import { isLlmAvailable } from './llmService.js';
import { judgeCandidate, isAmbiguous } from './llmJudge.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '..', 'healed-locators');

/**
 * LLM-Powered Self-Healing Engine for Playwright.
 *
 * Extends the AI-driven approach with:
 * 1. EMBEDDING SIMILARITY - Uses LLM embeddings for semantic text comparison
 *    instead of Levenshtein/Jaccard. "Username" and "Email Address" both
 *    map to "login identifier" in semantic space.
 * 2. LLM-AS-JUDGE - When top candidates are ambiguous (score gap < 8%),
 *    the LLM reasons about which element is the correct match.
 * 3. GRACEFUL FALLBACK - When no LLM is available, falls back to the
 *    same static scoring used in aiHealing.js.
 *
 * Flow:
 *   1. Try primary selector -> success? return immediately
 *   2. Check locator cache -> hit? return cached
 *   3. Collect DOM candidates (same as aiHealing)
 *   4. Score each candidate using EMBEDDING similarity
 *   5. If top 2 are ambiguous -> invoke LLM Judge
 *   6. Apply confidence threshold
 *   7. Cache and return healed element
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const CONFIDENCE = { HIGH: 0.65, MEDIUM: 0.35 };

const WEIGHTS = {
  tag: 0.08, role: 0.06, type: 0.05,
  text: 0.10, label: 0.16, placeholder: 0.10,
  attributes: 0.16, action: 0.05, parent: 0.08,
  nearbyText: 0.08, dataTestId: 0.08,
};

const ACTION_COMPATIBLE_TAGS = {
  fill: ['input', 'textarea'],
  click: ['button', 'a', 'div', 'span', 'input'],
  select: ['select'],
  verify: null,
};

let healingLogs = [];
let totalApiCalls = 0;

/**
 * Extract features from all visible interactive elements on the page.
 * Identical to aiHealing.js collectCandidates for consistency.
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
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return '';
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
        index, tag: tagName, id, type: el.type || null,
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

function hasMeaningfulData(value) {
  if (value == null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Score a candidate against the profile using SEMANTIC (embedding) similarity.
 * For text/label/placeholder/nearbyText, uses LLM embeddings when available.
 * Other dimensions (tag, role, type, attributes) use deterministic comparison.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function scoreCandidateSemantic(profile, candidate) {
  const scores = {};
  const methods = {};

  scores.tag = (profile.tag === candidate.tag) ? 1 : 0;
  methods.tag = 'exact';

  scores.role = (!profile.role && !candidate.role) ? 0.5
    : (profile.role === candidate.role ? 1 : 0);
  methods.role = 'exact';

  scores.type = !profile.type ? 0.5 : (profile.type === candidate.type ? 1 : 0);
  methods.type = 'exact';

  if (hasMeaningfulData(profile.text)) {
    const result = await semanticSimilarity(profile.text, candidate.text || '');
    scores.text = result.score;
    methods.text = result.method;
    totalApiCalls += (result.method === 'embedding') ? 1 : 0;
  } else {
    scores.text = null;
    methods.text = 'skip';
  }

  if (hasMeaningfulData(profile.label)) {
    const result = await semanticSimilarity(profile.label, candidate.label || '');
    scores.label = result.score;
    methods.label = result.method;
    totalApiCalls += (result.method === 'embedding') ? 1 : 0;
  } else {
    scores.label = null;
    methods.label = 'skip';
  }

  if (hasMeaningfulData(profile.placeholder)) {
    const result = await semanticSimilarity(profile.placeholder, candidate.placeholder || '');
    scores.placeholder = result.score;
    methods.placeholder = result.method;
    totalApiCalls += (result.method === 'embedding') ? 1 : 0;
  } else {
    scores.placeholder = null;
    methods.placeholder = 'skip';
  }

  scores.attributes = attributeSimilarity(profile.attributes, candidate.attributes);
  methods.attributes = 'jaccard';

  if (profile.actionType && ACTION_COMPATIBLE_TAGS[profile.actionType]) {
    scores.action = ACTION_COMPATIBLE_TAGS[profile.actionType].includes(candidate.tag) ? 1 : 0;
  } else {
    scores.action = (profile.tag === candidate.tag) ? 1 : 0.5;
  }
  methods.action = 'exact';

  if (hasMeaningfulData(profile.parentContext)) {
    const result = await semanticSimilarity(profile.parentContext || '', candidate.parentContext || '');
    scores.parent = result.score;
    methods.parent = result.method;
  } else {
    scores.parent = null;
    methods.parent = 'skip';
  }

  if (hasMeaningfulData(profile.nearbyText)) {
    const result = await semanticNearbySimilarity(profile.nearbyText, candidate.nearbyText);
    scores.nearbyText = result.score;
    methods.nearbyText = result.method;
    totalApiCalls += (result.method === 'embedding') ? 1 : 0;
  } else {
    scores.nearbyText = null;
    methods.nearbyText = 'skip';
  }

  const profileTestId = profile.attributes?.['data-testid'];
  scores.dataTestId = profileTestId ? (profileTestId === candidate.dataTestId ? 1 : 0) : null;
  methods.dataTestId = profileTestId ? 'exact' : 'skip';

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

  return {
    total: Math.round(totalScore * 1000) / 1000,
    breakdown: display,
    methods,
  };
}

function getConfidence(score) {
  if (score >= CONFIDENCE.HIGH) return 'HIGH';
  if (score >= CONFIDENCE.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

function formatBreakdown(breakdown, methods) {
  return Object.entries(breakdown)
    .map(([dim, val]) => {
      if (val < 0) return `${dim}=N/A`;
      const method = methods?.[dim] || '';
      const suffix = method === 'embedding' ? '🔮' : '';
      return `${dim}=${(val * 100).toFixed(0)}%${suffix}`;
    })
    .join(' | ');
}

async function tryCache(page, profile) {
  const cached = locatorStore.get(profile.selector);
  if (!cached) return null;

  try {
    const el = page.locator(cached.healedLocator);
    await el.waitFor({ state: 'visible', timeout: 2000 });
    console.log(`  🗄️  [LLM-Healing] Cache HIT: "${profile.logicalName}" -> "${cached.healedLocator}"`);
    return el;
  } catch {
    return null;
  }
}

/**
 * LLM-powered healing: find an element using semantic similarity
 * and LLM-as-judge for ambiguous cases.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} profile - Element profile
 * @returns {Promise<import('@playwright/test').Locator>}
 * @throws {Error} If no confident match found
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function llmFindElement(page, profile) {
  const primary = page.locator(profile.selector);
  try {
    await primary.waitFor({ state: 'visible', timeout: 2000 });
    return primary;
  } catch { /* primary failed, start healing */ }

  const llmActive = isLlmAvailable();
  const prefix = llmActive ? 'LLM-Healing' : 'LLM-Healing (fallback)';

  console.log(`\n  ⚠️  [${prefix}] Primary locator FAILED: "${profile.selector}" (${profile.logicalName})`);
  console.log(`  🧠 [${prefix}] Starting ${llmActive ? 'LLM-powered' : 'static-fallback'} candidate analysis...`);

  const cached = await tryCache(page, profile);
  if (cached) {
    logHealing(profile, { confidence: 'CACHED', score: 1, selector: locatorStore.get(profile.selector).healedLocator, usedLlm: false });
    return cached;
  }

  const candidates = await collectCandidates(page);
  console.log(`  📊 [${prefix}] Collected ${candidates.length} DOM candidates`);

  const scored = [];
  for (const c of candidates) {
    const result = await scoreCandidateSemantic(profile, c);
    scored.push({ candidate: c, ...result });
  }
  scored.sort((a, b) => b.total - a.total);

  const top5 = scored.slice(0, 5);
  console.log(`  🏆 [${prefix}] Top 5 candidates for "${profile.logicalName}":`);
  for (const { candidate: c, total, breakdown, methods } of top5) {
    const conf = getConfidence(total);
    const id = c.id ? `#${c.id}` : (c.dataTestId ? `[data-testid="${c.dataTestId}"]` : `<${c.tag}>`);
    const icon = conf === 'HIGH' ? '🟢' : conf === 'MEDIUM' ? '🟡' : '🔴';
    console.log(`      ${icon} ${(total * 100).toFixed(1)}% ${id} [${formatBreakdown(breakdown, methods)}]`);
  }

  let best = scored[0];
  if (!best) {
    logHealing(profile, { confidence: 'NONE', score: 0, selector: null, usedLlm: false });
    throw new Error(`[${prefix}] No candidates found for "${profile.logicalName}"`);
  }

  let usedJudge = false;

  if (scored.length >= 2 && isAmbiguous(scored[0].total, scored[1].total)) {
    console.log(`  🔄 [${prefix}] Top 2 candidates are ambiguous (gap: ${((scored[0].total - scored[1].total) * 100).toFixed(1)}%)`);

    const judgeResult = await judgeCandidate(profile, scored.slice(0, 5));
    if (judgeResult && judgeResult.bestIndex >= 0 && judgeResult.bestIndex < scored.length) {
      const judged = scored[judgeResult.bestIndex];
      if (judgeResult.confidence !== 'low') {
        best = judged;
        usedJudge = true;
        console.log(`  🧑‍⚖️ [${prefix}] Judge override: #${judgeResult.bestIndex} "${best.candidate.cssSelector}"`);
      }
    }
  }

  const confidence = getConfidence(best.total);

  if (confidence === 'LOW' && !usedJudge) {
    console.log(`  🔴 [${prefix}] REJECTED: best score ${(best.total * 100).toFixed(1)}% < threshold ${CONFIDENCE.MEDIUM * 100}%`);
    logHealing(profile, { confidence, score: best.total, selector: best.candidate.cssSelector, breakdown: best.breakdown, usedLlm: llmActive, usedJudge });
    throw new Error(
      `[${prefix}] No confident match for "${profile.logicalName}" (${profile.selector}).\n` +
      `  Best: ${best.candidate.cssSelector} (${(best.total * 100).toFixed(1)}%)`
    );
  }

  if (confidence === 'MEDIUM') {
    console.log(`  🟡 [${prefix}] WARNING: medium confidence (${(best.total * 100).toFixed(1)}%)${usedJudge ? ' [judge-assisted]' : ''}`);
  } else {
    console.log(`  🟢 [${prefix}] HIGH confidence (${(best.total * 100).toFixed(1)}%)${usedJudge ? ' [judge-assisted]' : ''}`);
  }

  const selector = best.candidate.cssSelector;
  console.log(`  ✅ [${prefix}] HEALED: "${profile.logicalName}" -> "${selector}" [${confidence}]`);

  const strategy = usedJudge ? `LLM_JUDGE_${confidence}` : `LLM_${confidence}`;
  locatorStore.set(profile.selector, strategy, selector);
  logHealing(profile, { confidence, score: best.total, selector, breakdown: best.breakdown, usedLlm: llmActive, usedJudge });

  const element = page.locator(selector);
  await element.waitFor({ state: 'visible', timeout: 3000 });
  return element;
}

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
    usedLlm: result.usedLlm || false,
    usedJudge: result.usedJudge || false,
  });
}

/**
 * Save LLM healing results to JSON.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function saveLlmHealingResults(filename = 'llm-healing-results.json') {
  if (healingLogs.length === 0) return;

  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  const filePath = path.join(LOG_DIR, filename);
  const existing = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) : [];
  const merged = [...existing, ...healingLogs];
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`\n  📁 [LLM-Healing] Results saved to ${filePath}`);
}

/**
 * Print summary of LLM healing session.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function printLlmHealingSummary() {
  if (healingLogs.length === 0) return;

  const total = healingLogs.length;
  const high = healingLogs.filter((l) => l.confidence === 'HIGH').length;
  const medium = healingLogs.filter((l) => l.confidence === 'MEDIUM').length;
  const cached = healingLogs.filter((l) => l.confidence === 'CACHED').length;
  const low = healingLogs.filter((l) => l.confidence === 'LOW' || l.confidence === 'NONE').length;
  const withLlm = healingLogs.filter((l) => l.usedLlm).length;
  const withJudge = healingLogs.filter((l) => l.usedJudge).length;
  const avgScore = healingLogs.reduce((s, l) => s + (l.score || 0), 0) / total;
  const cacheSize = getEmbeddingCacheSize();

  console.log('\n  ╔════════════════════════════════════════════════════════╗');
  console.log('  ║       LLM-POWERED HEALING SUMMARY REPORT               ║');
  console.log('  ╠════════════════════════════════════════════════════════╣');
  console.log(`  ║  Total healing attempts:  ${String(total).padStart(4)}                      ║`);
  console.log(`  ║  🟢 HIGH confidence:      ${String(high).padStart(4)}                      ║`);
  console.log(`  ║  🟡 MEDIUM confidence:    ${String(medium).padStart(4)}                      ║`);
  console.log(`  ║  🗄️  CACHED:               ${String(cached).padStart(4)}                      ║`);
  console.log(`  ║  🔴 LOW / FAILED:         ${String(low).padStart(4)}                      ║`);
  console.log(`  ║  📊 Average score:       ${(avgScore * 100).toFixed(1)}%                    ║`);
  console.log('  ╠════════════════════════════════════════════════════════╣');
  console.log(`  ║  🤖 LLM-assisted heals:   ${String(withLlm).padStart(4)}                      ║`);
  console.log(`  ║  🧑‍⚖️ Judge invocations:     ${String(withJudge).padStart(4)}                      ║`);
  console.log(`  ║  💾 Embedding cache size:  ${String(cacheSize).padStart(4)}                      ║`);
  console.log(`  ║  🔌 Total API calls:      ${String(totalApiCalls).padStart(4)}                      ║`);
  console.log('  ╚════════════════════════════════════════════════════════╝');

  healingLogs = [];
  totalApiCalls = 0;
}

/**
 * Convenience: LLM heal + fill.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function llmFill(page, profile, value) {
  const el = await llmFindElement(page, profile);
  await el.fill(value);
  return el;
}

/**
 * Convenience: LLM heal + click.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function llmClick(page, profile) {
  const el = await llmFindElement(page, profile);
  await el.click();
  return el;
}

/**
 * Convenience: LLM heal + select.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function llmSelect(page, profile, value) {
  const el = await llmFindElement(page, profile);
  await el.selectOption(value);
  return el;
}
