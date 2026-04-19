import { chatCompletion, isLlmAvailable } from './llmService.js';

/**
 * LLM-as-Judge for resolving ambiguous healing candidates.
 *
 * When multiple candidates have close similarity scores, the LLM
 * acts as an intelligent judge, analyzing the full context to
 * pick the best match. This replaces simple threshold-based
 * decisions with semantic reasoning.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const JUDGE_SYSTEM_PROMPT = `You are an expert UI test automation engineer specializing in element identification.

Your task: Given an ORIGINAL element profile and a list of CANDIDATE elements from a changed UI, determine which candidate is the BEST match for the original element.

Consider:
1. Semantic meaning (e.g., "Username" and "Email Address" both mean login identifier)
2. Functional purpose (what action the element serves)
3. Structural context (where the element sits in the page)
4. Visual/text similarity (labels, placeholders, button text)

Respond in JSON format:
{
  "bestIndex": <0-based index of best candidate>,
  "confidence": <"high"|"medium"|"low">,
  "reasoning": "<brief explanation>"
}

If no candidate is a good match, set bestIndex to -1 and confidence to "low".`;

/**
 * Ask the LLM to judge between ambiguous candidates.
 *
 * @param {object} profile - Original element profile
 * @param {object[]} candidates - Top candidates with scores
 * @returns {Promise<{bestIndex: number, confidence: string, reasoning: string}|null>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function judgeCandidate(profile, candidates) {
  if (!isLlmAvailable()) return null;
  if (!candidates || candidates.length === 0) return null;

  const judgeEnabled = process.env.LLM_JUDGE_ENABLED !== 'false';
  if (!judgeEnabled) return null;

  const userPrompt = buildJudgePrompt(profile, candidates);

  try {
    console.log(`  🧑‍⚖️ [LLM-Judge] Evaluating ${candidates.length} ambiguous candidates for "${profile.logicalName}"...`);

    const response = await chatCompletion(JUDGE_SYSTEM_PROMPT, userPrompt, {
      temperature: 0.05,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    if (!response) return null;

    const result = JSON.parse(response);
    console.log(`  🧑‍⚖️ [LLM-Judge] Verdict: candidate #${result.bestIndex} (${result.confidence}) - ${result.reasoning}`);
    return result;
  } catch (error) {
    console.error(`  ❌ [LLM-Judge] Error: ${error.message}`);
    return null;
  }
}

/**
 * Build the user prompt for the LLM judge with element details.
 *
 * @param {object} profile
 * @param {object[]} candidates
 * @returns {string}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function buildJudgePrompt(profile, candidates) {
  const profileDesc = [
    `Logical Name: ${profile.logicalName}`,
    `Page: ${profile.page}`,
    `Action: ${profile.actionType}`,
    `Original Selector: ${profile.selector}`,
    `Tag: <${profile.tag}>`,
    `Role: ${profile.role || 'none'}`,
    `Text: "${profile.text || ''}"`,
    `Label: "${profile.label || ''}"`,
    `Placeholder: "${profile.placeholder || ''}"`,
    `Nearby Text: [${(profile.nearbyText || []).join(', ')}]`,
    `Attributes: ${JSON.stringify(profile.attributes || {})}`,
  ].join('\n');

  const candidateDescs = candidates.map((c, i) => {
    const cand = c.candidate;
    return [
      `--- Candidate #${i} (static score: ${(c.total * 100).toFixed(1)}%) ---`,
      `  Selector: ${cand.cssSelector}`,
      `  Tag: <${cand.tag}>`,
      `  Role: ${cand.role || 'none'}`,
      `  Text: "${cand.text || ''}"`,
      `  Label: "${cand.label || ''}"`,
      `  Placeholder: "${cand.placeholder || ''}"`,
      `  Nearby Text: [${(cand.nearbyText || []).slice(0, 5).join(', ')}]`,
      `  Attributes: ${JSON.stringify(cand.attributes || {})}`,
    ].join('\n');
  }).join('\n\n');

  return `## ORIGINAL ELEMENT PROFILE\n${profileDesc}\n\n## CANDIDATES\n${candidateDescs}`;
}

/**
 * Check if two candidates are "ambiguous" (scores too close).
 * Used to decide whether to invoke the LLM judge.
 *
 * @param {number} score1 - Best candidate score
 * @param {number} score2 - Second-best candidate score
 * @param {number} threshold - Max gap to consider ambiguous (default 0.08)
 * @returns {boolean}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function isAmbiguous(score1, score2, threshold = 0.08) {
  return Math.abs(score1 - score2) <= threshold;
}
