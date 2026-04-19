import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, '..', 'healed-locators', 'locator-cache.json');
const LOCATORS_DIR = path.join(__dirname, '..', 'locators');
const PROFILES_DIR = path.join(__dirname, '..', 'profiles');

/**
 * Sync Healed Locators back to source files.
 *
 * Reads healed locator cache (locator-cache.json) and updates:
 * 1. locators/*.locators.js - Replace old CSS selectors with healed ones
 * 2. profiles/*.profiles.js - Update selector field in element profiles
 *
 * This implements "auto-update test case" functionality:
 * after AI healing discovers new selectors, this script
 * persists them into the source test artifacts so future runs
 * use the correct selectors directly (no healing needed).
 *
 * Usage: node generators/syncHealed.js [--dry-run]
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) {
    console.log('  ❌ No locator cache found at:', CACHE_PATH);
    console.log('  💡 Run tests with healing first to generate the cache.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
}

/**
 * Update a JavaScript source file by replacing old selectors with healed ones.
 *
 * @param {string} filePath - Path to .js file
 * @param {object} replacements - Map of { oldSelector: newSelector }
 * @param {boolean} dryRun - If true, only log changes without writing
 * @returns {number} Number of replacements made
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function updateSourceFile(filePath, replacements, dryRun) {
  if (!fs.existsSync(filePath)) return 0;

  let content = fs.readFileSync(filePath, 'utf-8');
  let changeCount = 0;
  const fileName = path.basename(filePath);

  for (const [oldSelector, newSelector] of Object.entries(replacements)) {
    const escapedOld = escapeForRegex(oldSelector);
    const patterns = [
      new RegExp(`'${escapedOld}'`, 'g'),
      new RegExp(`"${escapedOld}"`, 'g'),
      new RegExp(`\`${escapedOld}\``, 'g'),
    ];

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        const quote = content.includes(`'${oldSelector}'`) ? "'" : '"';
        const replacement = `${quote}${newSelector}${quote}`;
        const original = `${quote}${oldSelector}${quote}`;
        content = content.replace(new RegExp(escapeForRegex(original), 'g'), replacement);
        changeCount += matches.length;
        console.log(`  📝 [${fileName}] ${oldSelector} -> ${newSelector} (${matches.length} occurrence(s))`);
      }
    }
  }

  if (changeCount > 0 && !dryRun) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`  ✅ [${fileName}] Saved ${changeCount} change(s)`);
  } else if (changeCount > 0 && dryRun) {
    console.log(`  🔍 [${fileName}] Would save ${changeCount} change(s) (dry-run)`);
  }

  return changeCount;
}

function escapeForRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a replacement map from the cache.
 *
 * @param {object} cache - Locator cache contents
 * @returns {object} Map of { oldSelector: healedSelector }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function buildReplacementMap(cache) {
  const replacements = {};
  for (const [originalSelector, entry] of Object.entries(cache)) {
    if (entry.healedLocator && entry.healedLocator !== originalSelector) {
      replacements[originalSelector] = entry.healedLocator;
    }
  }
  return replacements;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  🔄 SYNC HEALED LOCATORS TO SOURCE FILES      ║');
  console.log('╚════════════════════════════════════════════════╝');
  if (dryRun) {
    console.log('  🔍 DRY RUN MODE - no files will be modified\n');
  }

  const cache = loadCache();
  const entries = Object.keys(cache).length;
  console.log(`  📦 Loaded ${entries} healed locator(s) from cache\n`);

  const replacements = buildReplacementMap(cache);
  const replCount = Object.keys(replacements).length;
  if (replCount === 0) {
    console.log('  ℹ️  No locator changes to sync (all selectors unchanged).');
    return;
  }
  console.log(`  🔧 ${replCount} selector(s) to update:\n`);
  for (const [old, healed] of Object.entries(replacements)) {
    console.log(`    ${old}  ->  ${healed}`);
  }
  console.log('');

  let totalChanges = 0;

  console.log('  📂 Updating locator files...');
  const locatorFiles = fs.existsSync(LOCATORS_DIR)
    ? fs.readdirSync(LOCATORS_DIR).filter((f) => f.endsWith('.js'))
    : [];
  for (const file of locatorFiles) {
    totalChanges += updateSourceFile(path.join(LOCATORS_DIR, file), replacements, dryRun);
  }

  console.log('\n  📂 Updating profile files...');
  const profileFiles = fs.existsSync(PROFILES_DIR)
    ? fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith('.js'))
    : [];
  for (const file of profileFiles) {
    totalChanges += updateSourceFile(path.join(PROFILES_DIR, file), replacements, dryRun);
  }

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log(`║  Total changes: ${totalChanges} replacement(s)`.padEnd(49) + '║');
  if (dryRun) {
    console.log('║  Mode: DRY RUN (no files written)              ║');
  } else {
    console.log('║  Mode: LIVE (files updated)                    ║');
  }
  console.log('╚════════════════════════════════════════════════╝');
  console.log('\n💡 After syncing, your test locators/profiles are updated.');
  console.log('   Next run will use new selectors directly (no healing needed).\n');
}

main();
