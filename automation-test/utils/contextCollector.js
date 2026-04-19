import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = path.join(__dirname, '..', 'repair-reports', 'snapshots');

/**
 * Context Collector - Gathers runtime context when a test fails.
 *
 * Captures everything the AI needs to understand and fix the failure:
 * - Screenshot of the page at failure time
 * - DOM snapshot (full HTML)
 * - Error message and stack trace
 * - Current URL
 * - Failing locator
 * - Code snippet around the failing step
 * - Element profile (if available)
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

/**
 * Ensure the snapshots directory exists.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function ensureSnapshotsDir() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
}

/**
 * Capture a screenshot from the Playwright page.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testName
 * @returns {Promise<string|null>} Path to saved screenshot
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function captureScreenshot(page, testName) {
  try {
    ensureSnapshotsDir();
    const filename = `${sanitizeFilename(testName)}-${Date.now()}.png`;
    const filePath = path.join(SNAPSHOTS_DIR, filename);
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  } catch (error) {
    console.error(`  [ContextCollector] Screenshot failed: ${error.message}`);
    return null;
  }
}

/**
 * Capture the full DOM HTML snapshot.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>} HTML content
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function captureDomSnapshot(page) {
  try {
    const html = await page.content();
    return html.substring(0, 50000);
  } catch (error) {
    console.error(`  [ContextCollector] DOM snapshot failed: ${error.message}`);
    return '';
  }
}

/**
 * Save DOM snapshot to file for reference.
 *
 * @param {string} html
 * @param {string} testName
 * @returns {string|null} Path to saved file
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function saveDomSnapshot(html, testName) {
  try {
    ensureSnapshotsDir();
    const filename = `${sanitizeFilename(testName)}-${Date.now()}.html`;
    const filePath = path.join(SNAPSHOTS_DIR, filename);
    fs.writeFileSync(filePath, html, 'utf-8');
    return filePath;
  } catch (error) {
    console.error(`  [ContextCollector] DOM save failed: ${error.message}`);
    return null;
  }
}

/**
 * Extract the code snippet around the failing line from the test file.
 *
 * @param {string} stackTrace
 * @param {number} contextLines - Lines before/after to include
 * @returns {object|null} { filePath, lineNumber, snippet }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function extractCodeSnippet(stackTrace, contextLines = 5) {
  if (!stackTrace) return null;

  const specFilePattern = /at\s+.*?[/\\](tests[/\\].*?\.spec\.js):(\d+):(\d+)/;
  const match = stackTrace.match(specFilePattern);
  if (!match) return null;

  const relativePath = match[1];
  const lineNumber = parseInt(match[2], 10);
  const testDir = path.join(__dirname, '..');
  const filePath = path.join(testDir, relativePath);

  try {
    if (!fs.existsSync(filePath)) return null;

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const start = Math.max(0, lineNumber - contextLines - 1);
    const end = Math.min(lines.length, lineNumber + contextLines);

    const snippet = lines.slice(start, end).map((line, i) => {
      const num = start + i + 1;
      const marker = num === lineNumber ? ' >>>' : '    ';
      return `${marker} ${String(num).padStart(4)}| ${line}`;
    }).join('\n');

    return { filePath, lineNumber, snippet, fullContent: lines.join('\n') };
  } catch {
    return null;
  }
}

/**
 * Collect full runtime context for AI analysis.
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {object} failureInfo - From failureDetector
 * @param {object} [profile] - Element profile if available
 * @returns {Promise<object>} Complete context for prompt building
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function collectContext(page, failureInfo, profile = null) {
  console.log(`  [ContextCollector] Gathering failure context...`);

  const currentUrl = page.url();
  const [screenshotPath, domHtml] = await Promise.all([
    captureScreenshot(page, failureInfo.testName || 'unknown'),
    captureDomSnapshot(page),
  ]);

  const domSnapshotPath = domHtml ? saveDomSnapshot(domHtml, failureInfo.testName || 'unknown') : null;
  const codeInfo = extractCodeSnippet(failureInfo.stackTrace);

  const context = {
    testName: failureInfo.testName,
    stepDescription: failureInfo.stepDescription,
    failureType: failureInfo.type,
    errorMessage: failureInfo.errorMessage,
    currentUrl,
    screenshotPath,
    domSnapshotPath,
    domHtml: truncateDom(domHtml),
    oldLocator: failureInfo.locator || profile?.selector || null,
    codeSnippet: codeInfo?.snippet || null,
    codeFilePath: codeInfo?.filePath || null,
    codeLineNumber: codeInfo?.lineNumber || null,
    codeFullContent: codeInfo?.fullContent || null,
    elementProfile: profile ? {
      logicalName: profile.logicalName,
      page: profile.page,
      actionType: profile.actionType,
      selector: profile.selector,
      tag: profile.tag,
      role: profile.role,
      text: profile.text,
      label: profile.label,
      placeholder: profile.placeholder,
      nearbyText: profile.nearbyText,
      attributes: profile.attributes,
    } : null,
    collectedAt: new Date().toISOString(),
  };

  console.log(`  [ContextCollector] Context collected:`);
  console.log(`    - URL: ${currentUrl}`);
  console.log(`    - Screenshot: ${screenshotPath ? 'captured' : 'failed'}`);
  console.log(`    - DOM: ${domHtml ? `${domHtml.length} chars` : 'failed'}`);
  console.log(`    - Code: ${codeInfo ? `${codeInfo.filePath}:${codeInfo.lineNumber}` : 'not found'}`);
  console.log(`    - Profile: ${profile ? profile.logicalName : 'none'}`);

  return context;
}

/**
 * Truncate DOM HTML to a reasonable size for AI prompt.
 * Keeps the body content and strips excessive whitespace.
 *
 * @param {string} html
 * @param {number} maxLen
 * @returns {string}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function truncateDom(html, maxLen = 15000) {
  if (!html) return '';

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  const cleaned = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.length > maxLen
    ? cleaned.substring(0, maxLen) + '\n<!-- ... truncated ... -->'
    : cleaned;
}

/**
 * Replace non-alphanumeric chars with dashes for safe filenames.
 *
 * @param {string} name
 * @returns {string}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9-_]/g, '-').substring(0, 80);
}

export { extractCodeSnippet, captureScreenshot, captureDomSnapshot };
