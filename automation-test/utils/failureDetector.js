/**
 * Failure Detector - Detects and classifies test failures.
 *
 * Analyzes Playwright errors to determine failure type:
 * - LOCATOR_FAILED: element not found / selector broken
 * - TIMEOUT: element exists but not visible in time
 * - ASSERTION_FAILED: element found but assertion mismatch
 * - NAVIGATION_ERROR: page load or URL issue
 * - UNKNOWN: unclassified error
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const FAILURE_TYPES = {
  LOCATOR_FAILED: 'LOCATOR_FAILED',
  TIMEOUT: 'TIMEOUT',
  ASSERTION_FAILED: 'ASSERTION_FAILED',
  NAVIGATION_ERROR: 'NAVIGATION_ERROR',
  UNKNOWN: 'UNKNOWN',
};

const LOCATOR_PATTERNS = [
  /locator\(.*\).*resolved to 0 elements/i,
  /waiting for locator.*to be visible/i,
  /selector resolved to hidden/i,
  /no element matches selector/i,
  /element not found/i,
  /Locator.*strict mode violation/i,
];

const TIMEOUT_PATTERNS = [
  /timeout \d+ms exceeded/i,
  /exceeded.*timeout/i,
  /page\.waitForSelector/i,
  /waitFor.*timeout/i,
  /element is not visible/i,
];

const ASSERTION_PATTERNS = [
  /expect\(.*\)\./i,
  /toBeVisible/i,
  /toContainText/i,
  /toHaveURL/i,
  /toHaveText/i,
  /received value/i,
  /expected.*but got/i,
];

const NAVIGATION_PATTERNS = [
  /ERR_CONNECTION_REFUSED/i,
  /net::ERR_/i,
  /navigation.*failed/i,
  /page\.goto/i,
];

/**
 * Detect and classify a test failure from error info.
 *
 * @param {Error|string} error - The error object or message
 * @param {object} [context] - Optional context with step, locator info
 * @returns {object} Classified failure with type, isHealable, and details
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function detectFailure(error, context = {}) {
  const errorMessage = typeof error === 'string' ? error : (error?.message || '');
  const stackTrace = typeof error === 'object' ? (error?.stack || '') : '';

  const failureType = classifyError(errorMessage, stackTrace);
  const locatorInfo = extractLocatorFromError(errorMessage, stackTrace);
  const isHealable = failureType === FAILURE_TYPES.LOCATOR_FAILED ||
    failureType === FAILURE_TYPES.TIMEOUT;

  return {
    type: failureType,
    isHealable,
    errorMessage,
    stackTrace,
    locator: locatorInfo || context.locator || null,
    testName: context.testName || null,
    stepDescription: context.stepDescription || null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Classify error message into a failure type.
 *
 * @param {string} message
 * @param {string} stack
 * @returns {string} One of FAILURE_TYPES values
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function classifyError(message, stack) {
  const combined = `${message}\n${stack}`;

  for (const pattern of LOCATOR_PATTERNS) {
    if (pattern.test(combined)) return FAILURE_TYPES.LOCATOR_FAILED;
  }

  for (const pattern of NAVIGATION_PATTERNS) {
    if (pattern.test(combined)) return FAILURE_TYPES.NAVIGATION_ERROR;
  }

  for (const pattern of ASSERTION_PATTERNS) {
    if (pattern.test(combined)) return FAILURE_TYPES.ASSERTION_FAILED;
  }

  for (const pattern of TIMEOUT_PATTERNS) {
    if (pattern.test(combined)) return FAILURE_TYPES.TIMEOUT;
  }

  return FAILURE_TYPES.UNKNOWN;
}

/**
 * Extract the failing locator string from error message or stack.
 *
 * @param {string} message
 * @param {string} stack
 * @returns {string|null}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function extractLocatorFromError(message, stack) {
  const combined = `${message}\n${stack}`;

  const patterns = [
    /locator\('([^']+)'\)/,
    /selector "([^"]+)"/,
    /locator "([^"]+)"/,
    /waiting for locator\('([^']+)'\)/,
    /"(#[a-zA-Z][\w-]*)"/,
    /"(\[data-testid="[^"]+"\])"/,
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match) return match[1];
  }

  return null;
}

export { FAILURE_TYPES };
