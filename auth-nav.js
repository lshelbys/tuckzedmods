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
    const uploadLi    = uploadLink ? uploadLink.parentElement : null;
    const signinLink  = document.getElementById('nav-signin');
    const userPill    = document.getElementById('nav-user-pill');
    const userLabel   = document.getElementById('nav-user-label');
    const signoutBtn  = document.getElementById('nav-signout-btn');

    if (!signinLink) return; // nav not present

    if (user) {
      // ── Signed in ─────────────────────────────────────────────
      const isAdmin = user.email.toLowerCase() === window.TZ_AUTH.ADMIN_EMAIL.toLowerCase();

      // Always hide "Upload Mods" when signed in
      if (uploadLi) uploadLi.style.display = 'none';

      // Hide "Sign In" link
      signinLink.style.display = 'none';

      // Show user pill
      if (userPill) userPill.style.display = '';

      if (isAdmin) {
        // Admin: make the label a clickable link back to the admin panel
        if (userLabel) {
          userLabel.textContent  = '⚡ Admin';
          userLabel.style.cursor = 'pointer';
          userLabel.title        = 'Go to Admin Panel';
          userLabel.setAttribute('role', 'button');
          userLabel.setAttribute('tabindex', '0');
          userLabel.onclick = function () {
            window.location.href = 'admin.html';
          };
          userLabel.onkeydown = function (e) {
            if (e.key === 'Enter' || e.key === ' ') window.location.href = 'admin.html';
          };
        }
      } else {
        // Regular user: label links to their profile page
        if (userLabel) {
          userLabel.textContent  = user.email.split('@')[0];
          userLabel.style.cursor = 'pointer';
          userLabel.title        = 'My Profile';
          userLabel.setAttribute('role', 'button');
          userLabel.setAttribute('tabindex', '0');
          userLabel.onclick = function () {
            window.location.href = 'profile.html';
          };
          userLabel.onkeydown = function (e) {
            if (e.key === 'Enter' || e.key === ' ') window.location.href = 'profile.html';
          };
        }
      }

      // Sign Out handler
      if (signoutBtn) {
        signoutBtn.onclick = async function () {
          if (confirm('Are you sure you want to sign out?')) {
            await window.TZ_AUTH.signOut();
            // Always redirect to homepage on sign-out
            window.location.href = 'index.html';
          }
        };
      }

    } else {
      // ── Signed out ────────────────────────────────────────────
      // Show "Upload Mods" and "Sign In" links
      if (uploadLi) uploadLi.style.display = '';
      if (uploadLink) uploadLink.href = 'auth.html?redirect=upload';
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
