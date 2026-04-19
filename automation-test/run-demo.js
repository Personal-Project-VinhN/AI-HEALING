import { execSync } from 'child_process';

/**
 * Demo runner: executes all 6 scenarios sequentially
 * and displays a comparison of results.
 *
 * Scenario 1: UI V1 + Traditional tests             => PASS
 * Scenario 2: UI V2 + Traditional tests             => FAIL
 * Scenario 3: UI V2 + Rule-based healing tests      => PASS
 * Scenario 4: UI V2 + AI-driven healing tests       => PASS
 * Scenario 5: UI V2 + LLM-powered healing tests     => PASS
 * Scenario 6: UI V2 + Self-Repair (AI loop) tests   => PASS
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const DIVIDER = '═'.repeat(60);
const includeRepair = process.argv.includes('--include-repair');

function runCommand(cmd, description) {
  console.log(`\n${DIVIDER}`);
  console.log(`  ${description}`);
  console.log(DIVIDER);

  try {
    execSync(cmd, {
      stdio: 'inherit',
      env: { ...process.env },
      cwd: process.cwd(),
    });
    return { success: true };
  } catch (error) {
    return { success: false, exitCode: error.status };
  }
}

function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║   🧬 AI-DRIVEN SELF-HEALING AUTOMATION DEMO                ║');
  console.log('║   with LLM Integration + Self-Repair                       ║');
  console.log('║                                                            ║');
  console.log('║   Comparing: Traditional vs Rule-Based vs AI-Driven        ║');
  console.log('║              vs LLM-Powered vs Self-Repair                  ║');
  console.log('║                                                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const results = [];

  const r1 = runCommand(
    'npx cross-env UI_VERSION=1 npx playwright test tests/traditional/ --reporter=list',
    '🟢 SCENARIO 1: UI V1 + Traditional Tests (expect: PASS)'
  );
  results.push({ scenario: 'UI V1 + Traditional', expected: 'PASS', actual: r1.success ? 'PASS' : 'FAIL' });

  const r2 = runCommand(
    'npx cross-env UI_VERSION=2 npx playwright test tests/traditional/ --reporter=list',
    '🔴 SCENARIO 2: UI V2 + Traditional Tests (expect: FAIL)'
  );
  results.push({ scenario: 'UI V2 + Traditional', expected: 'FAIL', actual: r2.success ? 'PASS' : 'FAIL' });

  const r3 = runCommand(
    'npx cross-env UI_VERSION=2 npx playwright test tests/self-healing/ --reporter=list',
    '🔧 SCENARIO 3: UI V2 + Rule-Based Healing (expect: PASS)'
  );
  results.push({ scenario: 'UI V2 + Rule-Based', expected: 'PASS', actual: r3.success ? 'PASS' : 'FAIL' });

  const r4 = runCommand(
    'npx cross-env UI_VERSION=2 npx playwright test tests/ai-healing/ --reporter=list',
    '🧠 SCENARIO 4: UI V2 + AI-Driven Healing (expect: PASS)'
  );
  results.push({ scenario: 'UI V2 + AI-Driven', expected: 'PASS', actual: r4.success ? 'PASS' : 'FAIL' });

  const r5 = runCommand(
    'npx cross-env UI_VERSION=2 npx playwright test tests/llm-healing/ --reporter=list',
    '🤖 SCENARIO 5: UI V2 + LLM-Powered Healing (expect: PASS)'
  );
  results.push({ scenario: 'UI V2 + LLM-Powered', expected: 'PASS', actual: r5.success ? 'PASS' : 'FAIL' });

  if (includeRepair) {
    const r6 = runCommand(
      'npx cross-env UI_VERSION=2 npx playwright test tests/self-repair/ --reporter=list',
      '🔄 SCENARIO 6: UI V2 + Self-Repair Loop (expect: PASS)'
    );
    results.push({ scenario: 'UI V2 + Self-Repair', expected: 'PASS', actual: r6.success ? 'PASS' : 'FAIL' });
  }

  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    DEMO RESULTS SUMMARY                      ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  for (const r of results) {
    const match = r.expected === r.actual;
    const icon = match ? '✅' : '⚠️';
    const status = `${r.actual.padEnd(4)} (expected: ${r.expected})`;
    console.log(`║  ${icon} ${r.scenario.padEnd(25)} => ${status.padEnd(28)}║`);
  }

  console.log('╠══════════════════════════════════════════════════════════════╣');

  const allMatch = results.every((r) => r.expected === r.actual);
  if (allMatch) {
    console.log('║                                                            ║');
    console.log('║  🎉 All scenarios matched expected results!                ║');
    console.log('║                                                            ║');
    console.log('║  Evolution of test healing:                                ║');
    console.log('║  Gen 0: Traditional  - brittle, breaks on UI change       ║');
    console.log('║  Gen 1: Rule-Based   - keyword + synonym fallback         ║');
    console.log('║  Gen 2: AI-Driven    - profile scoring + confidence       ║');
    console.log('║  Gen 3: LLM-Powered  - semantic similarity + LLM judge   ║');
    if (includeRepair) {
      console.log('║  Gen 4: Self-Repair  - AI loop + code patch + report     ║');
    }
    console.log('║                                                            ║');
  } else {
    console.log('║                                                            ║');
    console.log('║  ⚠️  Some scenarios did not match expectations.            ║');
    console.log('║  Note: LLM/Self-Repair mode needs API key.                ║');
    console.log('║  Falls back to static scoring without it.                  ║');
    console.log('║                                                            ║');
  }

  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n📂 Check ./healed-locators/ for healing result JSON files.');
  console.log('📂 Check ./repair-reports/ for self-repair reports.');
  console.log('💡 Run "npm run sync:healed" to update source locators from cache.');
  console.log('💡 Run "npm run generate:tests" to auto-generate test cases with LLM.');
  if (!includeRepair) {
    console.log('💡 Run "npm run test:demo:full" to include Gen 4 Self-Repair scenario.\n');
  }
}

main();
