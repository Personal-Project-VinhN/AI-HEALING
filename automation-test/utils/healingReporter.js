import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyError, extractLocatorFromError } from './contextBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTEXT_DIR = path.join(__dirname, '..', 'healing-context');

/**
 * Playwright Custom Reporter that captures test failures,
 * detects locator errors, and writes healing context files
 * for Cursor Agent to analyze.
 *
 * Usage in playwright.config.js:
 *   reporter: [['./utils/healingReporter.js'], ['list']]
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
class HealingReporter {
  constructor() {
    this.failures = [];
    this.startTime = null;
  }

  onBegin(config, suite) {
    this.startTime = Date.now();
    this.failures = [];

    if (!fs.existsSync(CONTEXT_DIR)) {
      fs.mkdirSync(CONTEXT_DIR, { recursive: true });
    }

    console.log('\n  ╔═══════════════════════════════════════════════════╗');
    console.log('  ║  CURSOR SELF-HEALING REPORTER - ACTIVE            ║');
    console.log('  ╚═══════════════════════════════════════════════════╝\n');
  }

  onTestEnd(test, result) {
    if (result.status !== 'failed') return;

    const errorMessage = result.error?.message || '';
    const stackTrace = result.error?.stack || '';
    const fullText = `${errorMessage}\n${stackTrace}`;

    const classification = classifyError(fullText);
    const failedLocator = extractLocatorFromError(fullText);

    const isLocatorRelated = classification.isLocatorError || !!failedLocator;

    const failure = {
      testName: test.title,
      testFile: test.location?.file || '',
      testLine: test.location?.line || 0,
      errorType: classification.type,
      isLocatorError: isLocatorRelated,
      failedLocator,
      errorMessage: errorMessage.substring(0, 2000),
      stackTrace: stackTrace.substring(0, 3000),
      duration: result.duration,
    };

    this.failures.push(failure);

    if (isLocatorRelated) {
      console.log(`\n  ⚠️  [Healing] LOCATOR ERROR detected in: "${test.title}"`);
      console.log(`      Locator: ${failedLocator || 'unknown'}`);
      console.log(`      Type: ${classification.type}`);
    }
  }

  onEnd(result) {
    const elapsed = Date.now() - this.startTime;
    const locatorFailures = this.failures.filter((f) => f.isLocatorError);

    if (this.failures.length === 0) {
      console.log('\n  ✅ All tests passed. No healing needed.\n');
      return;
    }

    const summaryPath = path.join(CONTEXT_DIR, '_failure-summary.json');
    const summary = {
      timestamp: new Date().toISOString(),
      totalDuration: elapsed,
      totalTests: result.suite?.allTests()?.length || 0,
      totalFailures: this.failures.length,
      locatorFailures: locatorFailures.length,
      otherFailures: this.failures.length - locatorFailures.length,
      failures: this.failures,
    };

    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

    console.log('\n  ╔═══════════════════════════════════════════════════╗');
    console.log('  ║          HEALING REPORTER - FAILURE SUMMARY        ║');
    console.log('  ╠═══════════════════════════════════════════════════╣');
    console.log(`  ║  Total failures:    ${String(this.failures.length).padStart(4)}                        ║`);
    console.log(`  ║  Locator errors:    ${String(locatorFailures.length).padStart(4)}  (healable)            ║`);
    console.log(`  ║  Other errors:      ${String(this.failures.length - locatorFailures.length).padStart(4)}                        ║`);
    console.log('  ╚═══════════════════════════════════════════════════╝');

    if (locatorFailures.length > 0) {
      console.log('\n  Locator failures that need healing:');
      for (const f of locatorFailures) {
        console.log(`    - "${f.testName}" => locator: ${f.failedLocator || 'unknown'}`);
      }
      console.log(`\n  📂 Summary saved to: ${summaryPath}`);
      console.log('  💡 Run "npm run heal" to generate full context for Cursor Agent.');
    }
  }
}

export default HealingReporter;
