/**
 * tuckzed mods — Auth Nav Helper
 * Included on every page. Updates the shared navigation bar to reflect
 * the current Firebase auth state (signed-out / user / admin).
 */

'use strict';

(function initAuthNav() {

  /**
   * Called by onAuthStateChanged — updates the nav to reflect auth state.
   * @param {firebase.User|null} user
   */
  function applyNavState(user) {
    const uploadLink  = document.getElementById('nav-upload');
    const signinLink  = document.getElementById('nav-signin');
    const userPill    = document.getElementById('nav-user-pill');
    const userLabel   = document.getElementById('nav-user-label');
    const signoutBtn  = document.getElementById('nav-signout-btn');

    if (!uploadLink || !signinLink) return; // nav not present

    if (user) {
      // ── Signed in ───────────────────────────────────────────
      const isAdmin = user.email.toLowerCase() === window.TZ_AUTH.ADMIN_EMAIL.toLowerCase();

      // "Upload Mods" → admin.html for admin, restricted notice for others
      uploadLink.href = isAdmin ? 'admin.html' : '#';
      if (!isAdmin) {
        uploadLink.addEventListener('click', e => {
          e.preventDefault();
          window.TZ?.showToast('Upload access is restricted to admins.');
        });
      }

      // Show user pill, hide sign-in link
      signinLink.style.display = 'none';
      if (userPill)  userPill.style.display  = '';
      if (userLabel) userLabel.textContent    = isAdmin ? '⚡ Admin' : user.email.split('@')[0];
      if (signoutBtn) {
        signoutBtn.onclick = async () => {
          await window.TZ_AUTH.signOut();
          // Redirect away from admin panel if on it
          if (window.location.pathname.includes('admin.html')) {
            window.location.href = 'index.html';
          }
        };
      }
    } else {
      // ── Signed out ──────────────────────────────────────────
      uploadLink.href = 'auth.html?redirect=upload';
      signinLink.style.display = '';
      if (userPill) userPill.style.display = 'none';
    }
  }

  // Wait for Firebase to load, then attach the listener
  function attachListener() {
    if (window.TZ_AUTH && window.TZ_AUTH.onChange) {
      window.TZ_AUTH.onChange(applyNavState);
    } else {
      setTimeout(attachListener, 50);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachListener);
  } else {
    attachListener();
  }
})();
