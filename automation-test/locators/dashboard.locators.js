/**
 * Locators for Dashboard and Profile pages.
 * These locators are outdated and will be healed automatically.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export const dashboardLocators = {
  pageTitle: '#dashboard-title',
  totalUsers: '#total-users',
  activeSessions: '#active-sessions',
  reports: '#reports',
  userTable: '#user-table',
  navDashboard: '#nav-dashboard',
  navProfile: '#nav-profile',
  logoutButton: '#logout-btn',
};

export const profileLocators = {
  firstName: '#first-name',
  lastName: '#last-name',
  userEmail: '#user-email',
  userRole: '#user-role',
  saveButton: '#save-btn',
  cancelButton: '#cancel-btn',
  successMessage: '[data-testid="success-message"]',
  profileForm: '[data-testid="profile-form"]',
};
