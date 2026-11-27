export const CHANNEL_ADMIN_TOKEN = '31415927';

const CHANNEL_ADMIN_SESSION_KEY = 'kukastream_channel_admin_token';

/**
 * Checks whether the channel admin token is present in the current URL query string
 * or has already been validated and persisted in sessionStorage during this session.
 * When detected in the URL, it is saved in sessionStorage for the rest of the session.
 */
export function hasChannelAdminToken(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const urlToken = new URLSearchParams(window.location.search).get('token');
    if (urlToken === CHANNEL_ADMIN_TOKEN) {
      try {
        window.sessionStorage.setItem(CHANNEL_ADMIN_SESSION_KEY, CHANNEL_ADMIN_TOKEN);
      } catch {
        // Ignore storage errors (e.g. restricted iframe or private mode)
      }
      return true;
    }
  } catch {
    // Ignore URL parsing errors
  }

  try {
    return window.sessionStorage.getItem(CHANNEL_ADMIN_SESSION_KEY) === CHANNEL_ADMIN_TOKEN;
  } catch {
    return false;
  }
}
