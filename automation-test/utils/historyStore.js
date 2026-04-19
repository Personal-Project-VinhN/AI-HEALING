import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.join(__dirname, '..', 'repair-reports', 'repair-history.json');

/**
 * Persistent history store for self-repair attempts.
 * Tracks every repair cycle: old locator, new locator,
 * number of attempts, timestamp, and outcome.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
class HistoryStore {
  constructor() {
    this.history = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(HISTORY_PATH)) {
        return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
      }
    } catch {
      // Ignore corrupt history
    }
    return [];
  }

  _save() {
    const dir = path.dirname(HISTORY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(this.history, null, 2), 'utf-8');
  }

  /**
   * Record a repair attempt.
   *
   * @param {object} entry
   * @param {string} entry.testName
   * @param {string} entry.stepDescription
   * @param {string} entry.oldLocator
   * @param {string} entry.newLocator
   * @param {string} entry.fixType - 'locator_update' | 'code_patch'
   * @param {number} entry.attemptNumber
   * @param {boolean} entry.success
   * @param {number} entry.confidence
   * @param {string} entry.errorMessage
   * @param {string} entry.filePath - source file that was modified
   * @param {string} [entry.aiReasoning] - AI explanation
   * @author Gin<gin_vn@haldata.net>
   * @lastupdate Gin<gin_vn@haldata.net>
   */
  record(entry) {
    const record = {
      ...entry,
      timestamp: new Date().toISOString(),
      id: `repair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    this.history.push(record);
    this._save();
    return record;
  }

  /**
   * Get all history entries for a specific test.
   *
   * @param {string} testName
   * @returns {object[]}
   * @author Gin<gin_vn@haldata.net>
   * @lastupdate Gin<gin_vn@haldata.net>
   */
  getByTest(testName) {
    return this.history.filter((h) => h.testName === testName);
  }

  /**
   * Get the last N repair entries.
   *
   * @param {number} n
   * @returns {object[]}
   * @author Gin<gin_vn@haldata.net>
   * @lastupdate Gin<gin_vn@haldata.net>
   */
  getRecent(n = 20) {
    return this.history.slice(-n);
  }

  /**
   * Get repair statistics.
   *
   * @returns {object}
   * @author Gin<gin_vn@haldata.net>
   * @lastupdate Gin<gin_vn@haldata.net>
   */
  getStats() {
    const total = this.history.length;
    const successes = this.history.filter((h) => h.success).length;
    const failures = total - successes;
    const avgAttempts = total > 0
      ? this.history.reduce((sum, h) => sum + (h.attemptNumber || 1), 0) / total
      : 0;

    const byType = {};
    for (const h of this.history) {
      const key = h.fixType || 'unknown';
      byType[key] = (byType[key] || 0) + 1;
    }

    return { total, successes, failures, avgAttempts, byType };
  }

  clear() {
    this.history = [];
    this._save();
  }
}

export const historyStore = new HistoryStore();
