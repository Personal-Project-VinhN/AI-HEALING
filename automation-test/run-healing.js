import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTEXT_DIR = path.join(__dirname, 'healing-context');

/**
 * Main orchestration script for the Cursor Self-Healing flow.
 *
 * Commands:
 *   node run-healing.js              - Full flow: test V2 -> collect context -> instructions
 *   node run-healing.js collect      - Only collect DOM context (skip test run)
 *   node run-healing.js report       - Generate report after Cursor fixes
 *   node run-healing.js clean        - Clean up context files
 *   node run-healing.js demo         - Full demo: V1 pass -> V2 fail -> context -> instructions
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const DIVIDER = '═'.repeat(62);

function runCommand(cmd, description, allowFail = false) {
  console.log(`\n  ${DIVIDER}`);
  console.log(`  ${description}`);
  console.log(`  ${DIVIDER}`);

  try {
    execSync(cmd, {
      stdio: 'inherit',
      env: { ...process.env },
      cwd: __dirname,
    });
    return { success: true };
  } catch (error) {
    if (!allowFail) {
      return { success: false, exitCode: error.status };
    }
    return { success: false, exitCode: error.status, expected: true };
  }
}

async function runTestsV2() {
  console.log('\n');
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║                                                              ║');
  console.log('  ║   CURSOR SELF-HEALING - STEP 1: Run Tests on V2             ║');
  console.log('  ║                                                              ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');

  if (fs.existsSync(CONTEXT_DIR)) {
    const files = fs.readdirSync(CONTEXT_DIR).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      fs.unlinkSync(path.join(CONTEXT_DIR, f));
    }
  }

  const result = runCommand(
    'npx cross-env UI_VERSION=2 npx playwright test tests/traditional/ --reporter=./utils/healingReporter.js,list',
    '  Running tests with V2 UI (locators expected to fail)...',
    true
  );

  return result;
}

async function collectContexts() {
  console.log('\n');
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║                                                              ║');
  console.log('  ║   CURSOR SELF-HEALING - STEP 2: Collect DOM Context          ║');
  console.log('  ║                                                              ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');

  const { collectAllContexts } = await import('./utils/cursorHealing.js');
  const result = await collectAllContexts();
  return result;
}

async function generateReport(verifyResult = 'unknown') {
  console.log('\n');
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║                                                              ║');
  console.log('  ║   CURSOR SELF-HEALING - Generate Report                      ║');
  console.log('  ║                                                              ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');

  const { generateJsonReport, generateMarkdownReport, printReportSummary } = await import('./utils/healingReport.js');
  const jsonReport = await generateJsonReport({ verifyResult });
  if (jsonReport) {
    const mdPath = generateMarkdownReport(jsonReport);
    printReportSummary(jsonReport);
    if (mdPath) {
      console.log(`\n  📄 Markdown report: ${mdPath}`);
    }
  }
}

async function cleanUp() {
  const { cleanupContextFiles } = await import('./utils/healingReport.js');
  cleanupContextFiles();
}

async function runDemo() {
  console.log('\n');
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║                                                              ║');
  console.log('  ║   CURSOR SELF-HEALING DEMO                                  ║');
  console.log('  ║   Demonstrates: V1 pass -> V2 fail -> Context -> Fix        ║');
  console.log('  ║                                                              ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');

  console.log('\n  ── PHASE 1: Verify V1 tests pass ──');
  const v1Result = runCommand(
    'npx cross-env UI_VERSION=1 npx playwright test tests/traditional/ --reporter=list',
    '  V1 UI + Traditional Tests (expect: ALL PASS)',
    false
  );

  if (!v1Result.success) {
    console.log('\n  ❌ V1 tests failed! Tests themselves have issues. Fix tests first.');
    return;
  }
  console.log('\n  ✅ V1 tests all passed. Tests are correct.\n');

  console.log('\n  ── PHASE 2: Run V2 tests (expect failures) ──');
  await runTestsV2();

  console.log('\n  ── PHASE 3: Collect DOM context for failures ──');
  await collectContexts();

  console.log('\n  ── NEXT STEPS ──');
  console.log('  1. Copy the prompt above into Cursor Agent chat');
  console.log('  2. Let Cursor Agent analyze context and fix locators');
  console.log('  3. Run: npm run test:v2');
  console.log('  4. If all pass, run: npm run report:healing');
  console.log('');
}

const command = process.argv[2] || 'default';

switch (command) {
  case 'collect':
    collectContexts();
    break;
  case 'report':
    generateReport(process.argv[3] || 'unknown');
    break;
  case 'clean':
    cleanUp();
    break;
  case 'demo':
    runDemo();
    break;
  default:
    (async () => {
      await runTestsV2();
      await collectContexts();
    })();
    break;
}
