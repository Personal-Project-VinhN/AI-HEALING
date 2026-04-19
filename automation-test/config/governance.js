/**
 * Human governance configuration for AI-driven self-repair.
 *
 * Controls thresholds, retry limits, and flags repairs
 * that require human review. NOT in the execution flow -
 * only provides configuration values.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

const governance = {
  maxRetryAttempts: 3,

  confidenceThreshold: {
    autoApply: 0.80,
    needsReview: 0.40,
    reject: 0.30,
  },

  criticalFlows: [
    'login',
    'checkout',
    'payment',
    'password-reset',
  ],

  allowAutoFixCritical: false,

  repair: {
    maxFileChangesPerAttempt: 3,
    backupBeforePatch: true,
    allowSourceCodeModification: true,
    allowLocatorOnlyFix: true,
  },

  reporting: {
    outputDir: 'repair-reports',
    generateMarkdown: true,
    generateJson: true,
    includeScreenshots: true,
    includeDomSnapshots: true,
  },

  llm: {
    maxTokensPerPrompt: 4000,
    temperature: 0.1,
    timeoutMs: 30000,
  },
};

export default governance;
