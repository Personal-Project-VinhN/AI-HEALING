import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTEXT_DIR = path.join(__dirname, '..', 'healing-context');
const WORKSPACE_DIR = path.resolve(__dirname, '..', '..');

const AGENT_TIMEOUT_MS = 180_000;

/**
 * Resolve the full path to the Cursor Agent CLI binary.
 * Checks PATH first, then known install locations per platform.
 */
function resolveAgentPath() {
  // Try plain 'agent' from PATH first
  try {
    execSync('agent --version', { stdio: 'pipe', timeout: 10_000, shell: true });
    return 'agent';
  } catch { /* not in PATH */ }

  const homeDir = os.homedir();
  const candidates = process.platform === 'win32'
    ? [
        path.join(homeDir, 'AppData', 'Local', 'cursor-agent', 'agent.cmd'),
        path.join(homeDir, '.cursor', 'bin', 'agent.cmd'),
      ]
    : [
        path.join(homeDir, '.local', 'share', 'cursor-agent', 'agent'),
        path.join(homeDir, '.cursor', 'bin', 'agent'),
        '/usr/local/bin/agent',
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        execSync(`"${candidate}" --version`, { stdio: 'pipe', timeout: 10_000, shell: true });
        return candidate; // Return clean path — no surrounding quotes
      } catch { /* try next */ }
    }
  }

  return null;
}

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
let _agentCmd = undefined;

function isCursorAgentAvailable() {
  _agentCmd = resolveAgentPath();
  if (_agentCmd) {
    console.log(`  ✅ Found Cursor Agent CLI: ${_agentCmd}`);
  }
  return !!_agentCmd;
}

/**
 * Format DOM elements list for prompt.
 */
