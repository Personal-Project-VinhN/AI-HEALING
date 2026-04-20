import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTEXT_DIR = path.join(__dirname, 'healing-context');
const MAIN_APP_DIR = path.join(__dirname, '..', 'main-app');

/**
 * Self-Healing orchestrator.
 *
 * Automated flow:
 *   0. (Optional) Generate locators from profiles + DOM if missing
 *   1. Start app server
 *   2. Run tests (expect FAIL with broken locators)
 *   3. Collect DOM context for each broken locator
 *   4. Cursor Agent CLI heals locator/profile files
 *   5. Re-run tests (expect PASS)
 *   6. Generate report with all changes
 *
 * Commands:
 *   node run-healing.js              - Full auto flow (Cursor Agent)
 *   node run-healing.js generate     - Generate locators from profiles + DOM
 *   node run-healing.js collect      - Only collect DOM context
 *   node run-healing.js fix-rule     - Rule-based auto-fix (no LLM)
 *   node run-healing.js report       - Generate report
 *   node run-healing.js clean        - Clean context files
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const PORT = 3001;

/**
 * Check if port is in use.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

/**
 * Wait until port responds.
 *
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortInUse(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Start main-app dev server.
 *
 * @returns {Promise<import('child_process').ChildProcess|null>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function startServer() {
  if (await isPortInUse(PORT)) {
    console.log(`  ✅ Server already running on port ${PORT}`);
    return null;
  }

  console.log(`  🚀 Starting main-app on port ${PORT}...`);
  const child = spawn('npm', ['run', 'dev'], {
    cwd: MAIN_APP_DIR,
    shell: true,
    stdio: 'pipe',
    detached: false,
  });

  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});

  const ready = await waitForPort(PORT);
  if (!ready) {
    console.log('  ❌ Server failed to start within 30s');
    child.kill();
    return null;
  }

  console.log(`  ✅ Server ready on port ${PORT}`);
  return child;
}

/**
 * Stop server process.
 *
 * @param {import('child_process').ChildProcess|null} child
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function stopServer(child) {
  if (!child) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
  }
  console.log('  🛑 Server stopped');
}

/**
 * Run a shell command with formatted output.
 *
 * @param {string} cmd
 * @param {string} description
 * @param {boolean} [allowFail]
 * @returns {{ success: boolean, exitCode?: number }}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function runCommand(cmd, description, allowFail = false) {
  console.log(`\n  ──── ${description} ────`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: __dirname });
    return { success: true };
  } catch (error) {
    if (allowFail) return { success: false, exitCode: error.status };
    return { success: false, exitCode: error.status };
  }
}

function banner(text) {
  const line = '═'.repeat(60);
  console.log(`\n  ╔${line}╗`);
  console.log(`  ║  ${text.padEnd(58)}║`);
  console.log(`  ╚${line}╝`);
}

function phase(num, title) {
  console.log(`\n  ── STEP ${num}: ${title} ──`);
}

/**
 * Clear old context files.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function clearContext() {
  if (!fs.existsSync(CONTEXT_DIR)) return;
  const files = fs.readdirSync(CONTEXT_DIR).filter((f) => f.endsWith('.json'));
  for (const f of files) fs.unlinkSync(path.join(CONTEXT_DIR, f));
}

/**
 * Run tests against the running app.
 *
 * @returns {{ success: boolean }}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function runTests() {
  return runCommand(
    'npx playwright test tests/traditional/ --reporter=list',
    'Running tests...',
    true
  );
}

/**
 * Run tests with healing reporter to capture failures.
 *
 * @returns {{ success: boolean }}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function runTestsWithReporter() {
  return runCommand(
    'npx playwright test tests/traditional/ --reporter=./utils/healingReporter.js,list',
    'Running tests (with failure detection)...',
    true
  );
}

/**
 * Collect DOM context for broken locators.
 *
 * @returns {Promise<object>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function collectContexts() {
  const { collectAllContexts } = await import('./utils/cursorHealing.js');
  return collectAllContexts();
}

/**
 * Heal locators using Cursor Agent CLI (LLM-powered).
 *
 * @returns {Promise<object>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function cursorAgentHeal() {
  const { cursorAgentHeal: heal } = await import('./utils/cursorAgentHealer.js');
  return heal();
}

/**
 * Rule-based auto-fix (fallback, no LLM).
 *
 * @returns {Promise<object>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function autoFixRule() {
  const { runAutoFix } = await import('./utils/autoFix.js');
  return runAutoFix();
}

/**
 * Generate locators from profiles by scanning the live DOM.
 *
 * @returns {Promise<object>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function generateLocatorsFromProfiles() {
  const { generateLocators } = await import('./utils/locatorGenerator.js');
  return generateLocators({ port: PORT });
}

/**
 * Generate healing report.
 *
 * @param {string} verifyResult
 * @param {object} [fixResult]
 * @returns {Promise<void>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function generateReport(verifyResult = 'unknown', fixResult = null) {
  const { generateJsonReport, generateMarkdownReport, printReportSummary } =
    await import('./utils/healingReport.js');

  const jsonReport = await generateJsonReport({ verifyResult, fixResult });
  if (jsonReport) {
    const mdPath = generateMarkdownReport(jsonReport);
    printReportSummary(jsonReport);
    if (mdPath) console.log(`\n  📄 Report: ${mdPath}`);
  }
}

/**
 * Clean up context files.
 *
 * @returns {Promise<void>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function cleanUp() {
  const { cleanupContextFiles } = await import('./utils/healingReport.js');
  cleanupContextFiles();
}

/**
 * Full automated self-healing flow.
 *
 * @returns {Promise<void>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function runHealing() {
  banner('AI SELF-HEALING AUTOMATION');
  console.log('  Flow: Run Tests → Fail → Collect → Cursor Agent Heal → Verify → Report\n');

  const server = await startServer();

  try {
    const { hasLocatorFiles } = await import('./utils/locatorGenerator.js');
    if (!hasLocatorFiles()) {
      phase(0, 'Generate locators from profiles + DOM');
      await generateLocatorsFromProfiles();
    }

    phase(1, 'Run tests');
    clearContext();
    const testResult = runTestsWithReporter();

    if (testResult.success) {
      console.log('\n  ✅ All tests passed. No healing needed.');
      return;
    }
    console.log('\n  ❌ Tests failed — starting AI self-healing...');

    phase(2, 'Collect DOM context for broken locators');
    const collectResult = await collectContexts();

    if (!collectResult || collectResult.healed === 0) {
      console.log('\n  ⚠️  No broken locators detected. Failures may be non-locator issues.');
      return;
    }

    phase(3, 'Cursor Agent healing (LLM-powered)');
    const fixResult = await cursorAgentHeal();
    let verifySuccess = false;

    if (fixResult.totalFixed === 0) {
      console.log('\n  ⚠️  Cursor Agent could not fix locators.');
      if (fixResult.error === 'Agent CLI not available') {
        console.log('  💡 Tip: Use "npm run heal:fix-rule" for rule-based fallback.');
      }
    } else {
      phase(4, 'Verify fixes');
      const verifyResult = runTests();
      verifySuccess = verifyResult.success;

      if (verifySuccess) {
        console.log('\n  ✅ All tests passed after AI healing!');
      } else {
        console.log('\n  ⚠️  Some tests still failing (may be non-locator issues).');
      }
    }

    phase(5, 'Generate report');
    await generateReport(verifySuccess ? 'PASS' : 'FAIL', fixResult);

    console.log('');
    if (verifySuccess) {
      banner('AI HEALING COMPLETE — ALL TESTS PASSING');
    } else {
      banner('AI HEALING INCOMPLETE — REVIEW NEEDED');
    }

    console.log('\n  Modified files:');
    console.log('    - locators/login.locators.js');
    console.log('    - locators/dashboard.locators.js');
    console.log('    - profiles/login.profiles.js');
    console.log('    - profiles/dashboard.profiles.js');
    console.log('\n  Reports: healing-reports/*.md\n');

  } finally {
    stopServer(server);
  }
}

// --- CLI ---
const command = process.argv[2] || 'default';

switch (command) {
  case 'generate':
    (async () => {
      const s = await startServer();
      try { await generateLocatorsFromProfiles(); } finally { stopServer(s); }
    })();
    break;
  case 'collect':
    (async () => {
      const s = await startServer();
      try { await collectContexts(); } finally { stopServer(s); }
    })();
    break;
  case 'fix-rule':
    autoFixRule();
    break;
  case 'report':
    generateReport(process.argv[3] || 'unknown');
    break;
  case 'clean':
    cleanUp();
    break;
  default:
    runHealing();
    break;
}
