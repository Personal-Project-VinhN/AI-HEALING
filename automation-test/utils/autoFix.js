import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTEXT_DIR = path.join(__dirname, '..', 'healing-context');
const LOCATOR_DIR = path.join(__dirname, '..', 'locators');
const PROFILE_DIR = path.join(__dirname, '..', 'profiles');

/**
 * Auto-Fix Engine for Self-Healing.
 *
 * Reads healing context files, analyzes DOM elements,
 * determines the best replacement selector using multi-signal scoring,
 * and patches locator + profile source files in-place.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

function norm(str) {
  return (str || '').toLowerCase().trim();
}

function fuzzyMatch(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

/**
 * Extract keywords from an ID/key string (split by - and _).
 *
 * @param {string} str
 * @returns {string[]}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function extractKeywords(str) {
  if (!str) return [];
  const cleaned = str.replace(/^#/, '').replace(/^\[data-testid="(.+)"\]$/, '$1');
  return cleaned.split(/[-_]/).filter(Boolean).map(norm);
}

/**
 * Score a DOM element as a replacement candidate.
 * Uses all available signals: profile data, locator key name,
 * old selector keywords, tag/type matching, etc.
 *
 * @param {object} el - DOM element from snapshot
 * @param {object} context - Full healing context
 * @returns {{ score: number, reasons: string[] }}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function scoreElement(el, context) {
  const { failedLocator, profile, locatorSource } = context;
  let score = 0;
  const reasons = [];

  if (!el.selector) return { score: -1, reasons: ['no selector'] };
  if (el.selector === failedLocator) return { score: -1, reasons: ['same as failed'] };

  const pTag = profile?.tag;
  const pLabel = norm(profile?.label);
  const pPlaceholder = norm(profile?.placeholder);
  const pText = norm(profile?.text);
  const pType = norm(profile?.type);
  const pDataAction = profile?.attributes?.['data-action'] || '';
  const pDataTestId = profile?.attributes?.['data-testid'] || '';
  const pLogicalName = norm(profile?.logicalName || '');
  const locatorKey = norm(locatorSource?.key || '');

  // Signal 1: data-action match (strongest for buttons)
  if (pDataAction && el.dataAction && norm(el.dataAction) === norm(pDataAction)) {
    score += 60;
    reasons.push(`data-action="${el.dataAction}"`);
  }

  // Signal 2: label / aria-label semantic match
  if (pLabel) {
    const elLabel = norm(el.label);
    const elAria = norm(el.ariaLabel);
    if (elLabel === pLabel || elAria === pLabel) {
      score += 55;
      reasons.push(`label exact: "${el.label || el.ariaLabel}"`);
    } else if (fuzzyMatch(el.label, pLabel) || fuzzyMatch(el.ariaLabel, pLabel)) {
      score += 35;
      reasons.push(`label fuzzy: "${el.label || el.ariaLabel}"`);
    }
  }

  // Signal 3: data-testid match
  if (pDataTestId && el.dataTestId && norm(el.dataTestId) === norm(pDataTestId)) {
    score += 45;
    reasons.push(`data-testid="${el.dataTestId}"`);
  }

  // Signal 4: input type match (password, email, submit)
  if (pType === 'password' && el.type === 'password') {
    score += 40;
    reasons.push('type=password');
  } else if (pType === 'email' && el.type === 'email') {
    score += 40;
    reasons.push('type=email');
  } else if (pType === 'submit' && el.type === 'submit') {
    score += 40;
    reasons.push('type=submit');
  } else if (pType && pType === norm(el.type)) {
    score += 25;
    reasons.push(`type=${el.type}`);
  }

  // Signal 5: tag match
  if (pTag && el.tag === pTag) {
    score += 30;
    reasons.push(`tag=${el.tag}`);
  }

  // Signal 6: placeholder match
  if (pPlaceholder && fuzzyMatch(el.placeholder, pPlaceholder)) {
    score += 25;
    reasons.push(`placeholder match`);
  }

  // Signal 7: text content match
  if (pText && el.text && fuzzyMatch(el.text, pText)) {
    score += 20;
    reasons.push(`text match: "${el.text.substring(0, 30)}"`);
  }

  // Signal 8: keyword matching from locatorKey and old selector
  const oldKeywords = [
    ...extractKeywords(failedLocator),
    ...extractKeywords(locatorKey),
    ...extractKeywords(pLogicalName),
  ];
  const uniqueOldKw = [...new Set(oldKeywords)];

  if (uniqueOldKw.length > 0) {
    const elKeywords = [
      ...extractKeywords(el.id),
      ...extractKeywords(el.dataTestId),
      ...extractKeywords(el.name),
      ...extractKeywords(el.dataAction),
      ...norm(el.text || '').split(/\s+/).filter(Boolean),
      ...norm(el.label || '').split(/\s+/).filter(Boolean),
      ...norm(el.ariaLabel || '').split(/\s+/).filter(Boolean),
    ];

    const SYNONYM_MAP = {
      'login': ['signin', 'sign', 'auth'],
      'logout': ['signout', 'sign'],
      'username': ['email', 'user', 'account'],
      'password': ['pass', 'pwd', 'secret'],
      'dashboard': ['home', 'main', 'overview'],
      'nav': ['nav', 'navigation', 'menu'],
      'profile': ['account', 'user', 'member'],
      'save': ['submit', 'confirm', 'ok'],
      'cancel': ['discard', 'reset', 'close'],
      'btn': ['button', 'btn', 'submit'],
      'user': ['member', 'account', 'person'],
      'total': ['count', 'all', 'member'],
      'active': ['live', 'online', 'current'],
      'sessions': ['sessions', 'connections'],
      'reports': ['analytics', 'stats', 'report'],
      'table': ['table', 'list', 'grid', 'members'],
      'first': ['fname', 'given'],
      'last': ['lname', 'family', 'surname'],
      'name': [],
      'email': ['email', 'contact', 'mail'],
      'role': ['position', 'role', 'type'],
      'error': ['error', 'alert', 'warning', 'validation'],
      'success': ['success', 'ok', 'confirmation', 'done'],
      'message': ['msg', 'message', 'notice', 'alert', 'notification'],
    };

    let kwScore = 0;
    const matchedKw = [];
    for (const kw of uniqueOldKw) {
      const synonyms = SYNONYM_MAP[kw] || [];
      const allVariants = [kw, ...synonyms];

      for (const variant of allVariants) {
        const exactMatch = elKeywords.some((ek) => ek === variant);
        const partialMatch = !exactMatch && elKeywords.some((ek) => ek.includes(variant) || variant.includes(ek));

        if (exactMatch) {
          kwScore += (variant === kw) ? 18 : 14;
          matchedKw.push(`${kw}=${variant}`);
          break;
        } else if (partialMatch) {
          kwScore += (variant === kw) ? 8 : 6;
          matchedKw.push(`${kw}~${variant}`);
          break;
        }
      }
    }

    if (kwScore > 0) {
      score += Math.min(kwScore, 50);
      reasons.push(`keyword: ${matchedKw.join(', ')}`);
    }
  }

  return { score, reasons };
}

/**
 * Find the best replacement selector from DOM elements.
 *
 * @param {object} context - Healing context
 * @returns {object|null} { newSelector, confidence, reasoning, matchedElement, alternatives }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function findBestMatch(context) {
  const { domElements } = context;
  if (!domElements) return null;

  const allElements = [];
  const seen = new Set();

  const sources = [
    ...(domElements.relevant || []),
    ...(domElements.allWithId || []),
    ...(domElements.allWithTestId || []),
  ];

  for (const el of sources) {
    const key = el.selector || `${el.tag}-${el.id}-${el.dataTestId}-${el.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      allElements.push(el);
    }
  }

  if (allElements.length === 0) return null;

  const scored = allElements
    .map((el) => {
      const { score, reasons } = scoreElement(el, context);
      return { element: el, score, reasons };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const best = scored[0];
  const confidence = best.score >= 80 ? 'HIGH'
    : best.score >= 40 ? 'MEDIUM'
    : 'LOW';

  return {
    newSelector: best.element.selector,
    confidence,
    score: best.score,
    reasoning: best.reasons.join(', '),
    matchedElement: {
      tag: best.element.tag,
      id: best.element.id,
      label: best.element.label,
      placeholder: best.element.placeholder,
      ariaLabel: best.element.ariaLabel,
      dataTestId: best.element.dataTestId,
      dataAction: best.element.dataAction,
      type: best.element.type,
      name: best.element.name,
      text: (best.element.text || '').substring(0, 50),
    },
    alternatives: scored.slice(1, 4).map((s) => ({
      selector: s.element.selector,
      score: s.score,
      reasoning: s.reasons.join(', '),
    })),
  };
}

/**
 * Apply a selector replacement to a locator source file.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {string} oldSelector - The selector string to find
 * @param {string} newSelector - The replacement selector string
 * @returns {boolean} Whether the replacement was made
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function patchLocatorFile(filePath, oldSelector, newSelector) {
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf-8');
  const escaped = oldSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(['"])${escaped}\\1`, 'g');

  if (!regex.test(content)) return false;

  regex.lastIndex = 0;
  const quote = content.includes(`'${oldSelector}'`) ? "'" : '"';
  const updated = content.replace(regex, `${quote}${newSelector}${quote}`);

  if (updated === content) return false;

  fs.writeFileSync(filePath, updated, 'utf-8');
  return true;
}

/**
 * Apply a selector replacement to a profile source file.
 * Updates both the `selector:` field and the corresponding
 * `id` or `data-testid` inside `attributes:`.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {string} oldSelector - The selector string to find
 * @param {string} newSelector - The replacement selector string
 * @returns {boolean} Whether the replacement was made
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function patchProfileFile(filePath, oldSelector, newSelector) {
  if (!fs.existsSync(filePath)) return false;

  let content = fs.readFileSync(filePath, 'utf-8');
  const escaped = oldSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(['"])${escaped}\\1`, 'g');

  if (!regex.test(content)) return false;

  regex.lastIndex = 0;
  const quote = content.includes(`'${oldSelector}'`) ? "'" : '"';
  content = content.replace(regex, `${quote}${newSelector}${quote}`);

  const oldId = oldSelector.startsWith('#') ? oldSelector.slice(1) : null;
  const newId = newSelector.startsWith('#') ? newSelector.slice(1) : null;
  if (oldId && newId) {
    content = content.replace(
      new RegExp(`(id:\\s*['"])${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(['"])`, 'g'),
      `$1${newId}$2`
    );
  }

  const oldTestId = oldSelector.match(/data-testid="([^"]+)"/)?.[1];
  const newTestId = newSelector.match(/data-testid="([^"]+)"/)?.[1];
  if (oldTestId && newTestId && oldTestId !== newTestId) {
    content = content.replace(
      new RegExp(`(['"])${oldTestId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(['"])`, 'g'),
      `$1${newTestId}$2`
    );
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

/**
 * Run the auto-fix process on all healing context files.
 *
 * @returns {object} { totalProcessed, totalFixed, totalSkipped, fixes }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function runAutoFix() {
  if (!fs.existsSync(CONTEXT_DIR)) {
    console.log('  ❌ No healing context found. Run "npm run heal:collect" first.');
    return { totalProcessed: 0, totalFixed: 0, totalSkipped: 0, fixes: [] };
  }

  const contextFiles = fs.readdirSync(CONTEXT_DIR)
    .filter((f) => f.endsWith('.context.json'));

  if (contextFiles.length === 0) {
    console.log('  ❌ No context files found.');
    return { totalProcessed: 0, totalFixed: 0, totalSkipped: 0, fixes: [] };
  }

  console.log(`\n  🔧 Auto-fixing ${contextFiles.length} broken locator(s)...\n`);

  const fixes = [];
  let totalFixed = 0;
  let totalSkipped = 0;

  for (const file of contextFiles) {
    const context = JSON.parse(fs.readFileSync(path.join(CONTEXT_DIR, file), 'utf-8'));
    const match = findBestMatch(context);

    const locatorKey = context.locatorSource
      ? `${context.locatorSource.exportName}.${context.locatorSource.key}`
      : 'unknown';

    if (!match || !match.newSelector) {
      console.log(`  ⚠️  SKIP: ${context.failedLocator} (${locatorKey}) — no match found`);
      totalSkipped++;
      fixes.push({
        failedLocator: context.failedLocator,
        newSelector: null,
        status: 'SKIPPED',
        reason: 'No confident match in DOM',
        locatorKey,
      });
      continue;
    }

    const locatorFiles = fs.readdirSync(LOCATOR_DIR)
      .filter((f) => f.endsWith('.locators.js'))
      .map((f) => path.join(LOCATOR_DIR, f));

    const profileFiles = fs.readdirSync(PROFILE_DIR)
      .filter((f) => f.endsWith('.profiles.js'))
      .map((f) => path.join(PROFILE_DIR, f));

    let patched = false;
    const patchedFiles = [];

    for (const lf of locatorFiles) {
      if (patchLocatorFile(lf, context.failedLocator, match.newSelector)) {
        patched = true;
        patchedFiles.push(path.relative(path.join(__dirname, '..'), lf));
      }
    }

    for (const pf of profileFiles) {
      if (patchProfileFile(pf, context.failedLocator, match.newSelector)) {
        patched = true;
        patchedFiles.push(path.relative(path.join(__dirname, '..'), pf));
      }
    }

    if (patched) {
      totalFixed++;
      console.log(`  ✅ FIXED: ${context.failedLocator} => ${match.newSelector}`);
      console.log(`     Confidence: ${match.confidence} (score: ${match.score})`);
      console.log(`     Reason: ${match.reasoning}`);
      console.log(`     Files: ${patchedFiles.join(', ')}`);
    } else {
      totalSkipped++;
      console.log(`  ⚠️  NO PATCH: ${context.failedLocator} — not found in source files`);
    }

    fixes.push({
      failedLocator: context.failedLocator,
      newSelector: match.newSelector,
      confidence: match.confidence,
      score: match.score,
      reasoning: match.reasoning,
      matchedElement: match.matchedElement,
      alternatives: match.alternatives,
      status: patched ? 'FIXED' : 'NO_PATCH',
      patchedFiles,
      locatorKey,
    });
  }

  console.log(`\n  ─── AUTO-FIX SUMMARY ─────────────────────────────`);
  console.log(`  Total processed: ${contextFiles.length}`);
  console.log(`  Fixed:           ${totalFixed}`);
  console.log(`  Skipped:         ${totalSkipped}`);
  console.log(`  ──────────────────────────────────────────────────\n`);

  return { totalProcessed: contextFiles.length, totalFixed, totalSkipped, fixes };
}
