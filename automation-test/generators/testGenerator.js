import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { chatCompletion, isLlmAvailable } from '../utils/llmService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const OUTPUT_DIR = path.join(__dirname, '..', 'tests', 'llm-generated');
const PROFILES_DIR = path.join(__dirname, '..', 'profiles');

/**
 * LLM-powered test case generator.
 *
 * Reads element profiles and page source code, sends them to the LLM,
 * and generates Playwright test specs automatically.
 *
 * This demonstrates "auto-generate test cases with LLM" where:
 * 1. Profiles describe WHAT elements exist on each page
 * 2. LLM reasons about WHAT user scenarios should be tested
 * 3. LLM generates Playwright test code using the healing API
 *
 * Usage: node generators/testGenerator.js
 * Requires: OPENAI_API_KEY or OLLAMA_URL in .env
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const SYSTEM_PROMPT = `You are an expert test automation engineer.
You generate Playwright test specs using a self-healing test framework.

The framework provides these functions:
- llmFindElement(page, profile) - Find element with AI healing
- llmFill(page, profile, value) - Fill input with AI healing
- llmClick(page, profile) - Click element with AI healing
- llmSelect(page, profile, value) - Select option with AI healing
- printLlmHealingSummary() - Print healing report
- saveLlmHealingResults(filename) - Save results to JSON

Element profiles are imported from profile files and contain:
logicalName, page, actionType, selector, tag, role, text, label, placeholder, etc.

Rules:
1. Use @playwright/test for test structure
2. Always import llm healing functions from '../../utils/llmHealing.js'
3. Import profiles from '../../profiles/' directory
4. Use llmFill/llmClick/llmSelect instead of page.fill/page.click
5. Add afterAll hook with printLlmHealingSummary() and saveLlmHealingResults()
6. Include meaningful test descriptions
7. Cover: happy path, error scenarios, edge cases
8. Output ONLY valid JavaScript code, no markdown fences`;

/**
 * Read all profile files and build context for the LLM.
 *
 * @returns {string}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function loadProfileContext() {
  const files = fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith('.profiles.js'));
  const contexts = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(PROFILES_DIR, file), 'utf-8');
    contexts.push(`// --- ${file} ---\n${content}`);
  }

  return contexts.join('\n\n');
}

/**
 * Read main-app source files for additional context.
 *
 * @returns {string}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function loadPageSourceContext() {
  const pagesDir = path.join(__dirname, '..', '..', 'main-app', 'src', 'pages');
  const componentsDir = path.join(__dirname, '..', '..', 'main-app', 'src', 'components');
  const contexts = [];

  for (const dir of [pagesDir, componentsDir]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsx') || f.endsWith('.tsx'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      contexts.push(`// --- ${file} ---\n${content}`);
    }
  }

  return contexts.join('\n\n');
}

const TEST_SCENARIOS = [
  {
    name: 'login-scenarios',
    prompt: `Generate comprehensive Playwright test cases for the LOGIN page.

Include these test scenarios:
1. Display all login form elements
2. Submit with empty fields -> error message
3. Submit with wrong credentials -> error message  
4. Submit with correct credentials (admin/admin123) -> redirect to dashboard
5. Check that password field masks input

Import profiles from: '../../profiles/login.profiles.js'
Export name: loginProfiles

Generate the complete test file.`,
  },
  {
    name: 'dashboard-scenarios',
    prompt: `Generate comprehensive Playwright test cases for the DASHBOARD page.

Pre-condition: Must login first (admin/admin123) before each test.

Include these test scenarios:
1. Verify dashboard title is visible
2. Verify all 3 stat cards are visible (totalUsers, activeSessions, reports)
3. Verify data table is visible with correct headers
4. Navigate to Profile page via navbar
5. Logout and verify redirect to login

Import profiles from:
- '../../profiles/login.profiles.js' (loginProfiles)
- '../../profiles/dashboard.profiles.js' (dashboardProfiles)

Generate the complete test file.`,
  },
  {
    name: 'form-scenarios',
    prompt: `Generate comprehensive Playwright test cases for the PROFILE/FORM page.

Pre-condition: Must login and navigate to profile page before each test.

Include these test scenarios:
1. Verify profile form is visible
2. Fill all fields and submit -> success message
3. Submit with missing required fields -> error
4. Cancel button clears form
5. Fill form with different roles (admin, editor, viewer)

Import profiles from:
- '../../profiles/login.profiles.js' (loginProfiles) 
- '../../profiles/dashboard.profiles.js' (dashboardProfiles, profileProfiles)

Generate the complete test file.`,
  },
  {
    name: 'e2e-scenarios',
    prompt: `Generate a comprehensive END-TO-END test that covers the full user journey:

1. Login with valid credentials
2. Verify dashboard loads with stats and table
3. Navigate to profile page
4. Fill and submit the create user form
5. Verify success message
6. Navigate back to dashboard  
7. Logout

This should be ONE large test that validates the complete flow.

Import profiles from:
- '../../profiles/login.profiles.js' (loginProfiles)
- '../../profiles/dashboard.profiles.js' (dashboardProfiles, profileProfiles)

Generate the complete test file.`,
  },
];

/**
 * Generate a test file using LLM.
 *
 * @param {object} scenario
 * @param {string} profileContext
 * @param {string} pageContext
 * @returns {Promise<string|null>}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
async function generateTestFile(scenario, profileContext, pageContext) {
  const userPrompt = `${scenario.prompt}

## AVAILABLE ELEMENT PROFILES:
${profileContext}

## APPLICATION SOURCE CODE (for understanding UI behavior):
${pageContext}

Generate a complete, runnable Playwright test file. Output ONLY JavaScript code.`;

  const response = await chatCompletion(SYSTEM_PROMPT, userPrompt, {
    temperature: 0.2,
    max_tokens: 4000,
  });

  if (!response) return null;

  let code = response.trim();
  if (code.startsWith('```')) {
    code = code.replace(/^```(?:javascript|js)?\n?/, '').replace(/\n?```$/, '');
  }

  return code;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  🤖 LLM-POWERED TEST CASE GENERATOR                  ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  if (!isLlmAvailable()) {
    console.log('\n  ❌ No LLM provider configured.');
    console.log('  💡 Set OPENAI_API_KEY or OLLAMA_URL in .env file.');
    console.log('  📄 See .env.example for configuration options.\n');
    process.exit(1);
  }

  const profileContext = loadProfileContext();
  const pageContext = loadPageSourceContext();

  console.log(`  📋 Profile context: ${profileContext.length} chars`);
  console.log(`  📄 Page source context: ${pageContext.length} chars`);
  console.log(`  🎯 Scenarios to generate: ${TEST_SCENARIOS.length}\n`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let generated = 0;
  let failed = 0;

  for (const scenario of TEST_SCENARIOS) {
    console.log(`  🔄 Generating: ${scenario.name}...`);
    try {
      const code = await generateTestFile(scenario, profileContext, pageContext);

      if (code) {
        const outputPath = path.join(OUTPUT_DIR, `${scenario.name}.spec.js`);
        fs.writeFileSync(outputPath, code, 'utf-8');
        console.log(`    ✅ Saved: ${scenario.name}.spec.js (${code.length} chars)`);
        generated++;
      } else {
        console.log(`    ❌ No response from LLM`);
        failed++;
      }
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
      failed++;
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  ✅ Generated: ${generated} test file(s)`.padEnd(55) + '║');
  console.log(`║  ❌ Failed: ${failed} test file(s)`.padEnd(55) + '║');
  console.log(`║  📂 Output: tests/llm-generated/`.padEnd(55) + '║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  💡 Review generated tests before running!           ║');
  console.log('║  🔧 Run: npx playwright test tests/llm-generated/   ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
}

main().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
