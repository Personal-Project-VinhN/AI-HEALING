import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.join(__dirname, '..', 'healing-reports');
const CONTEXT_DIR = path.join(__dirname, '..', 'healing-context');

/**
 * Generate healing reports after Cursor Agent has fixed locators.
 * Compares the original failure context with the current locator files
 * to document what was changed.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

/**
 * Read current locator values from source files.
 *
 * @returns {Promise<object>} Map of { exportName.key: selector }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function readCurrentLocators() {
  const locatorDir = path.join(__dirname, '..', 'locators');
  const files = fs.readdirSync(locatorDir).filter((f) => f.endsWith('.locators.js'));
  const result = {};

  for (const file of files) {
    const filePath = path.join(locatorDir, file);
    const timestamp = Date.now();
    const mod = await import(`file://${filePath.replace(/\\/g, '/')}?t=${timestamp}`);

    for (const exportName of Object.keys(mod)) {
      const locatorMap = mod[exportName];
      if (typeof locatorMap !== 'object') continue;

      for (const [key, selector] of Object.entries(locatorMap)) {
        result[`${exportName}.${key}`] = selector;
      }
    }
  }
  return result;
}

/**
 * Generate a JSON report comparing old vs new locators.
 *
 * @param {object} [options]
 * @param {string} [options.verifyResult] - 'pass' or 'fail' from re-run
 * @returns {Promise<object>} Report data
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function generateJsonReport(options = {}) {
  const { verifyResult = 'unknown' } = options;

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const contextFiles = fs.existsSync(CONTEXT_DIR)
    ? fs.readdirSync(CONTEXT_DIR).filter((f) => f.endsWith('.context.json'))
    : [];

  if (contextFiles.length === 0) {
    console.log('  No healing context files found. Nothing to report.');
    return null;
  }

  const currentLocators = await readCurrentLocators();
  const changes = [];

  for (const file of contextFiles) {
    const context = JSON.parse(fs.readFileSync(path.join(CONTEXT_DIR, file), 'utf-8'));
    if (!context.locatorSource) continue;

    const locatorKey = `${context.locatorSource.exportName}.${context.locatorSource.key}`;
    const oldSelector = context.failedLocator;
    const newSelector = currentLocators[locatorKey] || 'NOT_FOUND';
    const changed = oldSelector !== newSelector;

    changes.push({
      testName: context.testName,
      locatorKey,
      locatorFile: context.locatorSource.file,
      oldSelector,
      newSelector,
      changed,
      profileFile: context.profile?._profileFile || null,
      profileKey: context.profile ? `${context.profile._exportName}.${context.profile._profileKey}` : null,
    });
  }

  const report = {
    timestamp: new Date().toISOString(),
    verifyResult,
    totalFailures: contextFiles.length,
    totalChanges: changes.filter((c) => c.changed).length,
    unchangedCount: changes.filter((c) => !c.changed).length,
    changes,
  };

  const reportPath = path.join(REPORT_DIR, `healing-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  return report;
}

/**
 * Generate a Markdown report for human readability.
 *
 * @param {object} jsonReport - Report data from generateJsonReport
 * @returns {string} Path to the saved markdown file
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function generateMarkdownReport(jsonReport) {
  if (!jsonReport) return null;

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const lines = [];
  lines.push('# Self-Healing Report');
  lines.push('');
  lines.push(`**Generated:** ${jsonReport.timestamp}`);
  lines.push(`**Verify result:** ${jsonReport.verifyResult}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total failures | ${jsonReport.totalFailures} |`);
  lines.push(`| Locators fixed | ${jsonReport.totalChanges} |`);
  lines.push(`| Unchanged | ${jsonReport.unchangedCount} |`);
  lines.push('');

  if (jsonReport.changes.length > 0) {
    lines.push('## Locator Changes');
    lines.push('');
    lines.push('| Test | Locator Key | Old Selector | New Selector | Status |');
    lines.push('|------|-------------|-------------|-------------|--------|');

    for (const c of jsonReport.changes) {
      const status = c.changed ? 'FIXED' : 'UNCHANGED';
      lines.push(`| ${c.testName} | \`${c.locatorKey}\` | \`${c.oldSelector}\` | \`${c.newSelector}\` | ${status} |`);
    }
    lines.push('');
  }

  if (jsonReport.changes.some((c) => c.changed)) {
    lines.push('## Files Modified');
    lines.push('');
    const files = new Set();
    for (const c of jsonReport.changes.filter((c) => c.changed)) {
      files.add(c.locatorFile);
      if (c.profileFile) files.add(`profiles/${c.profileFile}`);
    }
    for (const f of files) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  const md = lines.join('\n');
  const mdPath = path.join(REPORT_DIR, `healing-report-${Date.now()}.md`);
  fs.writeFileSync(mdPath, md, 'utf-8');

  return mdPath;
}

/**
 * Print report summary to console.
 *
 * @param {object} report - Report data from generateJsonReport
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function printReportSummary(report) {
  if (!report) {
    console.log('  No report data available.');
    return;
  }

  console.log('\n  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║          SELF-HEALING REPORT                       ║');
  console.log('  ╠═══════════════════════════════════════════════════╣');
  console.log(`  ║  Verify result:    ${report.verifyResult.padEnd(8)}                    ║`);
  console.log(`  ║  Total failures:   ${String(report.totalFailures).padStart(4)}                        ║`);
  console.log(`  ║  Locators fixed:   ${String(report.totalChanges).padStart(4)}                        ║`);
  console.log(`  ║  Unchanged:        ${String(report.unchangedCount).padStart(4)}                        ║`);
  console.log('  ╠═══════════════════════════════════════════════════╣');

  for (const c of report.changes) {
    const icon = c.changed ? '✅' : '⚠️';
    console.log(`  ║  ${icon} ${c.locatorKey.padEnd(30)}               ║`);
    if (c.changed) {
      console.log(`  ║     ${c.oldSelector} => ${c.newSelector}`.padEnd(54) + '║');
    }
  }
  console.log('  ╚═══════════════════════════════════════════════════╝');
}

/**
 * Clean up healing context files after successful healing.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function cleanupContextFiles() {
  if (!fs.existsSync(CONTEXT_DIR)) return;

  const files = fs.readdirSync(CONTEXT_DIR);
  for (const file of files) {
    fs.unlinkSync(path.join(CONTEXT_DIR, file));
  }

  const snapshotDir = path.join(CONTEXT_DIR, 'snapshots');
  if (fs.existsSync(snapshotDir)) {
    const snapshots = fs.readdirSync(snapshotDir);
    for (const s of snapshots) {
      fs.unlinkSync(path.join(snapshotDir, s));
    }
  }

  console.log('  🧹 Cleaned up healing context files.');
}
