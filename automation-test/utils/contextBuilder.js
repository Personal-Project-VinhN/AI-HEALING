import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTEXT_DIR = path.join(__dirname, '..', 'healing-context');

const LOCATOR_PATTERNS = [
  /waiting for locator\('([^']+)'\)/,
  /locator\('([^']+)'\)/,
  /locator\("([^"]+)"\)/,
  /selector "([^"]+)"/,
  /"\[data-testid="([^"]+)"\]"/,
  /"(#[a-zA-Z][\w-]*)"/,
];

/**
 * Extract the failing locator string from a Playwright error message.
 *
 * @param {string} errorMessage - The error message text
 * @returns {string|null} The extracted locator or null
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function extractLocatorFromError(errorMessage) {
  for (const pattern of LOCATOR_PATTERNS) {
    const match = errorMessage.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Classify a Playwright error into a failure type.
 *
 * @param {string} errorMessage - The error message text
 * @returns {{ type: string, isLocatorError: boolean }}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function classifyError(errorMessage) {
  const msg = errorMessage.toLowerCase();

  const locatorPatterns = [
    /resolved to 0 elements/,
    /waiting for locator/,
    /no element matches selector/,
    /element not found/,
    /strict mode violation/,
    /selector resolved to hidden/,
    /locator\.\w+:.*timeout/,
    /locator\('[^']+'\).*not found/,
  ];

  for (const p of locatorPatterns) {
    if (p.test(msg)) {
      return { type: 'LOCATOR_FAILED', isLocatorError: true };
    }
  }

  if (/timeout.*exceeded/i.test(msg) && /locator|selector|waiting for/i.test(msg)) {
    return { type: 'LOCATOR_FAILED', isLocatorError: true };
  }

  if (/timeout.*exceeded/i.test(msg) || /exceeded.*timeout/i.test(msg)) {
    return { type: 'TIMEOUT', isLocatorError: true };
  }

  if (/expect\(/.test(msg) || /tobevisible|tocontaintext|tohaveurl/i.test(msg)) {
    return { type: 'ASSERTION_FAILED', isLocatorError: false };
  }

  if (/err_connection_refused|net::err_/i.test(msg)) {
    return { type: 'NAVIGATION_ERROR', isLocatorError: false };
  }

  return { type: 'UNKNOWN', isLocatorError: false };
}

/**
 * Find the matching profile for a failed locator by scanning
 * all profile files in the profiles/ directory.
 *
 * @param {string} failedLocator - The CSS selector that failed
 * @returns {object|null} Matching profile object or null
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function findMatchingProfile(failedLocator) {
  const profileDir = path.join(__dirname, '..', 'profiles');
  const files = fs.readdirSync(profileDir).filter((f) => f.endsWith('.profiles.js'));

  for (const file of files) {
    const filePath = path.join(profileDir, file);
    const mod = await import(`file://${filePath.replace(/\\/g, '/')}`);

    for (const exportName of Object.keys(mod)) {
      const profileMap = mod[exportName];
      if (typeof profileMap !== 'object') continue;

      for (const [key, profile] of Object.entries(profileMap)) {
        if (profile.selector === failedLocator) {
          return { ...profile, _profileKey: key, _profileFile: file, _exportName: exportName };
        }
      }
    }
  }
  return null;
}

/**
 * Find the locator file and key that contains the failed selector.
 *
 * @param {string} failedLocator - The CSS selector that failed
 * @returns {object|null} { file, exportName, key, selector }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function findLocatorSource(failedLocator) {
  const locatorDir = path.join(__dirname, '..', 'locators');
  const files = fs.readdirSync(locatorDir).filter((f) => f.endsWith('.locators.js'));

  for (const file of files) {
    const filePath = path.join(locatorDir, file);
    const mod = await import(`file://${filePath.replace(/\\/g, '/')}`);

    for (const exportName of Object.keys(mod)) {
      const locatorMap = mod[exportName];
      if (typeof locatorMap !== 'object') continue;

      for (const [key, selector] of Object.entries(locatorMap)) {
        if (selector === failedLocator) {
          return { file, exportName, key, selector };
        }
      }
    }
  }
  return null;
}

/**
 * Build a complete healing context from a test failure.
 * Combines error info, DOM snapshot, profile data, and locator source
 * into a single JSON object that Cursor Agent can analyze.
 *
 * @param {object} params
 * @param {string} params.testName - Name of the failing test
 * @param {string} params.testFile - Path to the test file
 * @param {string} params.errorMessage - Full error message
 * @param {object} params.domSnapshot - DOM snapshot from domCollector
 * @returns {Promise<object>} Complete healing context
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function buildHealingContext(params) {
  const { testName, testFile, errorMessage, domSnapshot } = params;

  const classification = classifyError(errorMessage);
  const failedLocator = extractLocatorFromError(errorMessage) || domSnapshot.failedLocator || '';

  const profile = failedLocator ? await findMatchingProfile(failedLocator) : null;
  const locatorSource = failedLocator ? await findLocatorSource(failedLocator) : null;

  const relevantElements = domSnapshot.elements.filter((el) => {
    if (!failedLocator) return true;
    const locatorId = failedLocator.startsWith('#') ? failedLocator.slice(1) : '';
    if (!locatorId) return el.dataTestId || el.id;

    const keywords = locatorId.split(/[-_]/).filter(Boolean);
    return keywords.some((kw) => {
      const lower = kw.toLowerCase();
      return (el.id && el.id.toLowerCase().includes(lower)) ||
        (el.name && el.name.toLowerCase().includes(lower)) ||
        (el.label && el.label.toLowerCase().includes(lower)) ||
        (el.placeholder && el.placeholder.toLowerCase().includes(lower)) ||
        (el.ariaLabel && el.ariaLabel.toLowerCase().includes(lower)) ||
        (el.dataTestId && el.dataTestId.toLowerCase().includes(lower));
    });
  });

  const context = {
    timestamp: new Date().toISOString(),
    testName,
    testFile,
    failedLocator,
    errorType: classification.type,
    isLocatorError: classification.isLocatorError,
    errorMessage: errorMessage.substring(0, 2000),
    currentUrl: domSnapshot.url,
    screenshotPath: domSnapshot.screenshotPath,

    profile: profile ? {
      logicalName: profile.logicalName,
      page: profile.page,
      actionType: profile.actionType,
      selector: profile.selector,
      tag: profile.tag,
      role: profile.role,
      label: profile.label,
      placeholder: profile.placeholder,
      _profileKey: profile._profileKey,
      _profileFile: profile._profileFile,
      _exportName: profile._exportName,
    } : null,

    locatorSource: locatorSource ? {
      file: `locators/${locatorSource.file}`,
      exportName: locatorSource.exportName,
      key: locatorSource.key,
      currentSelector: locatorSource.selector,
    } : null,

    domElements: {
      total: domSnapshot.elementsCount,
      relevant: relevantElements,
      allWithId: domSnapshot.elements.filter((el) => el.id),
      allWithTestId: domSnapshot.elements.filter((el) => el.dataTestId),
    },
  };

  return context;
}

/**
 * Save healing context to a JSON file for Cursor Agent to read.
 *
 * @param {object} context - The healing context object
 * @param {string} [filename] - Optional custom filename
 * @returns {string} Path to the saved context file
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function saveHealingContext(context, filename) {
  if (!fs.existsSync(CONTEXT_DIR)) {
    fs.mkdirSync(CONTEXT_DIR, { recursive: true });
  }

  const safeName = (filename || context.testName || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '_');
  const filePath = path.join(CONTEXT_DIR, `${safeName}.context.json`);

  fs.writeFileSync(filePath, JSON.stringify(context, null, 2), 'utf-8');
  return filePath;
}

/**
 * Load all pending healing context files.
 *
 * @returns {object[]} Array of { filePath, context } objects
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function loadAllContexts() {
  if (!fs.existsSync(CONTEXT_DIR)) return [];

  return fs.readdirSync(CONTEXT_DIR)
    .filter((f) => f.endsWith('.context.json'))
    .map((f) => {
      const filePath = path.join(CONTEXT_DIR, f);
      const context = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return { filePath, context };
    });
}

export { classifyError, extractLocatorFromError };
