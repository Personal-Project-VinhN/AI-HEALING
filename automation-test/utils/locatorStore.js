import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, '..', 'healed-locators', 'locator-cache.json');

/**
 * Persistent store for healed locators.
 * When a locator is healed, the mapping is saved so future runs
 * can reuse the healed locator without re-healing.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
class LocatorStore {
  constructor() {
    this.cache = this.load();
  }

  load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
      }
    } catch {
      // Ignore corrupt cache
    }
    return {};
  }

  save() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  /**
   * Get a cached healed locator for the given original locator.
   * @param {string} originalLocator
   * @returns {{ strategy: string, healedLocator: string } | null}
   */
  get(originalLocator) {
    return this.cache[originalLocator] || null;
  }

  /**
   * Store a healed locator mapping.
   * @param {string} originalLocator
   * @param {string} strategy
   * @param {string} healedLocator
   */
  set(originalLocator, strategy, healedLocator) {
    this.cache[originalLocator] = {
      strategy,
      healedLocator,
      healedAt: new Date().toISOString(),
    };
    this.save();
  }

  clear() {
    this.cache = {};
    this.save();
  }
}

export const locatorStore = new LocatorStore();
