import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '..', 'healed-locators');

/**
 * Logger for self-healing attempts. Records which locators failed,
 * which strategy succeeded, and saves results for analysis.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
class HealingLogger {
  constructor() {
    this.logs = [];
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  /**
   * Log a healing attempt (success or failure).
   * @param {object} entry - { originalLocator, strategy, healedLocator, success, elementTag, timestamp }
   */
  log(entry) {
    const record = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    this.logs.push(record);

    const icon = record.success ? '✅' : '❌';
    const msg = record.success
      ? `${icon} HEALED: "${record.originalLocator}" -> [${record.strategy}] "${record.healedLocator}"`
      : `${icon} FAILED: "${record.originalLocator}" strategy [${record.strategy}]`;
    console.log(`  [Self-Healing] ${msg}`);
  }

  /**
   * Save all healing results to a JSON file for reuse.
   */
  saveResults(filename = 'healing-results.json') {
    const filePath = path.join(LOG_DIR, filename);
    const existing = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      : [];

    const merged = [...existing, ...this.logs];
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
    console.log(`\n  [Self-Healing] Results saved to ${filePath}`);
    console.log(`  [Self-Healing] Total healing records: ${merged.length}`);
  }

  /**
   * Generate summary report of healing attempts.
   */
  getSummary() {
    const total = this.logs.length;
    const successes = this.logs.filter((l) => l.success).length;
    const failures = total - successes;
    const strategies = {};

    this.logs
      .filter((l) => l.success)
      .forEach((l) => {
        strategies[l.strategy] = (strategies[l.strategy] || 0) + 1;
      });

    return { total, successes, failures, strategies };
  }

  printSummary() {
    const s = this.getSummary();
    console.log('\n  ╔══════════════════════════════════════════╗');
    console.log('  ║       SELF-HEALING SUMMARY REPORT        ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║  Total attempts:   ${String(s.total).padStart(4)}                 ║`);
    console.log(`  ║  Healed (success): ${String(s.successes).padStart(4)}  ✅              ║`);
    console.log(`  ║  Failed:           ${String(s.failures).padStart(4)}  ❌              ║`);
    console.log('  ╠══════════════════════════════════════════╣');
    console.log('  ║  Strategies used:                        ║');
    for (const [strategy, count] of Object.entries(s.strategies)) {
      const line = `    ${strategy}: ${count}`;
      console.log(`  ║  ${line.padEnd(38)}║`);
    }
    console.log('  ╚══════════════════════════════════════════╝');
  }
}

export const healingLogger = new HealingLogger();
