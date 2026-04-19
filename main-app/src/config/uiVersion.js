/**
 * UI Version configuration.
 * Version 1: original locators (id="login-btn", id="username", text="Login")
 * Version 2: changed locators (id="signin-btn", id="email", text="Sign in")
 * Switchable via VITE_UI_VERSION env or ?v= URL param.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function getUIVersion() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlVersion = urlParams.get('v');
  if (urlVersion) return parseInt(urlVersion, 10);

  const envVersion = import.meta.env.VITE_UI_VERSION;
  if (envVersion) return parseInt(envVersion, 10);

  return 1;
}
