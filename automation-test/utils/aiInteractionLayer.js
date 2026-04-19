import { chatCompletion, isLlmAvailable } from './llmService.js';
import governance from '../config/governance.js';

/**
 * AI Interaction Layer - Calls LLM to get repair suggestions.
 *
 * IMPORTANT ARCHITECTURE NOTE:
 * - The actual AI is the LLM model (GPT-4, Claude, Llama, etc.)
 * - Cursor IDE is the TOOL used to interact with the LLM
 * - This module handles the API call and response parsing
 *
 * When no LLM API is available, this module provides a mock
 * response using heuristic-based locator suggestions.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

/**
 * Send a repair prompt to the LLM and parse the response.
 *
 * @param {object} prompt - { systemPrompt, userPrompt } from promptBuilder
 * @returns {Promise<object>} Parsed repair suggestion
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function requestRepair(prompt) {
  console.log(`  [AI-Layer] Requesting repair from LLM...`);

  if (!isLlmAvailable()) {
    console.log(`  [AI-Layer] No LLM configured. Using mock heuristic response.`);
    return buildMockResponse(prompt.userPrompt);
  }

  try {
    const response = await chatCompletion(
      prompt.systemPrompt,
      prompt.userPrompt,
      {
        temperature: governance.llm.temperature,
        max_tokens: governance.llm.maxTokensPerPrompt,
        response_format: { type: 'json_object' },
      }
    );

    if (!response) {
      console.log(`  [AI-Layer] LLM returned empty response, falling back to mock.`);
      return buildMockResponse(prompt.userPrompt);
    }

    const parsed = parseAiResponse(response);
    console.log(`  [AI-Layer] LLM response:`);
    console.log(`    - Fix type: ${parsed.fixType}`);
    console.log(`    - New locator: ${parsed.newLocator || 'N/A'}`);
    console.log(`    - Confidence: ${(parsed.confidence * 100).toFixed(1)}%`);
    console.log(`    - Reasoning: ${parsed.reasoning}`);

    return parsed;
  } catch (error) {
    console.error(`  [AI-Layer] LLM call failed: ${error.message}`);
    return buildMockResponse(prompt.userPrompt);
  }
}

/**
 * Parse the raw LLM JSON response into a structured repair suggestion.
 *
 * @param {string} rawResponse
 * @returns {object}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function parseAiResponse(rawResponse) {
  try {
    const parsed = JSON.parse(rawResponse);
    return {
      fixType: parsed.fixType || 'locator_update',
      newLocator: parsed.newLocator || null,
      codePatch: parsed.codePatch || null,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
      reasoning: parsed.reasoning || '',
      alternativeLocators: Array.isArray(parsed.alternativeLocators)
        ? parsed.alternativeLocators
        : [],
      raw: rawResponse,
      source: 'llm',
    };
  } catch {
    console.error(`  [AI-Layer] Failed to parse LLM response as JSON`);
    return {
      fixType: 'locator_update',
      newLocator: null,
      codePatch: null,
      confidence: 0,
      reasoning: 'Failed to parse LLM response',
      alternativeLocators: [],
      raw: rawResponse,
      source: 'llm_parse_error',
    };
  }
}

/**
 * Build a mock response when no LLM is available.
 * Uses simple heuristics to guess the new locator.
 *
 * @param {string} promptText
 * @returns {object}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function buildMockResponse(promptText) {
  const locatorMatch = promptText.match(/Old locator:\s*`([^`]+)`/) ||
    promptText.match(/Failing locator[^`]*`([^`]+)`/) ||
    promptText.match(/FAILING LOCATOR\s*\n`([^`]+)`/);

  const oldLocator = locatorMatch ? locatorMatch[1] : '';

  const domSection = promptText.match(/```html\n([\s\S]*?)```/);
  const dom = domSection ? domSection[1] : '';

  const alternatives = extractCandidatesFromDom(oldLocator, dom);

  return {
    fixType: 'locator_update',
    newLocator: alternatives[0] || null,
    codePatch: null,
    confidence: alternatives.length > 0 ? 0.5 : 0,
    reasoning: 'Mock response (no LLM available). Used DOM heuristics.',
    alternativeLocators: alternatives.slice(1, 4),
    raw: null,
    source: 'mock_heuristic',
  };
}

/**
 * Extract candidate selectors from DOM HTML using simple patterns.
 *
 * @param {string} oldLocator
 * @param {string} dom
 * @returns {string[]}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function extractCandidatesFromDom(oldLocator, dom) {
  const candidates = [];

  const idPattern = /id="([^"]+)"/g;
  let match;
  while ((match = idPattern.exec(dom)) !== null) {
    candidates.push(`#${match[1]}`);
  }

  const testIdPattern = /data-testid="([^"]+)"/g;
  while ((match = testIdPattern.exec(dom)) !== null) {
    candidates.push(`[data-testid="${match[1]}"]`);
  }

  const oldId = oldLocator.startsWith('#') ? oldLocator.slice(1) : '';
  if (oldId) {
    const keywords = oldId.split(/[-_]/).filter(Boolean);
    return candidates.filter((c) => {
      const cId = c.startsWith('#') ? c.slice(1) : c;
      return keywords.some((k) => cId.toLowerCase().includes(k.toLowerCase()));
    });
  }

  return candidates.slice(0, 5);
}

/**
 * Validate if a repair suggestion meets governance rules.
 *
 * @param {object} suggestion - From requestRepair
 * @param {object} context - From contextCollector
 * @returns {object} { approved, reason, needsReview }
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function validateRepair(suggestion, context) {
  if (!suggestion.newLocator && !suggestion.codePatch) {
    return { approved: false, reason: 'No fix suggested', needsReview: false };
  }

  if (suggestion.confidence < governance.confidenceThreshold.reject) {
    return { approved: false, reason: `Confidence too low: ${(suggestion.confidence * 100).toFixed(1)}%`, needsReview: false };
  }

  const isCritical = governance.criticalFlows.some((flow) =>
    (context.testName || '').toLowerCase().includes(flow) ||
    (context.currentUrl || '').toLowerCase().includes(flow)
  );

  if (isCritical && !governance.allowAutoFixCritical) {
    return {
      approved: false,
      reason: `Critical flow detected: requires manual review`,
      needsReview: true,
    };
  }

  const needsReview = suggestion.confidence < governance.confidenceThreshold.autoApply;

  return {
    approved: true,
    reason: needsReview ? 'Approved with review flag' : 'Auto-approved (high confidence)',
    needsReview,
  };
}
