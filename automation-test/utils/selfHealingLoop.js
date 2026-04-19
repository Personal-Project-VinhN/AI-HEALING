import { detectFailure } from './failureDetector.js';
import { collectContext } from './contextCollector.js';
import { buildRepairPrompt } from './promptBuilder.js';
import { requestRepair, validateRepair } from './aiInteractionLayer.js';
import { applyRepair, rollbackRepair } from './repairApplier.js';
import { historyStore } from './historyStore.js';
import governance from '../config/governance.js';

/**
 * Self-Healing Loop - The core orchestrator for AI-driven test self-repair.
 *
 * This is NOT a simple retry. Each iteration:
 * 1. ANALYZES the failure (what went wrong)
 * 2. COLLECTS full runtime context (screenshot, DOM, code)
 * 3. BUILDS a structured prompt with context + previous attempts
 * 4. ASKS the AI (LLM model) for a repair suggestion
 * 5. VALIDATES the suggestion against governance rules
 * 6. APPLIES the fix to source code
 * 7. RE-RUNS the test to verify
 * 8. If still failing → loops with improved context (max 3 attempts)
 *
 * Architecture:
 * - LLM = the actual AI (GPT-4, Claude, Llama, etc.)
 * - Cursor = the IDE tool used to interact with LLM
 * - This loop = orchestration logic
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

/**
 * Run the self-healing repair loop for a single failing test step.
 *
 * @param {object} params
 * @param {import('@playwright/test').Page} params.page - Playwright page
 * @param {Function} params.testFn - The test step function to retry
 * @param {string} params.testName - Name of the test
 * @param {string} params.stepDescription - What this step does
 * @param {object} [params.profile] - Element profile if available
 * @param {string} [params.locator] - The locator that may fail
 * @returns {Promise<object>} Result with success status and repair details
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function selfHealingLoop(params) {
  const { page, testFn, testName, stepDescription, profile, locator } = params;
  const maxAttempts = governance.maxRetryAttempts;
  const attempts = [];

  console.log(`\n  ╔═══════════════════════════════════════════════════════════╗`);
  console.log(`  ║  SELF-HEALING LOOP: ${testName.substring(0, 40).padEnd(40)}║`);
  console.log(`  ║  Step: ${(stepDescription || 'unknown').substring(0, 50).padEnd(50)}║`);
  console.log(`  ╚═══════════════════════════════════════════════════════════╝`);

  // Attempt 0: initial run
  try {
    console.log(`\n  [Loop] Initial run...`);
    await testFn();
    console.log(`  [Loop] PASSED on initial run.`);
    return { success: true, attempts: 0, repairs: [] };
  } catch (initialError) {
    console.log(`  [Loop] Initial run FAILED. Starting repair loop...`);

    const failure = detectFailure(initialError, {
      testName,
      stepDescription,
      locator,
    });

    if (!failure.isHealable) {
      console.log(`  [Loop] Failure type "${failure.type}" is NOT healable. Aborting.`);
      return {
        success: false,
        attempts: 0,
        repairs: [],
        reason: `Non-healable failure: ${failure.type}`,
        failure,
      };
    }

    let lastFailure = failure;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\n  ┌─────────────────────────────────────────┐`);
      console.log(`  │  REPAIR ATTEMPT ${attempt}/${maxAttempts}                        │`);
      console.log(`  └─────────────────────────────────────────┘`);

      // Step 1: Collect context (fresh page state each iteration)
      const context = await collectContext(page, lastFailure, profile);

      // Step 2: Build prompt (with history of previous attempts)
      const prompt = buildRepairPrompt(context, attempt, attempts);

      // Step 3: Ask AI for repair suggestion
      const suggestion = await requestRepair(prompt);

      // Step 4: Validate against governance
      const validation = validateRepair(suggestion, context);

      if (!validation.approved) {
        console.log(`  [Loop] Repair REJECTED: ${validation.reason}`);

        attempts.push({
          attemptNumber: attempt,
          suggestion,
          validation,
          applied: false,
          testPassed: false,
          failureReason: validation.reason,
        });

        historyStore.record({
          testName,
          stepDescription,
          oldLocator: context.oldLocator,
          newLocator: suggestion.newLocator,
          fixType: suggestion.fixType,
          attemptNumber: attempt,
          success: false,
          confidence: suggestion.confidence,
          errorMessage: validation.reason,
          filePath: context.codeFilePath,
          aiReasoning: suggestion.reasoning,
        });

        if (validation.needsReview) {
          console.log(`  [Loop] This fix needs HUMAN REVIEW. Stopping loop.`);
          return {
            success: false,
            attempts: attempt,
            repairs: attempts,
            reason: 'Requires human review',
            needsReview: true,
          };
        }
        continue;
      }

      // Step 5: Apply the fix
      const repairResult = applyRepair(suggestion, context);

      if (!repairResult.applied) {
        console.log(`  [Loop] Repair could not be applied: ${repairResult.reason}`);
        attempts.push({
          attemptNumber: attempt,
          suggestion,
          validation,
          applied: false,
          testPassed: false,
          failureReason: repairResult.reason,
        });
        continue;
      }

      // Step 6: Re-run the test
      console.log(`  [Loop] Re-running test after repair...`);
      try {
        await testFn();
        console.log(`  [Loop] TEST PASSED after attempt ${attempt}!`);

        attempts.push({
          attemptNumber: attempt,
          suggestion,
          validation,
          applied: true,
          testPassed: true,
          changes: repairResult.changes,
        });

        historyStore.record({
          testName,
          stepDescription,
          oldLocator: context.oldLocator,
          newLocator: suggestion.newLocator,
          fixType: suggestion.fixType,
          attemptNumber: attempt,
          success: true,
          confidence: suggestion.confidence,
          errorMessage: null,
          filePath: repairResult.filePath,
          aiReasoning: suggestion.reasoning,
        });

        console.log(`\n  ✅ SELF-HEALING SUCCESSFUL`);
        console.log(`    Attempts: ${attempt}`);
        console.log(`    Fix: ${suggestion.fixType}`);
        console.log(`    Locator: ${context.oldLocator} => ${suggestion.newLocator}`);
        console.log(`    File: ${repairResult.filePath}`);

        return {
          success: true,
          attempts: attempt,
          repairs: attempts,
          finalFix: suggestion,
          filePath: repairResult.filePath,
        };
      } catch (retryError) {
        console.log(`  [Loop] Test STILL FAILING after attempt ${attempt}.`);

        // Rollback this specific attempt before next iteration
        rollbackRepair(repairResult);

        lastFailure = detectFailure(retryError, {
          testName,
          stepDescription,
          locator: suggestion.newLocator || locator,
        });

        attempts.push({
          attemptNumber: attempt,
          suggestion,
          validation,
          applied: true,
          testPassed: false,
          failureReason: retryError.message,
          newLocator: suggestion.newLocator,
        });

        historyStore.record({
          testName,
          stepDescription,
          oldLocator: context.oldLocator,
          newLocator: suggestion.newLocator,
          fixType: suggestion.fixType,
          attemptNumber: attempt,
          success: false,
          confidence: suggestion.confidence,
          errorMessage: retryError.message,
          filePath: repairResult.filePath,
          aiReasoning: suggestion.reasoning,
        });
      }
    }

    console.log(`\n  ❌ SELF-HEALING FAILED after ${maxAttempts} attempts.`);
    return {
      success: false,
      attempts: maxAttempts,
      repairs: attempts,
      reason: `All ${maxAttempts} repair attempts failed`,
    };
  }
}

/**
 * Wrapper to use the healing loop with Playwright's test.step().
 * Integrates with existing test structure.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testName
 * @param {string} stepDescription
 * @param {Function} stepFn - async function that performs the test step
 * @param {object} [profile] - Element profile
 * @returns {Promise<object>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function healingStep(page, testName, stepDescription, stepFn, profile = null) {
  return selfHealingLoop({
    page,
    testFn: stepFn,
    testName,
    stepDescription,
    profile,
    locator: profile?.selector || null,
  });
}

/**
 * Convenience: Run a full test with self-healing loop wrapping each step.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} testName
 * @param {Array<{description: string, fn: Function, profile?: object}>} steps
 * @returns {Promise<object>} Combined results from all steps
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export async function runWithHealing(page, testName, steps) {
  const results = [];

  for (const step of steps) {
    const result = await healingStep(
      page,
      testName,
      step.description,
      step.fn,
      step.profile || null
    );

    results.push({
      step: step.description,
      ...result,
    });

    if (!result.success) {
      console.log(`  [Healing] Step "${step.description}" failed even after healing. Stopping.`);
      break;
    }
  }

  return {
    testName,
    totalSteps: steps.length,
    completedSteps: results.filter((r) => r.success).length,
    results,
    success: results.every((r) => r.success),
  };
}
