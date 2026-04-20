import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTEXT_DIR = path.join(__dirname, '..', 'healing-context');
const WORKSPACE_DIR = path.resolve(__dirname, '..', '..');

const AGENT_TIMEOUT_MS = 180_000;

/**
 * Cursor Agent Healer.
 *
 * Reads healing context files (DOM snapshot + profiles + error info),
 * builds a structured prompt, and invokes Cursor Agent CLI
 * (`agent -p --force`) to automatically fix broken locators
 * and profile files.
 *
 * Requires Cursor Desktop installed with `agent` CLI available in PATH.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

/**
 * Check if Cursor Agent CLI is available.
 *
 * @returns {boolean}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function isCursorAgentAvailable() {
  try {
    execSync('agent --version', { stdio: 'pipe', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a healing prompt from a context file for Cursor Agent.
 *
 * @param {object} context - Healing context from *.context.json
 * @returns {string} Prompt text
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function buildPrompt(context) {
  const { failedLocator, profile, locatorSource, domElements, errorMessage, currentUrl } = context;

  const relevantEls = (domElements?.relevant || []).slice(0, 20);
  const allIdEls = (domElements?.allWithId || []).slice(0, 30);

  const domList = [...new Map(
    [...relevantEls, ...allIdEls].map((el) => [el.id || el.dataTestId || el.name || el.text, el])
  ).values()]
    .map((el) => {
      const parts = [`<${el.tag}>`];
      if (el.id) parts.push(`id="${el.id}"`);
      if (el.dataTestId) parts.push(`data-testid="${el.dataTestId}"`);
      if (el.name) parts.push(`name="${el.name}"`);
      if (el.type) parts.push(`type="${el.type}"`);
      if (el.label) parts.push(`label="${el.label}"`);
      if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
      if (el.ariaLabel) parts.push(`aria-label="${el.ariaLabel}"`);
      if (el.dataAction) parts.push(`data-action="${el.dataAction}"`);
      if (el.text) parts.push(`text="${el.text.substring(0, 60)}"`);
      return `  - ${parts.join(' ')}`;
    })
    .join('\n');

  const profileInfo = profile
    ? [
        `  logicalName: ${profile.logicalName}`,
        `  page: ${profile.page}`,
        `  actionType: ${profile.actionType}`,
        `  tag: ${profile.tag}`,
        `  role: ${profile.role || 'N/A'}`,
        `  label: "${profile.label || ''}"`,
        `  placeholder: "${profile.placeholder || ''}"`,
      ].join('\n')
    : '  (no profile available)';

  const locatorFile = locatorSource
    ? `automation-test/${locatorSource.file}`
    : 'automation-test/locators/';

  const profileFile = profile?._profileFile
    ? `automation-test/profiles/${profile._profileFile}`
    : 'automation-test/profiles/';

  const locatorKey = locatorSource
    ? `${locatorSource.exportName}.${locatorSource.key}`
    : 'unknown';

  return `You are a Self-Healing Test Automation Engineer.

A Playwright test is failing because the locator \`${failedLocator}\` no longer exists in the current DOM.

## Failure Info
- Locator key: ${locatorKey}
- Page URL: ${currentUrl}
- Error: ${errorMessage.substring(0, 300)}

## Element Profile (semantic fingerprint)
${profileInfo}

## Current DOM Elements on the page
${domList}

## Task
1. Analyze the DOM elements above and find the element that best matches the profile.
2. Determine the correct new CSS selector for that element (prefer #id > [data-testid] > [name]).
3. In file \`${locatorFile}\`, find the key \`${locatorSource?.key || 'unknown'}\` and update its selector value from \`${failedLocator}\` to the new selector.
4. In file \`${profileFile}\`, find the matching profile entry and update:
   - The \`selector\` field to the new selector
   - The \`id\` inside \`attributes\` if the selector is an ID selector
5. Do NOT change any other fields, structure, or formatting.
6. Do NOT create new files.`;
}

/**
 * Invoke Cursor Agent CLI to fix a single broken locator.
 *
 * @param {string} prompt - The healing prompt
 * @param {string} contextName - Name for logging
 * @returns {{ success: boolean, output: string, durationMs: number }}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function invokeCursorAgent(prompt, contextName) {
  const startTime = Date.now();

  const promptFile = path.join(CONTEXT_DIR, `_prompt_${contextName}.txt`);
  fs.writeFileSync(promptFile, prompt, 'utf-8');

  try {
    const escapedPromptFile = promptFile.replace(/\\/g, '/');
    const escapedWorkspace = WORKSPACE_DIR.replace(/\\/g, '/');

    const cmd = `agent -p --force --trust --workspace "${escapedWorkspace}" "$(cat '${escapedPromptFile}')"`;

    let output;
    try {
      output = execSync(cmd, {
        timeout: AGENT_TIMEOUT_MS,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: WORKSPACE_DIR,
        shell: true,
      });
    } catch (shellErr) {
      const promptContent = fs.readFileSync(promptFile, 'utf-8');
      const cmdWin = `agent -p --force --trust --workspace "${escapedWorkspace}" "${promptContent.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

      output = execSync(cmdWin, {
        timeout: AGENT_TIMEOUT_MS,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: WORKSPACE_DIR,
      });
    }

    const durationMs = Date.now() - startTime;
    return { success: true, output: output || '', durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const stderr = error.stderr?.toString() || '';
    const stdout = error.stdout?.toString() || '';
    return {
      success: false,
      output: `EXIT CODE: ${error.status}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`,
      durationMs,
    };
  } finally {
    try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
  }
}

/**
 * Run Cursor Agent healing on all context files.
 *
 * Reads each *.context.json, builds a prompt with DOM + profile info,
 * and calls `agent -p --force` to let the LLM fix the locator/profile files.
 *
 * @returns {Promise<object>} { totalProcessed, totalFixed, totalFailed, fixes, healingMethod }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function cursorAgentHeal() {
  if (!isCursorAgentAvailable()) {
    console.log('  ❌ Cursor Agent CLI (`agent`) not found in PATH.');
    console.log('     Make sure Cursor Desktop is installed and `agent` is accessible.');
    console.log('     On Windows: check if Cursor added agent to PATH.');
    console.log('     Alternatively, run `npm run heal:fix-rule` for rule-based fallback.\n');
    return {
      totalProcessed: 0,
      totalFixed: 0,
      totalFailed: 0,
      fixes: [],
      healingMethod: 'cursor-agent',
      error: 'Agent CLI not available',
    };
  }

  if (!fs.existsSync(CONTEXT_DIR)) {
    console.log('  ❌ No healing context found. Run "npm run heal:collect" first.');
    return { totalProcessed: 0, totalFixed: 0, totalFailed: 0, fixes: [], healingMethod: 'cursor-agent' };
  }

  const contextFiles = fs.readdirSync(CONTEXT_DIR)
    .filter((f) => f.endsWith('.context.json'));

  if (contextFiles.length === 0) {
    console.log('  ❌ No context files found.');
    return { totalProcessed: 0, totalFixed: 0, totalFailed: 0, fixes: [], healingMethod: 'cursor-agent' };
  }

  console.log(`\n  🤖 Cursor Agent healing ${contextFiles.length} broken locator(s)...\n`);

  const fixes = [];
  let totalFixed = 0;
  let totalFailed = 0;

  for (const file of contextFiles) {
    const contextPath = path.join(CONTEXT_DIR, file);
    const context = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
    const contextName = file.replace('.context.json', '');
    const locatorKey = context.locatorSource
      ? `${context.locatorSource.exportName}.${context.locatorSource.key}`
      : 'unknown';

    console.log(`  ── Healing: ${locatorKey} (${context.failedLocator})`);

    const prompt = buildPrompt(context);
    const result = invokeCursorAgent(prompt, contextName);

    if (result.success) {
      totalFixed++;
      console.log(`  ✅ Agent completed in ${(result.durationMs / 1000).toFixed(1)}s`);
    } else {
      totalFailed++;
      console.log(`  ❌ Agent failed after ${(result.durationMs / 1000).toFixed(1)}s`);
      if (result.output) {
        const preview = result.output.substring(0, 200);
        console.log(`     ${preview}`);
      }
    }

    fixes.push({
      locatorKey,
      failedLocator: context.failedLocator,
      prompt: prompt.substring(0, 500) + '...',
      agentSuccess: result.success,
      agentOutput: result.output.substring(0, 1000),
      durationMs: result.durationMs,
      status: result.success ? 'FIXED_BY_AGENT' : 'AGENT_FAILED',
    });
  }

  console.log(`\n  ── CURSOR AGENT SUMMARY ──────────────────────────`);
  console.log(`  Total processed: ${contextFiles.length}`);
  console.log(`  Fixed by Agent:  ${totalFixed}`);
  console.log(`  Failed:          ${totalFailed}`);
  console.log(`  ──────────────────────────────────────────────────\n`);

  return {
    totalProcessed: contextFiles.length,
    totalFixed,
    totalFailed,
    fixes,
    healingMethod: 'cursor-agent',
  };
}
