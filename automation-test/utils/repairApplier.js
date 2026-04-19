import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import governance from '../config/governance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, '..', 'repair-reports', 'backups');

/**
 * Repair Applier - Safely applies AI-suggested fixes to test source code.
 *
 * Two fix modes:
 * 1. locator_update: Replace old locator string with new one in source
 * 2. code_patch: Replace specific lines of code with AI-generated patch
 *
 * Safety features:
 * - Creates backup of original file before patching
 * - Validates patch doesn't corrupt file
 * - Can rollback changes if test still fails
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

/**
 * Apply a repair suggestion to the test source file.
 *
 * @param {object} suggestion - From aiInteractionLayer
 * @param {object} context - From contextCollector
 * @returns {object} { applied, filePath, backupPath, changes }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function applyRepair(suggestion, context) {
  if (suggestion.fixType === 'locator_update') {
    return applyLocatorUpdate(suggestion, context);
  }

  if (suggestion.fixType === 'code_patch') {
    return applyCodePatch(suggestion, context);
  }

  return {
    applied: false,
    reason: `Unknown fix type: ${suggestion.fixType}`,
    filePath: null,
    backupPath: null,
    changes: [],
  };
}

/**
 * Replace the old locator with the new one in source file.
 * Searches both the literal selector string AND the profile's
 * selector field in profile files, since test specs may reference
 * profiles rather than hard-coding selectors.
 *
 * @param {object} suggestion
 * @param {object} context
 * @returns {object}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function applyLocatorUpdate(suggestion, context) {
  if (!governance.repair.allowLocatorOnlyFix) {
    return { applied: false, reason: 'Locator-only fix disabled by governance', filePath: null, backupPath: null, changes: [] };
  }

  const oldLocator = context.oldLocator;
  const newLocator = suggestion.newLocator;

  if (!oldLocator || !newLocator) {
    return { applied: false, reason: 'Missing old or new locator', filePath: null, backupPath: null, changes: [] };
  }

  const profileFile = findProfileFileContaining(oldLocator);
  const targetFile = profileFile || context.codeFilePath;

  if (!targetFile || !fs.existsSync(targetFile)) {
    return { applied: false, reason: `No file containing "${oldLocator}" found`, filePath: targetFile, backupPath: null, changes: [] };
  }

  const backupPath = governance.repair.backupBeforePatch
    ? createBackup(targetFile)
    : null;

  try {
    let content = fs.readFileSync(targetFile, 'utf-8');
    const originalContent = content;

    const occurrences = countOccurrences(content, oldLocator);
    if (occurrences === 0) {
      return { applied: false, reason: `Old locator "${oldLocator}" not found in ${path.basename(targetFile)}`, filePath: targetFile, backupPath, changes: [] };
    }

    content = content.split(oldLocator).join(newLocator);

    fs.writeFileSync(targetFile, content, 'utf-8');

    console.log(`  [RepairApplier] Locator updated in ${path.basename(targetFile)}:`);
    console.log(`    "${oldLocator}" => "${newLocator}" (${occurrences} occurrence(s))`);

    return {
      applied: true,
      filePath: targetFile,
      backupPath,
      changes: [{
        type: 'locator_update',
        old: oldLocator,
        new: newLocator,
        occurrences,
        file: targetFile,
      }],
      originalContent,
    };
  } catch (error) {
    console.error(`  [RepairApplier] Failed to apply locator update: ${error.message}`);
    return { applied: false, reason: error.message, filePath: targetFile, backupPath, changes: [] };
  }
}

/**
 * Search profile and locator files for one containing the old selector.
 * The repair needs to update the profile/locator file where the selector
 * is defined, not the test spec that references it via variable.
 *
 * @param {string} selector
 * @returns {string|null} Absolute path to the file, or null
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function findProfileFileContaining(selector) {
  const searchDirs = [
    path.join(__dirname, '..', 'profiles'),
    path.join(__dirname, '..', 'locators'),
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes(selector)) {
          return filePath;
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  return null;
}

/**
 * Apply a code patch to specific lines in the source file.
 *
 * @param {object} suggestion
 * @param {object} context
 * @returns {object}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function applyCodePatch(suggestion, context) {
  if (!governance.repair.allowSourceCodeModification) {
    return { applied: false, reason: 'Source code modification disabled by governance', filePath: null, backupPath: null, changes: [] };
  }

  const filePath = context.codeFilePath;
  if (!filePath || !fs.existsSync(filePath)) {
    return { applied: false, reason: `Source file not found: ${filePath}`, filePath, backupPath: null, changes: [] };
  }

  if (!suggestion.codePatch) {
    return { applied: false, reason: 'No code patch provided', filePath, backupPath: null, changes: [] };
  }

  const backupPath = governance.repair.backupBeforePatch
    ? createBackup(filePath)
    : null;

  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    const lines = content.split('\n');
    const lineNum = context.codeLineNumber;

    if (lineNum && lineNum > 0 && lineNum <= lines.length) {
      const oldLine = lines[lineNum - 1];
      lines[lineNum - 1] = suggestion.codePatch;
      content = lines.join('\n');
      fs.writeFileSync(filePath, content, 'utf-8');

      console.log(`  [RepairApplier] Code patched at line ${lineNum} in ${path.basename(filePath)}:`);
      console.log(`    OLD: ${oldLine.trim()}`);
      console.log(`    NEW: ${suggestion.codePatch.trim()}`);

      return {
        applied: true,
        filePath,
        backupPath,
        changes: [{
          type: 'code_patch',
          lineNumber: lineNum,
          oldLine: oldLine.trim(),
          newLine: suggestion.codePatch.trim(),
        }],
        originalContent,
      };
    }

    return { applied: false, reason: `Invalid line number: ${lineNum}`, filePath, backupPath, changes: [] };
  } catch (error) {
    console.error(`  [RepairApplier] Failed to apply code patch: ${error.message}`);
    return { applied: false, reason: error.message, filePath, backupPath, changes: [] };
  }
}

/**
 * Rollback a repair by restoring the original content.
 *
 * @param {object} repairResult - From applyRepair
 * @returns {boolean}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function rollbackRepair(repairResult) {
  if (!repairResult.applied || !repairResult.filePath) return false;

  try {
    if (repairResult.originalContent) {
      fs.writeFileSync(repairResult.filePath, repairResult.originalContent, 'utf-8');
      console.log(`  [RepairApplier] Rolled back changes to ${path.basename(repairResult.filePath)}`);
      return true;
    }

    if (repairResult.backupPath && fs.existsSync(repairResult.backupPath)) {
      const backup = fs.readFileSync(repairResult.backupPath, 'utf-8');
      fs.writeFileSync(repairResult.filePath, backup, 'utf-8');
      console.log(`  [RepairApplier] Restored from backup: ${repairResult.backupPath}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`  [RepairApplier] Rollback failed: ${error.message}`);
    return false;
  }
}

/**
 * Create a backup of a file before patching.
 *
 * @param {string} filePath
 * @returns {string} Path to backup file
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function createBackup(filePath) {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const basename = path.basename(filePath);
  const backupName = `${basename}.${Date.now()}.bak`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  fs.copyFileSync(filePath, backupPath);
  console.log(`  [RepairApplier] Backup created: ${backupName}`);
  return backupPath;
}

/**
 * Count non-overlapping occurrences of a substring.
 *
 * @param {string} str
 * @param {string} sub
 * @returns {number}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function countOccurrences(str, sub) {
  let count = 0;
  let pos = 0;
  while ((pos = str.indexOf(sub, pos)) !== -1) {
    count++;
    pos += sub.length;
  }
  return count;
}
