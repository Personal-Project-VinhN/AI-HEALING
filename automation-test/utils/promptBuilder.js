/**
 * Prompt Builder - Creates structured prompts for AI/LLM analysis.
 *
 * Builds prompts that include:
 * - Intent of the failing step
 * - Old locator that failed
 * - DOM snapshot (relevant section)
 * - Error message
 * - Code snippet around failure
 * - Element profile for context
 *
 * The LLM (accessed via Cursor as intermediary tool) uses this
 * prompt to suggest a new locator or code patch.
 *
 * NOTE: Cursor is NOT the AI. Cursor is the tool/IDE used to
 * interact with the actual LLM model (e.g., GPT-4, Claude, Ollama).
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const SYSTEM_PROMPT = `You are a Senior QA Automation Engineer specialized in Playwright test repair.

Your task: Given a failing test step with full context, suggest a FIX.

You receive:
- The test intent (what the step is trying to do)
- The old locator that failed
- A DOM snapshot of the current page
- The error message
- The source code around the failure
- An element profile (if available)

You must respond in STRICT JSON format:
{
  "fixType": "locator_update" | "code_patch",
  "newLocator": "<new CSS/Playwright selector>",
  "codePatch": "<replacement code for the failing line(s)>" | null,
  "confidence": <0.0 to 1.0>,
  "reasoning": "<brief explanation of why this fix works>",
  "alternativeLocators": ["<backup selector 1>", "<backup selector 2>"]
}

Rules:
1. Prefer stable selectors: data-testid > aria-label > role > id > css
2. If the element clearly exists with a different selector, use "locator_update"
3. If the test logic needs changing, use "code_patch"
4. Provide confidence 0.0-1.0 based on how sure you are
5. Always provide at least 1 alternative locator
6. Keep code patches minimal - change only what's necessary`;

/**
 * Build a structured repair prompt from collected context.
 *
 * @param {object} context - From contextCollector
 * @param {number} attemptNumber - Current retry attempt (1-3)
 * @param {object[]} [previousAttempts] - Prior failed fixes for context
 * @returns {object} { systemPrompt, userPrompt }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function buildRepairPrompt(context, attemptNumber = 1, previousAttempts = []) {
  const sections = [];

  sections.push(`## REPAIR REQUEST (Attempt ${attemptNumber}/3)`);
  sections.push('');

  sections.push('### TEST INFO');
  sections.push(`- Test Name: ${context.testName || 'unknown'}`);
  sections.push(`- Step: ${context.stepDescription || 'unknown'}`);
  sections.push(`- Failure Type: ${context.failureType}`);
  sections.push(`- URL: ${context.currentUrl || 'unknown'}`);
  sections.push('');

  sections.push('### ERROR');
  sections.push('```');
  sections.push(context.errorMessage || 'No error message');
  sections.push('```');
  sections.push('');

  if (context.oldLocator) {
    sections.push('### FAILING LOCATOR');
    sections.push(`\`${context.oldLocator}\``);
    sections.push('');
  }

  if (context.elementProfile) {
    const p = context.elementProfile;
    sections.push('### ELEMENT PROFILE (original intent)');
    sections.push(`- Logical Name: ${p.logicalName}`);
    sections.push(`- Page: ${p.page}`);
    sections.push(`- Action: ${p.actionType}`);
    sections.push(`- Tag: <${p.tag}>`);
    sections.push(`- Role: ${p.role || 'none'}`);
    sections.push(`- Label: "${p.label || ''}"`);
    sections.push(`- Placeholder: "${p.placeholder || ''}"`);
    sections.push(`- Text: "${p.text || ''}"`);
    sections.push(`- Nearby Text: [${(p.nearbyText || []).join(', ')}]`);
    sections.push(`- Attributes: ${JSON.stringify(p.attributes || {})}`);
    sections.push('');
  }

  if (context.codeSnippet) {
    sections.push('### SOURCE CODE (around failing line)');
    sections.push(`File: ${context.codeFilePath || 'unknown'}`);
    sections.push(`Line: ${context.codeLineNumber || '?'}`);
    sections.push('```javascript');
    sections.push(context.codeSnippet);
    sections.push('```');
    sections.push('');
  }

  if (context.domHtml) {
    sections.push('### DOM SNAPSHOT (relevant section)');
    sections.push('```html');
    sections.push(context.domHtml.substring(0, 8000));
    sections.push('```');
    sections.push('');
  }

  if (previousAttempts.length > 0) {
    sections.push('### PREVIOUS FAILED ATTEMPTS');
    for (const attempt of previousAttempts) {
      sections.push(`- Attempt ${attempt.attemptNumber}: tried \`${attempt.newLocator || attempt.codePatch || 'unknown'}\` => FAILED (${attempt.failureReason || 'still broken'})`);
    }
    sections.push('');
    sections.push('IMPORTANT: The above fixes did NOT work. Try a DIFFERENT approach.');
    sections.push('');
  }

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: sections.join('\n'),
  };
}

/**
 * Build a simpler locator-only prompt (no code patch needed).
 *
 * @param {string} oldLocator
 * @param {string} domHtml
 * @param {object} [profile]
 * @returns {object} { systemPrompt, userPrompt }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function buildLocatorPrompt(oldLocator, domHtml, profile = null) {
  const sections = [
    '## LOCATOR REPAIR REQUEST',
    '',
    `Old locator: \`${oldLocator}\``,
    '',
  ];

  if (profile) {
    sections.push(`Intent: Find the "${profile.logicalName}" element (${profile.actionType} action, <${profile.tag}> tag)`);
    if (profile.label) sections.push(`Expected label: "${profile.label}"`);
    if (profile.placeholder) sections.push(`Expected placeholder: "${profile.placeholder}"`);
    sections.push('');
  }

  sections.push('### DOM');
  sections.push('```html');
  sections.push(domHtml.substring(0, 10000));
  sections.push('```');
  sections.push('');
  sections.push('Find the correct new selector for this element.');

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: sections.join('\n'),
  };
}

export { SYSTEM_PROMPT };
