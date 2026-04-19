import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { historyStore } from './historyStore.js';
import governance from '../config/governance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.join(__dirname, '..', governance.reporting.outputDir);

/**
 * Report Generator - Creates JSON and Markdown reports for self-repair sessions.
 *
 * Reports include:
 * - Test name, failing step
 * - Original locator, new locator
 * - Screenshot and DOM snapshot paths
 * - Number of attempts
 * - Each fix that was tried
 * - Final outcome
 * - Files modified
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

/**
 * Generate both JSON and Markdown reports for a repair session.
 *
 * @param {object} sessionResult - From selfHealingLoop or runWithHealing
 * @param {object} [context] - From contextCollector (optional, for richer reports)
 * @returns {object} { jsonPath, markdownPath }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function generateReport(sessionResult, context = null) {
  ensureReportDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const testSlug = sanitize(sessionResult.testName || 'unknown');

  const reportData = buildReportData(sessionResult, context);

  let jsonPath = null;
  let markdownPath = null;

  if (governance.reporting.generateJson) {
    jsonPath = path.join(REPORT_DIR, `${testSlug}-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), 'utf-8');
    console.log(`  [Report] JSON report saved: ${path.basename(jsonPath)}`);
  }

  if (governance.reporting.generateMarkdown) {
    markdownPath = path.join(REPORT_DIR, `${testSlug}-${timestamp}.md`);
    const markdown = buildMarkdownReport(reportData);
    fs.writeFileSync(markdownPath, markdown, 'utf-8');
    console.log(`  [Report] Markdown report saved: ${path.basename(markdownPath)}`);
  }

  return { jsonPath, markdownPath, reportData };
}

/**
 * Build structured report data from session results.
 *
 * @param {object} sessionResult
 * @param {object} [context]
 * @returns {object}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function buildReportData(sessionResult, context) {
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'AI-Driven Self-Healing Report Generator v1.0',
    },
    summary: {
      testName: sessionResult.testName || 'unknown',
      success: sessionResult.success,
      totalAttempts: sessionResult.attempts || 0,
      totalSteps: sessionResult.totalSteps || 1,
      completedSteps: sessionResult.completedSteps || (sessionResult.success ? 1 : 0),
    },
    failure: context ? {
      type: context.failureType,
      errorMessage: context.errorMessage,
      url: context.currentUrl,
      oldLocator: context.oldLocator,
      screenshotPath: context.screenshotPath,
      domSnapshotPath: context.domSnapshotPath,
      codeFile: context.codeFilePath,
      codeLine: context.codeLineNumber,
    } : null,
    attempts: [],
    filesModified: [],
    historyStats: historyStore.getStats(),
  };

  if (sessionResult.repairs) {
    report.attempts = sessionResult.repairs.map((a) => ({
      attemptNumber: a.attemptNumber,
      fixType: a.suggestion?.fixType || 'unknown',
      newLocator: a.suggestion?.newLocator || a.newLocator || null,
      confidence: a.suggestion?.confidence || 0,
      reasoning: a.suggestion?.reasoning || '',
      applied: a.applied,
      testPassed: a.testPassed,
      failureReason: a.failureReason || null,
      changes: a.changes || [],
    }));

    const modifiedFiles = new Set();
    for (const a of sessionResult.repairs) {
      if (a.applied && a.changes) {
        for (const c of a.changes) {
          if (c.filePath) modifiedFiles.add(c.filePath);
        }
      }
    }
    report.filesModified = [...modifiedFiles];
  }

  if (sessionResult.results) {
    report.steps = sessionResult.results.map((r) => ({
      step: r.step,
      success: r.success,
      attempts: r.attempts || 0,
      reason: r.reason || null,
    }));
  }

  if (sessionResult.finalFix) {
    report.finalFix = {
      fixType: sessionResult.finalFix.fixType,
      newLocator: sessionResult.finalFix.newLocator,
      confidence: sessionResult.finalFix.confidence,
      reasoning: sessionResult.finalFix.reasoning,
      source: sessionResult.finalFix.source,
    };
    if (sessionResult.filePath) {
      report.filesModified.push(sessionResult.filePath);
    }
  }

  report.filesModified = [...new Set(report.filesModified)];

  return report;
}

/**
 * Build a Markdown report from report data.
 *
 * @param {object} data
 * @returns {string}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function buildMarkdownReport(data) {
  const lines = [];

  lines.push(`# Self-Healing Repair Report`);
  lines.push('');
  lines.push(`**Generated:** ${data.meta.generatedAt}`);
  lines.push(`**Test:** ${data.summary.testName}`);
  lines.push(`**Result:** ${data.summary.success ? 'PASSED (after repair)' : 'FAILED'}`);
  lines.push(`**Total Attempts:** ${data.summary.totalAttempts}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| Test Name | ${data.summary.testName} |`);
  lines.push(`| Success | ${data.summary.success ? 'Yes' : 'No'} |`);
  lines.push(`| Attempts | ${data.summary.totalAttempts} |`);
  lines.push(`| Steps | ${data.summary.completedSteps}/${data.summary.totalSteps} |`);
  lines.push('');

  if (data.failure) {
    lines.push('## Failure Details');
    lines.push('');
    lines.push(`- **Type:** ${data.failure.type}`);
    lines.push(`- **URL:** ${data.failure.url}`);
    lines.push(`- **Old Locator:** \`${data.failure.oldLocator}\``);
    if (data.failure.codeFile) {
      lines.push(`- **File:** ${data.failure.codeFile}:${data.failure.codeLine}`);
    }
    lines.push('');
    if (data.failure.errorMessage) {
      lines.push('### Error Message');
      lines.push('```');
      lines.push(data.failure.errorMessage.substring(0, 1000));
      lines.push('```');
      lines.push('');
    }
    if (data.failure.screenshotPath) {
      lines.push(`**Screenshot:** [${path.basename(data.failure.screenshotPath)}](${data.failure.screenshotPath})`);
      lines.push('');
    }
  }

  if (data.attempts.length > 0) {
    lines.push('## Repair Attempts');
    lines.push('');

    for (const a of data.attempts) {
      const icon = a.testPassed ? '✅' : '❌';
      lines.push(`### ${icon} Attempt ${a.attemptNumber}`);
      lines.push('');
      lines.push(`- **Fix Type:** ${a.fixType}`);
      lines.push(`- **New Locator:** \`${a.newLocator || 'N/A'}\``);
      lines.push(`- **Confidence:** ${(a.confidence * 100).toFixed(1)}%`);
      lines.push(`- **Applied:** ${a.applied ? 'Yes' : 'No'}`);
      lines.push(`- **Test Passed:** ${a.testPassed ? 'Yes' : 'No'}`);
      if (a.reasoning) {
        lines.push(`- **AI Reasoning:** ${a.reasoning}`);
      }
      if (a.failureReason) {
        lines.push(`- **Failure Reason:** ${a.failureReason}`);
      }
      lines.push('');
    }
  }

  if (data.finalFix) {
    lines.push('## Final Fix Applied');
    lines.push('');
    lines.push(`- **Type:** ${data.finalFix.fixType}`);
    lines.push(`- **Locator:** \`${data.finalFix.newLocator}\``);
    lines.push(`- **Confidence:** ${(data.finalFix.confidence * 100).toFixed(1)}%`);
    lines.push(`- **Source:** ${data.finalFix.source}`);
    lines.push(`- **Reasoning:** ${data.finalFix.reasoning}`);
    lines.push('');
  }

  if (data.filesModified.length > 0) {
    lines.push('## Files Modified');
    lines.push('');
    for (const f of data.filesModified) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  if (data.historyStats) {
    const s = data.historyStats;
    lines.push('## Repair History Stats');
    lines.push('');
    lines.push(`- **Total repairs:** ${s.total}`);
    lines.push(`- **Successes:** ${s.successes}`);
    lines.push(`- **Failures:** ${s.failures}`);
    lines.push(`- **Avg attempts:** ${s.avgAttempts.toFixed(1)}`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated by ${data.meta.generator}*`);

  return lines.join('\n');
}

/**
 * Generate a combined summary report for multiple test repairs.
 *
 * @param {object[]} sessionResults - Array of results from multiple tests
 * @returns {object} { jsonPath, markdownPath }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function generateSummaryReport(sessionResults) {
  ensureReportDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const summary = {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'AI-Driven Self-Healing Report Generator v1.0',
    },
    totalTests: sessionResults.length,
    passed: sessionResults.filter((r) => r.success).length,
    failed: sessionResults.filter((r) => !r.success).length,
    totalAttempts: sessionResults.reduce((sum, r) => sum + (r.attempts || 0), 0),
    tests: sessionResults.map((r) => ({
      testName: r.testName,
      success: r.success,
      attempts: r.attempts || 0,
      reason: r.reason || null,
    })),
    historyStats: historyStore.getStats(),
  };

  const jsonPath = path.join(REPORT_DIR, `summary-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(`\n  [Report] Summary report: ${path.basename(jsonPath)}`);
  console.log(`    Tests: ${summary.passed}/${summary.totalTests} passed`);
  console.log(`    Total repair attempts: ${summary.totalAttempts}`);

  return { jsonPath, summary };
}

/**
 * Ensure the report directory exists.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function ensureReportDir() {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
}

/**
 * Replace non-safe chars in filenames.
 *
 * @param {string} str
 * @returns {string}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9-_]/g, '-').substring(0, 60);
}
