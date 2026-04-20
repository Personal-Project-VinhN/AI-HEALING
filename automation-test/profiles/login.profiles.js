/**
 * Element profiles for the Login page.
 *
 * Each profile captures the "fingerprint" of an element based on its
 * semantic properties. When a locator fails, the healing engine
 * compares this profile against live DOM candidates to find the best match.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export const loginProfiles = {
  loginForm: {
    logicalName: 'loginForm',
    page: 'login',
    actionType: 'verify',
    selector: '[data-testid="login-form"]',
    tag: 'div',
    role: null,
    type: null,
    text: '',
    label: '',
    placeholder: '',
    attributes: { 'data-testid': 'login-form' },
    parentContext: 'div.login-container',
    nearbyText: ['Welcome', 'Login', 'Username', 'Password'],
  },

  usernameInput: {
    logicalName: 'usernameInput',
    page: 'login',
    actionType: 'fill',
    selector: '#username',
    tag: 'input',
    role: 'textbox',
    type: 'text',
    text: '',
    label: 'Username',
    placeholder: 'Enter your username',
    attributes: { name: 'username', 'aria-label': 'Username', id: 'username' },
    parentContext: 'form',
    nearbyText: ['Username', 'Password', 'Login'],
  },

  passwordInput: {
    logicalName: 'passwordInput',
    page: 'login',
    actionType: 'fill',
    selector: '#password',
    tag: 'input',
    role: null,
    type: 'password',
    text: '',
    label: 'Password',
    placeholder: 'Enter your password',
    attributes: { name: 'password', 'aria-label': 'Password', id: 'password' },
    parentContext: 'form',
    nearbyText: ['Username', 'Password', 'Login'],
  },

  loginButton: {
    logicalName: 'loginButton',
    page: 'login',
    actionType: 'click',
    selector: '#login-btn',
    tag: 'button',
    role: 'button',
    type: 'submit',
    text: 'Login',
    label: '',
    placeholder: '',
    attributes: { id: 'login-btn', 'data-action': 'login' },
    parentContext: 'form',
    nearbyText: ['Username', 'Password', 'Login'],
  },

  errorMessage: {
    logicalName: 'errorMessage',
    page: 'login',
    actionType: 'verify',
    selector: '[data-testid="error-msg"]',
    tag: 'div',
    role: null,
    type: null,
    text: '',
    label: '',
    placeholder: '',
    attributes: { 'data-testid': 'error-msg', class: 'error-message' },
    parentContext: 'div.login-card',
    nearbyText: ['Please fill in all fields', 'Invalid credentials'],
  },
};
