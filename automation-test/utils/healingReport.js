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
  const { verifyResult = 'unknown', fixResult = null } = options;

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

  const healingMethod = fixResult?.healingMethod || 'rule-based';

  const report = {
    timestamp: new Date().toISOString(),
    healingMethod,
    verifyResult,
    totalFailures: contextFiles.length,
    totalChanges: changes.filter((c) => c.changed).length,
    unchangedCount: changes.filter((c) => !c.changed).length,
    changes,
    fixDetails: fixResult ? {
      totalProcessed: fixResult.totalProcessed,
      totalFixed: fixResult.totalFixed,
      totalFailed: fixResult.totalFailed ?? fixResult.totalSkipped ?? 0,
      healingMethod,
      fixes: (fixResult.fixes || []).map((f) => ({
        locatorKey: f.locatorKey,
        failedLocator: f.failedLocator,
        newSelector: f.newSelector || null,
        confidence: f.confidence || null,
        score: f.score || null,
        reasoning: f.reasoning || null,
        status: f.status,
        patchedFiles: f.patchedFiles || null,
        agentSuccess: f.agentSuccess ?? null,
        agentOutput: f.agentOutput ? f.agentOutput.substring(0, 500) : null,
        durationMs: f.durationMs || null,
        prompt: f.prompt ? f.prompt.substring(0, 300) : null,
      })),
    } : null,
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
  lines.push('# AI Self-Healing Report');
  lines.push('');
  lines.push(`**Generated:** ${jsonReport.timestamp}`);
  lines.push(`**Healing method:** ${jsonReport.healingMethod || 'unknown'}`);
  lines.push(`**Verify result:** ${jsonReport.verifyResult}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Healing method | ${jsonReport.healingMethod || 'unknown'} |`);
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

  if (jsonReport.fixDetails) {
    const isCursorAgent = jsonReport.healingMethod === 'cursor-agent';
    lines.push(`## ${isCursorAgent ? 'Cursor Agent' : 'Auto-Fix'} Details`);
    lines.push('');

    if (isCursorAgent) {
      lines.push(`| Locator Key | Failed Selector | Status | Duration |`);
      lines.push(`|-------------|----------------|--------|----------|`);
      for (const f of jsonReport.fixDetails.fixes) {
        const duration = f.durationMs ? `${(f.durationMs / 1000).toFixed(1)}s` : 'N/A';
        lines.push(`| \`${f.locatorKey}\` | \`${f.failedLocator}\` | ${f.status} | ${duration} |`);
      }
    } else {
      lines.push(`| Locator Key | Old Selector | New Selector | Confidence | Score | Reasoning |`);
      lines.push(`|-------------|-------------|-------------|------------|-------|-----------|`);
      for (const f of jsonReport.fixDetails.fixes) {
        lines.push(`| \`${f.locatorKey}\` | \`${f.failedLocator}\` | \`${f.newSelector || 'N/A'}\` | ${f.confidence || 'N/A'} | ${f.score || 'N/A'} | ${f.reasoning || f.status} |`);
      }
    }
    lines.push('');

    if (isCursorAgent) {
      const agentFixes = jsonReport.fixDetails.fixes.filter((f) => f.prompt);
      if (agentFixes.length > 0) {
        lines.push('## Agent Prompts (excerpts)');
        lines.push('');
        for (const f of agentFixes) {
          lines.push(`### ${f.locatorKey}`);
          lines.push('');
          lines.push('```');
          lines.push(f.prompt || 'N/A');
          lines.push('```');
          lines.push('');
        }
      }
    }
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

  const method = report.healingMethod || 'unknown';
  console.log('\n  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║          AI SELF-HEALING REPORT                     ║');
  console.log('  ╠═══════════════════════════════════════════════════╣');
  console.log(`  ║  Healing method:   ${method.padEnd(8)}                    ║`);
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

  const snapshotDir = path.join(CONTEXT_DIR, 'snapshots');
  if (fs.existsSync(snapshotDir)) {
    const snapshots = fs.readdirSync(snapshotDir);
    for (const s of snapshots) {
      const sp = path.join(snapshotDir, s);
      if (fs.statSync(sp).isFile()) fs.unlinkSync(sp);
    }
    fs.rmdirSync(snapshotDir);
  }

  const files = fs.readdirSync(CONTEXT_DIR);
  for (const file of files) {
    const fp = path.join(CONTEXT_DIR, file);
    if (fs.statSync(fp).isFile()) fs.unlinkSync(fp);
  }

  console.log('  🧹 Cleaned up healing context files.');
}
