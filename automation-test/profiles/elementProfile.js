/**
 * Element Profile - Enhanced profile concept for AI-driven self-repair.
 *
 * An Element Profile goes beyond just a locator. It captures:
 * - logicalName: human-readable identifier
 * - page: which page this element belongs to
 * - actionType: what the test does with it (click, fill, select, verify)
 * - selector: the CSS/Playwright locator
 * - tag, role, type: HTML properties
 * - text, label, placeholder: visible content
 * - attributes: all relevant HTML attributes
 * - context: surrounding DOM structure
 * - intent: WHY this element is being interacted with
 *
 * The profile helps the AI understand the INTENT behind a locator,
 * not just the locator string itself.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

/**
 * Create a full element profile from minimal input.
 *
 * @param {object} params
 * @param {string} params.logicalName - Human-readable name (e.g., 'usernameInput')
 * @param {string} params.page - Page name (e.g., 'login')
 * @param {string} params.actionType - 'click' | 'fill' | 'select' | 'verify'
 * @param {string} params.selector - CSS/Playwright selector
 * @param {string} params.tag - HTML tag name
 * @param {object} [params.overrides] - Override any default profile fields
 * @returns {object} Full element profile
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function createProfile(params) {
  const { logicalName, page, actionType, selector, tag, overrides = {} } = params;

  return {
    logicalName,
    page,
    actionType,
    selector,
    tag: tag || inferTag(actionType),
    role: overrides.role || inferRole(tag, actionType),
    type: overrides.type || null,
    text: overrides.text || '',
    label: overrides.label || '',
    placeholder: overrides.placeholder || '',
    attributes: overrides.attributes || {},
    parentContext: overrides.parentContext || '',
    nearbyText: overrides.nearbyText || [],
    intent: overrides.intent || inferIntent(logicalName, actionType),
    ...overrides,
  };
}

/**
 * Infer HTML tag from action type.
 *
 * @param {string} actionType
 * @returns {string}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function inferTag(actionType) {
  const tagMap = {
    fill: 'input',
    click: 'button',
    select: 'select',
    verify: 'div',
  };
  return tagMap[actionType] || 'div';
}

/**
 * Infer ARIA role from tag and action.
 *
 * @param {string} tag
 * @param {string} actionType
 * @returns {string|null}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function inferRole(tag, actionType) {
  const roleMap = {
    button: 'button',
    a: 'link',
    input: 'textbox',
    select: 'combobox',
    textarea: 'textbox',
    table: 'table',
    nav: 'navigation',
    h1: 'heading', h2: 'heading', h3: 'heading',
  };
  return roleMap[tag] || null;
}

/**
 * Infer a human-readable intent from the element name and action.
 *
 * @param {string} logicalName
 * @param {string} actionType
 * @returns {string}
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
function inferIntent(logicalName, actionType) {
  const actionVerbs = {
    fill: 'Enter data into',
    click: 'Click on',
    select: 'Select option from',
    verify: 'Verify presence of',
  };
  const verb = actionVerbs[actionType] || 'Interact with';
  const readable = logicalName.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return `${verb} the ${readable}`;
}

/**
 * Enrich existing profiles with intent field.
 * Call this on legacy profiles to add the intent field.
 *
 * @param {object} profiles - Object map of profiles
 * @returns {object} Enriched profiles
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function enrichProfiles(profiles) {
  const enriched = {};
  for (const [key, profile] of Object.entries(profiles)) {
    enriched[key] = {
      ...profile,
      intent: profile.intent || inferIntent(profile.logicalName, profile.actionType),
    };
  }
  return enriched;
}
