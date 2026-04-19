/**
 * V1 locators for Dashboard and Profile pages.
 * These are the "original" locators that match UI Version 1.
 * When UI switches to V2, these will BREAK.
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
