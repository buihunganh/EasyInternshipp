export const adminSessionKey = 'internships:admin-session';
export function hasAdminSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(adminSessionKey) || 'null');
    return session?.role === 'admin-demo' && Number.isFinite(session.expiresAt) && session.expiresAt > Date.now();
  } catch { return false; }
}
export function endAdminSession() {
  sessionStorage.removeItem(adminSessionKey);
  location.replace('/pages/admin-login/');
}