function formatDomElements(domElements) {
  const relevantEls = (domElements?.relevant || []).slice(0, 20);
  const allIdEls = (domElements?.allWithId || []).slice(0, 30);

  return [...new Map(
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
}

/**
 * Build a single batched prompt for ALL broken locators.
 * This sends one request to the agent instead of N requests.
 *
 * @param {Array<object>} contexts - Array of healing contexts
 * @returns {string} Combined prompt text
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function buildBatchPrompt(contexts) {
  const locatorsByPage = {};

  for (const context of contexts) {
    const pageUrl = context.currentUrl || 'unknown';
    if (!locatorsByPage[pageUrl]) {
      locatorsByPage[pageUrl] = { contexts: [], domElements: context.domElements };
    }
    locatorsByPage[pageUrl].contexts.push(context);
  }

  const filesToEdit = new Set();
  let locatorList = '';

  for (const [pageUrl, pageData] of Object.entries(locatorsByPage)) {
    locatorList += `\n### Page: ${pageUrl}\n`;
    locatorList += `DOM Elements:\n${formatDomElements(pageData.domElements)}\n\n`;
    locatorList += `Broken locators on this page:\n`;

    for (const ctx of pageData.contexts) {
      const { failedLocator, profile, locatorSource } = ctx;
      const locatorKey = locatorSource
        ? `${locatorSource.exportName}.${locatorSource.key}`
        : 'unknown';
      const locatorFile = locatorSource ? `automation-test/${locatorSource.file}` : '';
      const profileFile = profile?._profileFile ? `automation-test/profiles/${profile._profileFile}` : '';

      if (locatorFile) filesToEdit.add(locatorFile);
      if (profileFile) filesToEdit.add(profileFile);

      locatorList += `\n- **${locatorKey}**: \`${failedLocator}\`\n`;
      if (profile) {
        locatorList += `  Profile: tag=${profile.tag}, label="${profile.label || ''}", placeholder="${profile.placeholder || ''}", role=${profile.role || 'N/A'}\n`;
      }
      locatorList += `  File: \`${locatorFile}\` key=\`${locatorSource?.key || ''}\`\n`;
      locatorList += `  Profile file: \`${profileFile}\`\n`;
    }
  }

  return `You are a Self-Healing Test Automation Engineer.

Multiple Playwright test locators are broken and need to be fixed. Below is the list of ALL broken locators grouped by page, along with the current DOM elements on each page.

## Files to edit
${[...filesToEdit].map((f) => `- \`${f}\``).join('\n')}

## Broken Locators
${locatorList}

## Task
For EACH broken locator above:
1. Match it to the correct DOM element using the profile info (tag, label, placeholder, role).
2. Determine the new CSS selector (prefer #id > [data-testid] > [name]).
3. Update the locator file: change the selector value from the old to the new.
4. Update the profile file: change the \`selector\` field and \`id\` in \`attributes\` if applicable.

Rules:
- Fix ALL locators listed above in a single pass.
- Do NOT change any other fields, structure, or formatting.
- Do NOT create new files.
- Prefer #id selectors when an id attribute exists on the matching element.`;
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

  // Use forward slashes — both Windows and Unix accept them, avoids PS escape issues
  const promptFileFwd = promptFile.replace(/\\/g, '/');
  const workspaceFwd = WORKSPACE_DIR.replace(/\\/g, '/');
  const agentBin = _agentCmd || 'agent'; // Clean path, no surrounding quotes

  let runCmd;
  let scriptFile;

  if (process.platform === 'win32') {
    // Prefer agent.ps1 over agent.cmd to avoid the cmd.exe -> PS chain.
    // When agent.cmd is called, cmd.exe passes args via %* which corrupts multi-line strings.
    // Calling agent.ps1 directly keeps everything inside PowerShell.
    let agentRunner = agentBin;
    if (/agent\.cmd$/i.test(agentBin)) {
      const ps1Path = agentBin.replace(/agent\.cmd$/i, 'agent.ps1');
      if (fs.existsSync(ps1Path)) agentRunner = ps1Path;
    }
    const agentRunnerFwd = agentRunner.replace(/\\/g, '/');

    scriptFile = path.join(CONTEXT_DIR, `_run_${contextName}.ps1`);
    // Use array splatting to pass $p as a single argument regardless of newlines.
    // PS 5.1 can split unquoted multi-line variables when passed directly to &,
    // but array-splatted elements are always treated as individual arguments.
    const psScript = [
      `$p = Get-Content -Raw "${promptFileFwd}"`,
      `$agentArgs = @('-p', '--force', '--trust', '--workspace', "${workspaceFwd}", $p)`,
      `& "${agentRunnerFwd}" @agentArgs`,
    ].join('\n');
    fs.writeFileSync(scriptFile, psScript, 'utf-8');
    runCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`;
  } else {
    scriptFile = path.join(CONTEXT_DIR, `_run_${contextName}.sh`);
    const shScript = [
      '#!/bin/bash',
      `${agentBin.replace(/ /g, '\\ ')} -p --force --trust --workspace "${workspaceFwd}" "$(cat '${promptFileFwd}')"`,
    ].join('\n');
    fs.writeFileSync(scriptFile, shScript, 'utf-8');
    fs.chmodSync(scriptFile, 0o755);
    runCmd = `bash "${scriptFile}"`;
  }

  try {
    const output = execSync(runCmd, {
      timeout: AGENT_TIMEOUT_MS,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: WORKSPACE_DIR,
    });

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
    try { if (scriptFile) fs.unlinkSync(scriptFile); } catch { /* ignore */ }
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
    console.log('     Install: irm "https://cursor.com/install?win32=true" | iex');
    console.log('     Then run: agent login');
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

  console.log(`\n  🤖 Cursor Agent healing ${contextFiles.length} broken locator(s) in a SINGLE request...\n`);

  const contexts = contextFiles.map((file) => {
    const contextPath = path.join(CONTEXT_DIR, file);
    return JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
  });

  for (const ctx of contexts) {
    const locatorKey = ctx.locatorSource
      ? `${ctx.locatorSource.exportName}.${ctx.locatorSource.key}`
      : 'unknown';
    console.log(`  - ${locatorKey} (${ctx.failedLocator})`);
  }

  const prompt = buildBatchPrompt(contexts);
  console.log(`\n  📤 Sending batch prompt to Cursor Agent (${contexts.length} locators)...`);

  const result = invokeCursorAgent(prompt, 'batch-all');

  let totalFixed = 0;
  let totalFailed = 0;
  const fixes = [];

  if (result.success) {
    totalFixed = contexts.length;
    console.log(`  ✅ Agent completed in ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log(`     All ${contexts.length} locators processed in one request.`);
  } else {
    totalFailed = contexts.length;
    console.log(`  ❌ Agent failed after ${(result.durationMs / 1000).toFixed(1)}s`);
  }

  if (result.output?.trim()) {
    const preview = result.output.trim().substring(0, 800);
    console.log(`\n  📝 Agent output:\n${preview.split('\n').map((l) => `     ${l}`).join('\n')}`);
  }

  for (const ctx of contexts) {
    const locatorKey = ctx.locatorSource
      ? `${ctx.locatorSource.exportName}.${ctx.locatorSource.key}`
      : 'unknown';
    fixes.push({
      locatorKey,
      failedLocator: ctx.failedLocator,
      agentSuccess: result.success,
      durationMs: result.durationMs,
      status: result.success ? 'FIXED_BY_AGENT' : 'AGENT_FAILED',
    });
  }

  console.log(`\n  ── CURSOR AGENT SUMMARY ──────────────────────────`);
  console.log(`  Total locators:  ${contextFiles.length}`);
  console.log(`  API requests:    1`);
  console.log(`  Result:          ${result.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`  Duration:        ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log(`  ──────────────────────────────────────────────────\n`);

  return {
    totalProcessed: contextFiles.length,
    totalFixed,
    totalFailed,
    fixes,
    healingMethod: 'cursor-agent',
  };
}
